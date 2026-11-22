import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import type { RuleDraft } from '$domain/evolution';
import { batchScene, claude, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Draft a change to the rules the whole product keeps (feat-30, action
 * 94e0d214), every scenario through the real batch of operations, checked by
 * the engine as a dry run. Not tested here: the viewer (dd20f395), refused by
 * the route's access check, which the Enterprise workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:94e0d214:${id}]`;
const RULE = { kind: 'add_project_invariant', invariant: { name: 'A saved cart expires', condition: { left: 'cart.count', operator: 'is_true' }, message: 'A saved cart never expires.' } };
const held = (over: Partial<RuleDraft> = {}): RuleDraft => ({ id: 'rules:r-1', summary: 'A saved cart expires', operations: [RULE], sourceIds: [], materialisedAt: null, ...over });
const draft = (fields: Record<string, unknown>) => s.run([{ op: 'add_rule_draft', requestId: 'r', ...fields }], claude);

describe('Draft a change to the rules the whole product keeps', () => {
	beforeEach(() => {
		s.engine.refuses = null;
		s.show(requestAt('specification'));
	});

	it(`the AI drafts a new rule of the product, waiting for a person ${T('b1e1f393')}`, async () => {
		expect((await draft({ summary: 'A saved cart expires', operations: [RULE] })).ok).toBe(true);
		expect(s.saved().ruleDrafts).toHaveLength(1);
	});

	it(`a change the product's rules would refuse is not kept ${T('4c33c9b2')}`, async () => {
		s.engine.refuses = 'state path cart.count is declared by no feature';
		const result = await draft({ summary: 'A saved cart expires', operations: [RULE] });
		expect(s.summaryOf(result, 'add_rule_draft')).toContain('state path cart.count is declared by no feature');
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a state of the product is not changed by a request ${T('dea428a5')}`, async () => {
		const result = await draft({ summary: 'A new state', operations: [{ kind: 'add_state_variable', path: 'cart.saved', type: 'boolean' }] });
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a landed change to the rules no longer moves ${T('0d269cd8')}`, async () => {
		s.show(requestAt('specification', { drafts: [draftOn({ materialisedAt: '2026-11-19T00:00:00Z', materialisedAs: 'feat-1' })], ruleDrafts: [held({ materialisedAt: '2026-11-19T00:00:00Z' })] }));
		expect((await s.run([{ op: 'update_rule_draft', requestId: 'r', ruleDraftId: 'rules:r-1', summary: 'A saved cart expires after a week' }], claude)).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a change to the rules is taken out ${T('69b80c29')}`, async () => {
		s.show(requestAt('specification', { ruleDrafts: [held()] }));
		expect((await s.run([{ op: 'remove_rule_draft', requestId: 'r', ruleDraftId: 'rules:r-1' }], claude)).ok).toBe(true);
		expect(s.saved().ruleDrafts).toEqual([]);
	});

	it(`a change to the rules is drafted before anyone validated the Solution ${T('fc82a13c')}`, async () => {
		expect(s.current().stepValidations).toEqual([]);
		expect((await draft({ summary: 'A saved cart expires', operations: [RULE] })).ok).toBe(true);
	});

	it(`in the Build the AI drafts a change to the rules, opening version N+1 in correction ${T('7682c335')}`, async () => {
		s.show(requestAt('implementation'));
		expect((await draft({ summary: 'A saved cart expires', operations: [RULE] })).ok).toBe(true);
		expect(s.saved().ruleDrafts).toHaveLength(1);
		expect(s.saved().correction?.of).toBe(1);
	});
});
