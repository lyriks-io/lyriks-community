import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import {
	ACTIONS_UNREAD,
	createDraftLeaf,
	createEvolutionRequest,
	isStepValidated,
	type Actor,
	type CodeTrack,
	type EvolutionRequest,
	type ImplementationFinding
} from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
// The freeze also reads the block Not validated in Knowledge (EVO-003): read here as empty.
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { applyEvolutionOperations } from './evolution-operations.server';
import { requestSummary, specificationEntriesOf, type EvolutionView } from './evolution-view.server';

/**
 * EVO-011, through the real batch of operations: the freeze follows the
 * validation of a person that leaves nothing of the Specification waiting, the
 * Build moves into Approval once its report and its branch are settled, and the
 * approval fixes the commit that goes live. Only the IO edges are faked: the
 * stores, the dossier loader and the engine port, which answers or stays silent.
 */
const NOW = '2026-11-20T10:00:00Z';
const rule = (id: string, description: string) => ({ id, category: 'business', description, condition: { left: 'cart.count', operator: 'greater_than', right: 20 }, effect: { type: 'block_action', reason: description } });
const action = (id: string, name: string, rules: unknown[]) => ({ id, name, intent: name, roles: [], rules, effects: [], scenarios: [] });
const feature = (actions: unknown[]) => ({ id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions }] });
const base = feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')])]);
const drafted = feature([action('a1', 'Pay', [rule('r1', 'At most 20 items')]), action('a3', 'Save for later', [rule('r3', 'A saved cart keeps its prices')])]);
const ACTION = { fieldPath: 'element.action:a3', leafId: 'feature:feat-1' };

/** The engine: whether it answers at all, and whether the drafted behaviour still applies to the feature. */
const engine = vi.hoisted(() => ({ answers: true, applies: true }));
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: NOW }));
const services = {
	clock: { nowIso: () => NOW },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {},
	codeAdoption: { available: false },
	readBehaviorFeature: { execute: async () => ({ feature: structuredClone(base) }) },
	simulateBehavior: {
		draftFeatureWalk: async () => (engine.answers ? { kind: 'walk', walk: { ok: true, feature: structuredClone(drafted) } } : null),
		execute: async () => (engine.answers ? { kind: 'walk', walk: engine.applies ? { ok: true } : { ok: false, errors: ['action a9 does not exist'] } } : null)
	}
} as unknown as AppServices;
const ana: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };
const anasAi: Actor = { ...ana, kind: 'ai_client', channel: 'ai_client' };

