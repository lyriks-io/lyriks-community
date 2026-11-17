import { describe, expect, it } from 'vitest';
import type { AppServices } from '$composition/container.server';
import type { RuleDraft } from '$domain/evolution';
import { checkRuleLanding, checkRuleOperations, landRuleDrafts, proveRuleDrafts, readRuleDrafts } from './evolution-rule-drafts.server';

/**
 * The rules the whole product keeps, changed from a request: checked by the
 * engine as a dry run, read as EARS sentences before and after, and written at
 * the landing as one project batch (ac-evo-draft-rules).
 */

const current = { id: 'inv-old', name: 'A link has a target', condition: { left: 'link.hasTarget', operator: 'is_true' }, message: 'A link has no target.' };

function servicesWith(refuse: string | null = null) {
	const calls: { operations: Record<string, unknown>[]; dryRun: boolean }[] = [];
	const services = {
		authorProjectBehavior: {
			execute: async (input: { operations: Record<string, unknown>[]; dryRun: boolean }) => {
				calls.push(input);
				return refuse ? { kind: 'answer', value: { ok: false, errors: [refuse] } } : { kind: 'answer', value: { ok: true, dryRun: input.dryRun } };
			}
		},
		readProjectBehavior: { execute: async () => ({ projectInvariants: [current], coreFeatures: [], stateVariables: {}, library: {} }) },
		implementationCoverage: { invalidate: () => {} },
		scheduleBackSync: async () => {}
	} as unknown as AppServices;
	return { services, calls };
}

const draft = (operations: Record<string, unknown>[]): RuleDraft => ({ id: 'rules:r1', summary: 'Removed domains serve nothing', operations, sourceIds: [], materialisedAt: null });
const add = { kind: 'add_project_invariant', invariant: { name: 'A removed domain serves nothing', condition: { left: 'domain.removed', operator: 'is_false' }, message: 'A removed domain still answers.' } };

describe('the rules the whole product keeps change from a request [criterion:ac-leaf-ac-evo-draft-rules]', () => {
	it('is checked by the engine as a dry run, and its refusal names the rules', async () => {
		const accepted = servicesWith();
		expect(await checkRuleOperations(accepted.services, 'p', [add])).toBeNull();
		expect(accepted.calls[0].dryRun).toBe(true);
		const refused = servicesWith('op[0] (add_project_invariant): state path domain.removed is declared by no feature');
		expect(await checkRuleOperations(refused.services, 'p', [add])).toBe(
			'The rules the whole product keeps would refuse this change: op[0] (add_project_invariant): state path domain.removed is declared by no feature'
		);
	});

	it('reads each rule it moves before and after, one EARS sentence each', async () => {
		const { services } = servicesWith();
		const [reading] = await readRuleDrafts(services, 'p', { ruleDrafts: [draft([add, { kind: 'remove_project_invariant', invariantId: 'inv-old' }])] }, 'en');
		expect(reading.changes.map((c) => c.label)).toEqual(['New rule · A removed domain serves nothing', 'Retired rule · A link has a target']);
		expect(reading.changes[0].before).toBe('');
		expect(reading.changes[0].after).toMatch(/shall/);
		expect(reading.changes[1].after).toBe('');
		expect(reading.changes[1].before).toMatch(/shall/);
	});

	it('lands as one project batch, after checking it still applies', async () => {
		const { services, calls } = servicesWith();
		expect(await checkRuleLanding(services, 'p', { ruleDrafts: [draft([add])] })).toBeNull();
		expect(await landRuleDrafts(services, 'p', [add])).toEqual({ ok: true });
		expect(calls.map((c) => c.dryRun)).toEqual([true, false]);
		const moved = servicesWith('project invariant inv-old not found');
		expect(await checkRuleLanding(moved.services, 'p', { ruleDrafts: [draft([{ kind: 'remove_project_invariant', invariantId: 'inv-old' }])] })).toBe(
			'The changes to the rules the whole product keeps no longer apply: project invariant inv-old not found'
		);
	});
});

