import { describe, expect, it } from 'vitest';
import { addRuleDraftAct, removeRuleDraftAct, removeSectionDraftAct, updateRuleDraftAct, updateSectionDraftAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import {
	refusalOverDrafts,
	ruleChangeFingerprint,
	ruleChangeKey,
	ruleDraftCoherence,
	ruleDraftStartNodeIds,
	ruleLandingOperations,
	ruleOperationsIssue,
	statePathsDeclaredByDrafts,
	statePathsRead
} from './rule-drafts';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { withSolutionValidated } from './solution-validated.fixture';

/** The rules the whole product keeps, changed from a request (ac-evo-draft-rules). */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let n = 0;
const ctx: ActContext = { actor: ana, at: '2026-10-28T12:00:00.000Z', newId: () => `id${++n}`, soloWorkspace: true };
const ok = (o: ActOutcome): EvolutionRequest => {
	if (!o.ok) throw new Error(o.reason);
	return o.request;
};
const reason = (o: ActOutcome) => (o.ok ? '' : o.reason);
const fresh = () => withSolutionValidated({ ...createEvolutionRequest({ id: 'r1', title: 'Fix the problems', origin: 'technical_debt' }), stage: 'specification' as const });

const add = {
	kind: 'add_project_invariant',
	invariant: { name: 'A removed domain serves nothing', condition: { left: 'domain.removed', operator: 'is_false' }, message: 'A removed domain still answers.' }
};
const retire = { op: 'remove_project_invariant', invariantId: 'inv-old' };

describe('a request changes the rules the whole product keeps [criterion:ac-leaf-ac-evo-draft-rules]', () => {
	it('takes the invariant operations of apply_project_behavior_batch, and only those', () => {
		expect(ruleOperationsIssue([add, retire])).toBeNull();
		expect(ruleOperationsIssue([])).toBe('A change to the rules needs at least one operation.');
		expect(ruleOperationsIssue([{ kind: 'add_state_variable', path: 'x' }])).toMatch(/^Operation 1 \(add_state_variable\) is not a change to a rule the whole product keeps/);
	});

	it('is held on the request, checked by the engine first, and read back as it was written', () => {
		let request = ok(addRuleDraftAct(ctx, fresh(), { summary: 'A removed domain serves nothing', operations: [add] }, { refusal: null }));
		expect(request.ruleDrafts).toHaveLength(1);
		expect(reason(addRuleDraftAct(ctx, fresh(), { summary: 's', operations: [add] }, { refusal: 'The rules the whole product keeps would refuse this change: x' }))).toBe(
			'The rules the whole product keeps would refuse this change: x'
		);
		expect(reason(addRuleDraftAct(ctx, fresh(), { summary: '', operations: [add] }, { refusal: null }))).toBe('A change to the rules says what it changes, in a summary.');
		const id = request.ruleDrafts[0].id;
		request = ok(updateRuleDraftAct(ctx, request, id, { operations: [add, retire] }, { refusal: null }));
		expect(ruleLandingOperations(request.ruleDrafts).map((op) => op.kind)).toEqual(['add_project_invariant', 'remove_project_invariant']);
		const stored = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request] })), 'p');
		expect(stored.requests[0].ruleDrafts).toEqual(request.ruleDrafts);
		const key = ruleChangeKey(request.ruleDrafts[0]);
		expect(key).toMatch(/^element\.rules\./);
		expect(ruleChangeFingerprint(request.ruleDrafts[0])).not.toBe(ruleChangeFingerprint({ ...request.ruleDrafts[0], operations: [add] }));
		request = ok(removeRuleDraftAct(ctx, request, id));
		expect(request.ruleDrafts).toEqual([]);
	});

	it('reports a rule the engine proves broken with the change, and a change it refuses', () => {
		const request = ok(addRuleDraftAct(ctx, fresh(), { summary: 's', operations: [add] }, { refusal: null }));
		const broken = ruleDraftCoherence({
			request,
			proof: {
				moves: [
					{ invariantId: 'i1', invariantName: 'Every Link has an address', change: 'unchanged', before: 'proved', after: 'violated', summary: 'removing a domain leaves a link with none' },
					{ invariantId: 'i2', change: 'added', before: null, after: 'proved' }
				]
			}
		});
		expect(broken.map((f) => [f.severity, f.title])).toEqual([['blocking', 'With this change, the rule "Every Link has an address" would be broken: removing a domain leaves a link with none']]);
		expect(ruleDraftCoherence({ request, proof: { refused: 'op[0]: unknown state path' } })[0].title).toBe('The changes to the rules the whole product keeps do not validate: op[0]: unknown state path');
		expect(ruleDraftCoherence({ request, proof: null })).toEqual([]);
	});
});