/** A request standing at the Impact analysis, its readings run and its critical answers given. */
function atImpact(over: Partial<EvolutionRequest> = {}): EvolutionRequest {
	const request = createEvolutionRequest({
		id: 'r',
		title: 'Save a cart for later',
		stage: 'coherence',
		leafIds: ['feat-1'],
		drafts: [
			createDraftLeaf({
				id: 'draft:r-1',
				kind: 'amend',
				baseLeafId: 'feat-1',
				objective: 'Keep a cart for later.',
				problem: 'Carts are lost.',
				value: 'Fewer lost sales.',
				acceptanceCriteria: [{ id: 'c1', text: 'A saved cart comes back with its prices.' }],
				behaviourModel: { operations: [{ kind: 'add_action' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' }
			})
		]
	});
	return {
		...request,
		need: { ...request.need, description: 'Save a cart.', situation: 'Carts are lost on logout.', objectives: 'A cart survives a logout.' },
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: '2026-11-20T09:00:00Z' },
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: '2026-11-20T09:00:00Z' },
		...over
	};
}

let current: EvolutionView;
function view(request: EvolutionRequest, members: readonly { id: string; name: string; role: string }[] = [], deploymentBranch?: string) {
	const features = { ...createEmptyFeaturesDraft('p'), features: [{ id: 'feat-1', name: 'Checkout', coreId: '' }] };
	current = {
		projectId: 'p',
		draft: { projectId: 'p', requests: [request], ...(deploymentBranch ? { deploymentBranch } : {}) },
		features,
		data: { entities: [], fields: [] },
		leaves: [{ id: 'feat-1', name: 'Checkout' }],
		sources: [],
		glossaryTerms: [],
		members,
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 1,
		language: 'en'
	} as unknown as EvolutionView;
	scene.view = current;
}
const run = (actor: Actor, operations: unknown[]) => applyEvolutionOperations(services, { projectId: 'p', operations, actor, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}
/** Every item the Specification asks a person to validate but its action, with the keys validate_field takes. */
const answersOf = (request: EvolutionRequest) =>
	specificationEntriesOf(current, request).map((e) => ({ op: 'validate_field', requestId: 'r', fieldPath: e.fieldPath, ...(e.leafId ? { leafId: e.leafId } : {}) }));
const validateAction = { op: 'validate_field', requestId: 'r', ...ACTION };
const automatic = (result: Awaited<ReturnType<typeof run>>) => result.results.filter((r) => r.summary.startsWith('Automatic:')).map((r) => r.summary);

beforeEach(() => {
	save.mockClear();
	engine.answers = true;
	engine.applies = true;
});

describe('the freeze follows the last validation of a person', () => {
	it("a person's validation that leaves nothing of the Specification waiting freezes the version in the same act, the history naming that person [criterion:ac-leaf-b84841c8-e413-4dfb-82d9-ee8476ba4ef6]", async () => {
		const request = atImpact();
		view(request);
		// Validate all: every item in one batch, the freeze after the last one only.
		const result = await run(ana, [...answersOf(request), validateAction]);
		expect(result.ok).toBe(true);
		const frozen = saved();
		expect(frozen.stage).toBe('implementation');
		expect(frozen.frozen).toBe(true);
		expect(frozen.specVersion).toBe(1);
		expect(automatic(result)).toHaveLength(1);
		expect(automatic(result)[0]).toContain('Crossed into implementation (spec frozen as version 1)');
		const entry = frozen.history.find((h) => h.type === 'spec_frozen');
		expect(entry).toMatchObject({ authorId: 'ana@example.test', authorKind: 'person', summary: 'Specification frozen as version 1' });
		expect(frozen.history.find((h) => h.type === 'stage_crossing' && h.summary === 'Crossed into implementation')?.authorId).toBe('ana@example.test');
		expect(frozen.freezeHeld).toBeUndefined();
	});

	it('a validation that leaves items waiting freezes nothing and says nothing of the freeze', async () => {
		const request = atImpact();
		view(request);
		const result = await run(ana, [answersOf(request)[0]]);
		expect(result.ok).toBe(true);
		expect(saved().stage).toBe('coherence');
		expect(automatic(result)).toEqual([]);
	});

	it('a validation completing the Specification freezes nothing while the readings have not run, a blocking finding is undecided or a critical answer is empty, and the foot says what holds it [criterion:ac-leaf-c39cfe76-a3c8-4f02-98cc-5e48071a3cab]', async () => {
		const cases: [Partial<EvolutionRequest>, string][] = [
			[{ coherenceReport: { status: 'not_run', projectScore: 0, requestDelta: 0, ranAt: null } }, 'The coherence check has not been run on this request.'],
			[
				{
					coherenceFindings: [
						{ id: 'coh-1', severity: 'blocking', axis: 'rules', title: 'Two rules contradict', detail: '', nodeIds: [], published: true, scope: 'request', risk: null } as unknown as EvolutionRequest['coherenceFindings'][number]
					]
				},
				'A blocking finding this change brings is still undecided. Fix it, accept it as a risk, or waive the gate with a stated reason.'
			]
		];
		for (const [over, reason] of cases) {
			save.mockClear();
			const request = atImpact(over);
			view(request);
			const result = await run(ana, [...answersOf(request), validateAction]);
			expect(result.ok).toBe(true);
			const kept = saved();
			expect(kept.stage).toBe('coherence');
			expect(kept.frozen).toBe(false);
			expect(automatic(result)).toEqual([`Automatic: Nothing was frozen: ${reason}`]);
			// The gate says it itself on the foot.
			expect(requestSummary(current, kept, ana).gate.reason).toBe(reason);
		}
		// A critical answer still empty: the objectives of the Need, on a request the readings found something to arbitrate on.
		save.mockClear();
		const minor = { id: 'coh-2', severity: 'minor', axis: 'rules', title: 'A wording to check', detail: '', nodeIds: [], published: true, scope: 'request', risk: null } as unknown as EvolutionRequest['coherenceFindings'][number];
		const empty = atImpact({ coherenceFindings: [minor] });
		const noObjectives = { ...empty, need: { ...empty.need, objectives: '' } };
		view(noObjectives);
		const result = await run(ana, [...answersOf(noObjectives), validateAction]);
		expect(saved().stage).toBe('coherence');
		expect(automatic(result)[0]).toMatch(/^Automatic: Nothing was frozen: Critical fields are still empty/);
	});

	it('a drafted behaviour that no longer applies freezes nothing, the validation is kept, and the foot says what holds the freeze [criterion:ac-leaf-c39cfe76-a3c8-4f02-98cc-5e48071a3cab]', async () => {
		const request = atImpact();
		view(request);
		engine.applies = false;
		const result = await run(ana, [...answersOf(request), validateAction]);
		expect(result.ok).toBe(true);
		const kept = saved();
		expect(kept.stage).toBe('coherence');
		expect(kept.fieldValidations.some((v) => v.key === 'element.action:a3@feature:feat-1')).toBe(true);
		expect(kept.freezeHeld?.reason).toMatch(/^The behaviour model of draft .* does not apply: action a9 does not exist\.$/);
		expect(kept.freezeHeld?.by).toBe('ana@example.test');
		// The dossier carries it to the foot, while the gate itself reads as met.
		const dossier = requestSummary(current, kept, ana);
		expect(dossier.gate.ok).toBe(true);
		expect(dossier.freezeHeld?.reason).toBe(kept.freezeHeld?.reason);
	});

	it('the engine silent when the last item is validated: the validation is kept, nothing froze, and Freeze version N stays offered with the reason [criterion:ac-leaf-c39cfe76-a3c8-4f02-98cc-5e48071a3cab]', async () => {
		const request = atImpact();
		view(request);
		const answers = answersOf(request);
		expect((await run(ana, [validateAction, ...answers.slice(0, -1)])).ok).toBe(true);
		const almost = saved();
		expect(almost.stage).toBe('coherence');
		save.mockClear();
		view(almost);
		engine.answers = false;
		const result = await run(ana, [answers.at(-1)!]);
		expect(result.ok).toBe(true);
		const kept = saved();
		expect(kept.stage).toBe('coherence');
		expect(kept.freezeHeld?.reason).toBe(ACTIONS_UNREAD);
		expect(automatic(result)).toEqual([`Automatic: Nothing was frozen: ${ACTIONS_UNREAD}`]);
		// Once the engine answers again, a person freezes it by hand and the note goes.
		save.mockClear();
		view(kept);
		engine.answers = true;
		expect((await run(ana, [{ op: 'cross_stage', requestId: 'r' }])).ok).toBe(true);
		expect(saved().stage).toBe('implementation');
		expect(saved().freezeHeld).toBeUndefined();
	});

	it('a validation an AI gives under delegation never freezes the version: Freeze version N waits for a person [criterion:ac-leaf-16778a7e-921c-44ff-bf07-9b80dd837e61]', async () => {
		const request = { ...atImpact(), aiDelegations: [{ personId: 'ana@example.test', at: '2026-11-20T08:00:00Z' }] };
		view(request);
		const result = await run(anasAi, [...answersOf(request), validateAction]);
		expect(result.ok).toBe(true);
		const kept = saved();
		expect(kept.stage).toBe('coherence');
		expect(kept.frozen).toBe(false);
		expect(kept.fieldValidations.some((v) => v.key === 'element.action:a3@feature:feat-1' && v.delegated)).toBe(true);
		expect(automatic(result)).toEqual([]);
		// The gate is met: the freeze waits for a person.
		expect(requestSummary(current, kept, ana).gate).toMatchObject({ next: 'implementation', ok: true });
	});

	it('Freeze version N stays offered to a person while the gate is met and nothing froze yet [criterion:ac-leaf-195da3fa-c756-47bb-b857-9aa95d073565]', async () => {
		// The AI of a person alone in the workspace validated everything, without delegation: nothing froze.
		const request = atImpact();
		view(request);
		expect((await run(anasAi, [...answersOf(request), validateAction])).ok).toBe(true);
		const waiting = saved();
		expect(waiting.stage).toBe('coherence');
		expect(requestSummary(current, waiting, ana).gate).toMatchObject({ next: 'implementation', ok: true });
		save.mockClear();
		view(waiting);
		const frozen = await run(ana, [{ op: 'cross_stage', requestId: 'r' }]);
		expect(frozen.ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'implementation', specVersion: 1 });
	});
});

describe('entering the Impact analysis on its own freezes nothing', () => {
	const writes = [
		{ op: 'update_step_description', requestId: 'r', step: 'solution', description: 'A cart can be saved for later.' },
		{ op: 'answer_step', requestId: 'r', step: 'solution', question: 'examples', answer: 'A saved cart comes back with its prices.' },
		{ op: 'update_step_description', requestId: 'r', step: 'functional_spec', description: 'The customer clicks Save for later.' },
		{ op: 'answer_step', requestId: 'r', step: 'functional_spec', question: 'refusals', answer: 'An empty cart is not saved.' },
		{ op: 'redraw_diagram', requestId: 'r', step: 'functional_spec', diagram: 'actor Customer\nuse case Save a cart: Customer\nflow Save a cart\nCustomer: clicks Save for later' },
		{ op: 'update_step_description', requestId: 'r', step: 'technical_spec', description: 'The cart is stored with its prices.' },
		{ op: 'redraw_diagram', requestId: 'r', step: 'technical_spec', diagram: 'component Saved carts: new' }
	];

	it('the last text written moves the request into the Impact analysis unfrozen; only a person\'s validation completing the Specification freezes it [criterion:ac-leaf-7a5b715b-8315-47b9-a877-b2252b57b4d8]', async () => {
		view(atImpact({ stage: 'specification', coherenceReport: { status: 'not_run', projectScore: 0, requestDelta: 0, ranAt: null } }));
		const written = await run(ana, writes);
		expect(written.ok).toBe(true);
		const entered = saved();
		expect(entered.stage).toBe('coherence');
		expect(entered.frozen).toBe(false);
		expect(entered.specVersion).toBe(0);
		expect(automatic(written).some((s) => s.includes('frozen'))).toBe(false);
		// Its readings back, the person's validation that leaves nothing waiting freezes it.
		save.mockClear();
		const ready = { ...entered, coherenceReport: { status: 'ready' as const, projectScore: 90, requestDelta: 0, ranAt: '2026-11-20T09:00:00Z' } };
		view(ready);
		expect((await run(ana, [...answersOf(ready), validateAction])).ok).toBe(true);
		expect(saved()).toMatchObject({ stage: 'implementation', frozen: true, specVersion: 1 });
	});
});

/** A report line of this request, as a sync left it. */
const line = (id: string, decision: ImplementationFinding['decision'] = 'undecided', verdict: ImplementationFinding['verdict'] = 'non_conform'): ImplementationFinding => ({
	id,
	iteration: 1,
	verdict,
	requirement: `Requirement ${id}`,
	filePath: 'src/cart.ts',
	lineRange: '10-20',
	specStatement: '',
	codeStatement: '',
	leafId: 'feat-1',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	scope: 'request',
	decision,
	decidedBy: decision === 'undecided' ? null : 'ana@example.test',
	decidedAt: decision === 'undecided' ? null : '2026-11-20T09:30:00Z'
});
const branch: CodeTrack = {
	repository: null,
	branch: 'evo/EVO-001-save-cart-later',
	baseCommit: 'b45e000',
	head: 'aaaaaaa1',
	codeHead: 'c0de001',
	clean: true,
	proofsChecked: 4,
	proofsOnOtherCommits: 0,
	reportedAt: '2026-11-20T09:00:00Z',
	commits: [{ sha: 'c0de001', at: '2026-11-20T09:00:00Z', clean: true }],
	history: null,
	validated: null,
	validationSetAside: false,
	merged: null
};
const atBuild = (lines: ImplementationFinding[], code: CodeTrack | undefined = branch): EvolutionRequest => ({
	...atImpact(),
	stage: 'implementation',
	frozen: true,
	specVersion: 1,
	implementationFindings: lines,
	iteration: 1,
	iterations: [{ number: 1, startedAt: '2026-11-20T08:30:00Z', brief: '', protectedLineIds: [], reportStatus: 'ready' }],
	...(code ? { code } : {})
});

describe('the Build moves into Approval on its own', () => {
	it('the decision that settles the last line of the request moves it into Approval, the page saying Verification closed, and fixes no commit [criterion:ac-leaf-21b6ca55-d413-44f5-8677-dc2a007fe954]', async () => {
		view(atBuild([line('l1', 'validated', 'conform'), line('l2')]), [], 'main');
		const result = await run(ana, [{ op: 'decide_line', requestId: 'r', lineId: 'l2', decision: 'validated' }]);
		expect(result.ok).toBe(true);
		const moved = saved();
		expect(moved.stage).toBe('acceptance');
		expect(moved.iterations.find((i) => i.number === moved.iteration)?.reportStatus).toBe('closed');
		expect(automatic(result)).toEqual(['Automatic: Verification closed: the evolution moves to acceptance testing']);
		expect(moved.code?.validated).toBeNull();
	});

	it('the Build stays while a line is undecided or sent back, or the branch holds uncommitted code or proofs on another commit [criterion:ac-leaf-21b6ca55-d413-44f5-8677-dc2a007fe954]', async () => {
		const held: [EvolutionRequest, string][] = [
			[atBuild([line('l1', 'validated'), line('l2'), line('l3')]), 'Lines of this report are still undecided.'],
			[atBuild([line('l1', 'invalidated'), line('l2')]), 'Lines were sent back to the build. Rebuild the report once the code changed.'],
			[atBuild([line('l1', 'validated'), line('l2')], { ...branch, clean: false }), 'The branch holds uncommitted code: commit it, run the tests again, then validate.'],
			[atBuild([line('l1', 'validated'), line('l2')], { ...branch, proofsOnOtherCommits: 2 }), '2 proofs were taken on another commit: run the tests on c0de001.']
		];
		for (const [request, reason] of held) {
			save.mockClear();
			view(request, [], 'main');
			const result = await run(ana, [{ op: 'decide_line', requestId: 'r', lineId: 'l2', decision: 'validated' }]);
			expect(result.ok).toBe(true);
			expect(saved().stage).toBe('implementation');
			expect(automatic(result)).toEqual([]);
			// What holds it is what the foot says beside Start acceptance testing.
			expect(requestSummary(current, saved(), ana).gate.reason).toBe(reason);
		}
	});
});

describe('the approval fixes the commit that goes live', () => {
	const inApproval = (code: CodeTrack = branch): EvolutionRequest => ({ ...atBuild([line('l1', 'validated', 'conform')], code), stage: 'acceptance' });

	it('the last approval awaited fixes the branch\'s last commit of code; a commit after it sets the approval aside and asks for it again [criterion:ac-leaf-b8d393ea-5850-4aae-9b9f-c42f81ec8b49]', async () => {
		view(inApproval(), [], 'main');
		const approved = await run(ana, [{ op: 'validate_step', requestId: 'r', step: 'approval' }, { op: 'cross_stage', requestId: 'r' }]);
		expect(approved.ok).toBe(true);
		const delivered = saved();
		expect(delivered.stage).toBe('delivered');
		expect(delivered.code?.validated).toEqual({ commit: 'c0de001', at: NOW, by: 'ana@example.test' });
		expect(delivered.history.at(-1)?.summary).toBe('Approval fixed evo/EVO-001-save-cart-later@c0de001 as the validated commit');

		// A commit of code after it: the approval is set aside and asked for again.
		save.mockClear();
		view(delivered, [], 'main');
		const report = { op: 'report_code_state', requestId: 'r', branch: branch.branch, head: 'aaaaaaa2', codeHead: 'c0de002', clean: true, proofsChecked: 4, proofsOnOtherCommits: 0 };
		expect((await run(anasAi, [report])).ok).toBe(true);
		const asked = saved();
		expect(asked.stage).toBe('acceptance');
		expect(asked.code?.validationSetAside).toBe(true);
		expect(isStepValidated(asked, 'approval')).toBe(false);
		expect(asked.history.at(-1)?.summary).toBe('The branch moved after the approval (now c0de002): the approval is asked again');

		// Approved again: the new commit is the validated one.
		save.mockClear();
		view(asked, [], 'main');
		expect((await run(ana, [{ op: 'validate_step', requestId: 'r', step: 'approval' }, { op: 'cross_stage', requestId: 'r' }])).ok).toBe(true);
		expect(saved().code?.validated?.commit).toBe('c0de002');
		expect(saved().code?.validationSetAside).toBe(false);
	});

	it('closing the verification lets go of a commit an earlier approval fixed, and the next approval fixes the branch\'s last commit of code [criterion:ac-leaf-b08f5488-396a-4ab9-955a-aa666d34b340]', async () => {
		// Approved once on c0de001, then sent back: version 2 is built on c0de002 and its last line is settled.
		const earlier: CodeTrack = { ...branch, codeHead: 'c0de002', head: 'aaaaaaa3', validated: { commit: 'c0de001', at: '2026-11-19T10:00:00Z', by: 'ana@example.test' }, validationSetAside: true };
		view(atBuild([line('l1', 'validated', 'conform'), line('l2')], earlier), [], 'main');
		expect((await run(ana, [{ op: 'decide_line', requestId: 'r', lineId: 'l2', decision: 'validated' }])).ok).toBe(true);
		const inApproval = saved();
		expect(inApproval.stage).toBe('acceptance');
		expect(inApproval.code).toMatchObject({ validated: null, validationSetAside: false });
		save.mockClear();
		view(inApproval, [], 'main');
		expect((await run(ana, [{ op: 'validate_step', requestId: 'r', step: 'approval' }, { op: 'cross_stage', requestId: 'r' }])).ok).toBe(true);
		expect(saved().code?.validated).toEqual({ commit: 'c0de002', at: NOW, by: 'ana@example.test' });
	});

	it('an approval is refused while an accepted remark is not written back, and fixes nothing', async () => {
		const remark = { id: 'o1', ruling: 'validated', foldedBack: false } as unknown as EvolutionRequest['observations'][number];
		view({ ...inApproval(), observations: [remark] }, [], 'main');
		const result = await run(ana, [{ op: 'validate_step', requestId: 'r', step: 'approval' }, { op: 'cross_stage', requestId: 'r' }]);
		expect(result.ok).toBe(false);
	});
});