describe('a rule is checked on the product as the request would leave it [criterion:ac-leaf-ac-evo-draft-rules]', () => {
	const expired = {
		kind: 'add_project_invariant',
		name: 'An expired link never sends a visitor to its target',
		condition: { kind: 'any', conditions: [{ kind: 'not', condition: { left: 'link.expired', operator: 'is_true' } }, { left: 'visit.destination', operator: 'not_equals', right: 'target' }] },
		message: 'An expired link sent a visitor to its target.'
	};
	const undeclared = (path: string) => `Project invariant 7ec3688f ("An expired link never sends a visitor to its target"): reads state "${path}", which no feature of the project declares.`;
	// The request's amendment of Follow a short link declares link.expired in its behaviour.
	const amendment = { kind: 'amend', behaviourModel: { operations: [{ kind: 'add_state_definition', surfaceId: 's1', path: 'link.expired', type: 'boolean', defaultValue: false, description: '' }], mintedIds: [], updatedAt: '' } };

	it('accepts a rule on a state only a draft of the same request declares; refuses one no feature nor draft declares', async () => {
		const { services } = servicesWith(undeclared('link.expired'));
		const request = { drafts: [amendment], ruleDrafts: [] } as never;
		expect(await checkRuleOperations(services, 'p', [expired], request)).toBeNull();
		expect(await checkRuleOperations(services, 'p', [expired])).toBe(`The rules the whole product keeps would refuse this change: ${undeclared('link.expired')}`);
		const other = servicesWith(undeclared('link.gone'));
		expect(await checkRuleOperations(other.services, 'p', [expired], request)).toBe(`The rules the whole product keeps would refuse this change: ${undeclared('link.gone')}`);
	});

	it('lays the request\'s other changes to the rules first, all but the one being rewritten', async () => {
		const { services, calls } = servicesWith();
		const earlier = draft([add]);
		await checkRuleOperations(services, 'p', [expired], { drafts: [], ruleDrafts: [earlier] } as never);
		expect(calls[0].operations.map((op) => op.kind)).toEqual(['add_project_invariant', 'add_project_invariant']);
		await checkRuleOperations(services, 'p', [expired], { drafts: [], ruleDrafts: [earlier] } as never, earlier.id);
		expect(calls[1].operations).toHaveLength(1);
	});

	it('lands once the drafts that declare its states land with it', async () => {
		const { services } = servicesWith(undeclared('link.expired'));
		const landed = { ...amendment, behaviourModel: { operations: [], mintedIds: [], updatedAt: '', landed: { operations: amendment.behaviourModel.operations, mintedIds: [] } } };
		expect(await checkRuleLanding(services, 'p', { ruleDrafts: [draft([expired])], drafts: [landed] } as never)).toBeNull();
	});

	it('proves the other rules now and says which one is proved once the drafts land', async () => {
		const asked: Record<string, unknown>[][] = [];
		const services = {
			proofs: {},
			projectRulesOracle: {
				whatIf: async (_p: string, operations: Record<string, unknown>[]) => {
					asked.push(operations);
					return asked.length === 1 ? { kind: 'refused', error: undeclared('link.expired') } : { kind: 'answer', value: { rules: [{ invariantId: 'i9', change: 'added', before: null, after: 'proved' }] } };
				}
			}
		} as unknown as AppServices;
		const proof = await proveRuleDrafts(services, 'p', { ruleDrafts: [draft([expired, add])], drafts: [amendment] } as never);
		expect(proof).toEqual({ provedAtLanding: ['An expired link never sends a visitor to its target'], moves: [{ invariantId: 'i9', change: 'added', before: null, after: 'proved' }] });
		expect(asked[1].map((op) => (op.invariant as { name: string } | undefined)?.name)).toEqual(['A removed domain serves nothing']);
	});
});