describe('the product as the request would leave it [criterion:ac-leaf-ac-evo-draft-rules]', () => {
	it('reads the states a condition reads, on either side', () => {
		expect(statePathsRead({ kind: 'any', conditions: [{ kind: 'not', condition: { left: 'link.expired', operator: 'is_true' } }, { left: 'visit.destination', operator: 'equals', right: { kind: 'state', path: 'link.target' } }] }).sort()).toEqual([
			'link.expired',
			'link.target',
			'visit.destination'
		]);
	});

	it('counts the states the feature drafts declare, pending or landed in the same batch, never a removal\'s', () => {
		const op = (path: string) => ({ kind: 'add_state_definition', path });
		const declared = statePathsDeclaredByDrafts([
			{ kind: 'amend', behaviourModel: { operations: [op('link.expired'), { kind: 'update_state_definition', patch: { path: 'host.known' } }] } },
			{ kind: 'add', behaviourModel: { operations: [], landed: { operations: [op('visit.counted')] } } },
			{ kind: 'remove', behaviourModel: { operations: [op('never.there')] } }
		]);
		expect([...declared].sort()).toEqual(['host.known', 'link.expired', 'visit.counted']);
	});

	it('keeps of the engine refusal only what the drafts do not answer', () => {
		const sentence = (path: string) => `Project invariant i1 ("R"): reads state "${path}", which no feature of the project declares.`;
		expect(refusalOverDrafts([sentence('link.expired')], new Set(['link.expired']))).toEqual({ kept: [], deferredPaths: ['link.expired'] });
		expect(refusalOverDrafts([`${sentence('link.expired')}; ${sentence('link.gone')}`], new Set(['link.expired']))).toEqual({ kept: [sentence('link.gone')], deferredPaths: ['link.expired'] });
		expect(refusalOverDrafts(['op[0] (update_project_invariant): project invariant x not found'], new Set(['link.expired'])).kept).toEqual(['op[0] (update_project_invariant): project invariant x not found']);
	});

	it('says a rule reading a state only the drafts declare is proved once they land, without holding the gate', () => {
		const request = ok(addRuleDraftAct(ctx, fresh(), { summary: 's', operations: [add] }, { refusal: null }));
		const [finding] = ruleDraftCoherence({ request, proof: { moves: [], provedAtLanding: ['An expired link never sends a visitor to its target'] } });
		expect([finding.severity, finding.title]).toEqual(['minor', 'The rule "An expired link never sends a visitor to its target" reads a state only this request\'s changes declare: it is proved once they land']);
		expect(finding.note).toBe(true);
	});
});

describe('the impact walks from a change to the rules [criterion:ac-leaf-ac-evo-draft-section-impact]', () => {
	it('starts from the states its rules read and from the rule it changes or retires', () => {
		const request = ok(addRuleDraftAct(ctx, fresh(), { summary: 's', operations: [add, retire] }, { refusal: null }));
		expect(ruleDraftStartNodeIds(request.ruleDrafts).map((s) => s.nodeId)).toEqual(['state:domain.removed', 'rule:inv-old']);
	});
});

describe('an operation on a change names the field it needs [criterion:ac-leaf-ac-evo-draft-rules] [criterion:ac-leaf-ac-evo-draft-section]', () => {
	it('refuses a change to the rules named by nothing with the field, never an empty name', () => {
		const request = ok(addRuleDraftAct(ctx, fresh(), { summary: 's', operations: [add] }, { refusal: null }));
		expect(reason(updateRuleDraftAct(ctx, request, '', { summary: 'again' }, { refusal: null }))).toBe('update_rule_draft needs ruleDraftId: the id add_rule_draft answered (rules:...).');
		expect(reason(removeRuleDraftAct(ctx, request, ''))).toBe('remove_rule_draft needs ruleDraftId: the id add_rule_draft answered (rules:...).');
		expect(reason(removeRuleDraftAct(ctx, request, 'rules:nope'))).toBe('No change to the rules "rules:nope" on this request.');
	});

	it('refuses a section change named by nothing with the field, never an empty name', () => {
		expect(reason(updateSectionDraftAct(ctx, fresh(), '', { summary: 'again' }, { refusal: null }))).toBe('update_section_draft needs sectionDraftId: the id add_section_draft answered (section:...).');
		expect(reason(removeSectionDraftAct(ctx, fresh(), ''))).toBe('remove_section_draft needs sectionDraftId: the id add_section_draft answered (section:...).');
	});
});
