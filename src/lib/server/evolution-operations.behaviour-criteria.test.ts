import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
import { applyEvolutionOperations } from './evolution-operations.server';

/**
 * Criterion 569c7789: an amendment's changeCriteria and retireCriteria reach the
 * Given/When/Then criteria of the feature's behaviour model, routed to the
 * draft's model as apply_behavior_batch would write them; a text criterion keeps
 * its {id, text} rewording, and an id the feature carries in neither list is refused.
 */
const TEXT_ID = '14ef9bc4-cba7-4c2a-9d51-0d2b3f6e7a10';
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: '2026-11-20T01:00:00Z' }));
const engine = vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ kind: 'walked', walk: { ok: true, batch: { mintedIds: [] } } }));
const services = {
	clock: { nowIso: () => '2026-11-20T01:00:00Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {},
	// The feature as the engine holds it: two Given/When/Then criteria beside its text criterion.
	readBehaviorFeature: {
		execute: async () => ({
			feature: {
				id: 'feat-pickup',
				acceptanceCriteria: [
					{ id: 'd7cd4e43', title: 'A ready bag is handed over', given: 'a ready bag', when: 'the customer comes', then: 'it is handed over' },
					{ id: 'b1b2c3d4', title: 'An old rule' }
				]
			}
		})
	},
	simulateBehavior: { execute: engine }
} as unknown as AppServices;
const relayed: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'ai_client' };

const features = {
	...createEmptyFeaturesDraft('p'),
	features: [{ id: 'feat-pickup', name: 'Pick up', coreId: 'core', parentFamilyId: null, description: 'Pick up an order.', unspaghettitFeatureId: 'feat-pickup' }],
	leafMeta: { 'feat-pickup': { acceptanceCriteria: [{ id: TEXT_ID, text: 'A bag is handed over only once ready.' }] } }
} as unknown as ProjectFeaturesDraft;

function viewOf(request: EvolutionRequest) {
	scene.view = {
		projectId: 'p',
		draft: { projectId: 'p', requests: [request] },
		features,
		data: { entities: [], fields: [] },
		leaves: [{ id: 'feat-pickup', name: 'Pick up', coreId: 'core' }],
		sources: [],
		glossaryTerms: [],
		members: [],
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 1,
		language: 'en'
	};
}
const run = (operations: unknown[]) => applyEvolutionOperations(services, { projectId: 'p', operations, actor: relayed, origin: null });
function saved(): EvolutionRequest {
	const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return draft.requests[0];
}
const amend = (fields: Record<string, unknown>) => ({ op: 'add_draft_leaf', requestId: 'r', kind: 'amend', baseLeafId: 'feat-pickup', ...fields });

describe('changeCriteria and retireCriteria reach the behaviour criteria [criterion:569c7789]', () => {
	beforeEach(() => {
		save.mockClear();
		engine.mockClear();
		viewOf({ ...createEvolutionRequest({ id: 'r', title: 'Hand over paid bags only', leafIds: ['feat-pickup'] }), stage: 'specification' });
	});

	it('routes a Given/When/Then criterion reworded or retired to the draft behaviour model', async () => {
		const result = await run([amend({ changeCriteria: [{ id: 'd7cd4e43', then: 'it is handed over once paid' }], retireCriteria: ['b1b2c3d4'] })]);
		expect(result.ok).toBe(true);
		const draft = saved().drafts[0];
		expect(draft.behaviourModel?.operations).toEqual([
			{ kind: 'update_acceptance_criterion', criterionId: 'd7cd4e43', patch: { then: 'it is handed over once paid' } },
			{ kind: 'remove_acceptance_criterion', criterionId: 'b1b2c3d4' }
		]);
		// Nothing of it lands in the text delta.
		expect(draft.changeCriteria).toBeUndefined();
		expect(draft.retireCriteria).toBeUndefined();
		// The engine checked the model the way apply_behavior_batch on the draft is checked.
		expect(engine).toHaveBeenCalledTimes(1);
		expect((engine.mock.calls[0][0] as { args: { operations: unknown[] } }).args.operations).toEqual(draft.behaviourModel?.operations);
	});

	it('keeps a text criterion reworded with its text beside a behaviour one', async () => {
		const result = await run([amend({ changeCriteria: [{ id: TEXT_ID, text: 'A bag is handed over once ready and paid.' }, { id: 'd7cd4e43', title: 'A paid bag is handed over' }] })]);
		expect(result.ok).toBe(true);
		const draft = saved().drafts[0];
		expect(draft.changeCriteria).toEqual([{ id: TEXT_ID, text: 'A bag is handed over once ready and paid.' }]);
		expect(draft.behaviourModel?.operations).toEqual([{ kind: 'update_acceptance_criterion', criterionId: 'd7cd4e43', patch: { title: 'A paid bag is handed over' } }]);
	});

	it('appends to the model the draft already holds on update_draft_leaf', async () => {
		expect((await run([amend({ retireCriteria: ['b1b2c3d4'] })])).ok).toBe(true);
		const first = saved();
		viewOf(first);
		save.mockClear();
		const result = await run([{ op: 'update_draft_leaf', requestId: 'r', draftId: first.drafts[0].id, changeCriteria: [{ id: 'd7cd4e43', when: 'the customer has paid' }] }]);
		expect(result.ok).toBe(true);
		expect(saved().drafts[0].behaviourModel?.operations).toEqual([
			{ kind: 'remove_acceptance_criterion', criterionId: 'b1b2c3d4' },
			{ kind: 'update_acceptance_criterion', criterionId: 'd7cd4e43', patch: { when: 'the customer has paid' } }
		]);
	});

	it('refuses an id the feature carries in neither list, naming it, and writes nothing', async () => {
		const result = await run([amend({ changeCriteria: [{ id: 'zzzzzzzz', title: 'Nobody pointed at me' }] })]);
		expect(result.ok).toBe(false);
		expect(result.results.find((r) => r.op === 'add_draft_leaf')?.summary).toBe('"feat-pickup" carries no acceptance criterion "zzzzzzzz".');
		expect(save).not.toHaveBeenCalled();
	});

	it('refuses a behaviour criterion reworded as a text, and one the engine refuses, writing nothing', async () => {
		const asText = await run([amend({ changeCriteria: [{ id: 'd7cd4e43', text: 'Handed over once paid' }] })]);
		expect(asText.ok).toBe(false);
		expect(asText.results.find((r) => r.op === 'add_draft_leaf')?.summary).toContain('is a Given/When/Then criterion');
		engine.mockResolvedValueOnce({ kind: 'walked', walk: { ok: false, errors: ['criterionId d7cd4e43: patch has no field'] } });
		const refused = await run([amend({ retireCriteria: ['d7cd4e43'] })]);
		expect(refused.ok).toBe(false);
		expect(save).not.toHaveBeenCalled();
	});
});
