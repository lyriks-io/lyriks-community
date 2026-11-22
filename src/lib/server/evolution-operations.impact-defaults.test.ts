import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createDraftLeaf, createEvolutionRequest, type Actor, type EvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
const { applyEvolutionOperations } = await import('./evolution-operations.server');

/**
 * "Read the impact of the change" (action 0536f24c of feature
 * feat-lyriks-copy-a52881-32): asked without a hypothesis or a depth, the walk
 * supposes a change and follows two links (parameters a7bea46e and b0c3879a),
 * whatever an earlier walk of the same request read.
 */

const AT = '2026-11-20T12:00:00.000Z';
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: AT }));
const services = {
	clock: { nowIso: () => AT },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 1 },
	saveEvolutionDraft: { execute: save },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {},
	// The engine's graph holds nothing to walk, and no code was adopted: only the reading's own terms are read here.
	loadKnowledgeGraph: { execute: async () => ({ nodes: [], edges: [] }) },
	codeAdoption: { available: false }
} as unknown as AppServices;
const ana: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };

/** A request whose last walk supposed an addition, four links out. */
function walkedBefore(): EvolutionRequest {
	const request = createEvolutionRequest({ id: 'r', title: 'Cart limit', stage: 'specification', leafIds: ['feat-cart'] });
	return {
		...request,
		drafts: [createDraftLeaf({ id: 'draft:cart', kind: 'amend', baseLeafId: 'feat-cart' })],
		impactReport: { status: 'ready', hypothesis: 'add', depth: 4, ranAt: '2026-11-19T10:00:00.000Z' }
	};
}

async function readImpact(operation: Record<string, unknown>): Promise<EvolutionRequest> {
	save.mockClear();
	const request = walkedBefore();
	scene.view = {
		projectId: 'p',
		draft: { projectId: 'p', requests: [request] },
		features: createEmptyFeaturesDraft('p'),
		data: { projectId: 'p', entities: [], fields: [] },
		leaves: [{ id: 'feat-cart', name: 'Cart' }],
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
	const outcome = await applyEvolutionOperations(services, { projectId: 'p', operations: [{ op: 'run_impact', requestId: 'r', ...operation }], actor: ana, origin: null });
	expect(outcome.ok).toBe(true);
	const saved = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
	return saved.requests[0];
}

describe('Read the impact of the change (0536f24c), asked without a hypothesis or a depth', () => {
	it('supposes a change and walks two links out, whatever the last walk read (parameters a7bea46e and b0c3879a)', async () => {
		const read = await readImpact({});
		expect(read.impactReport).toMatchObject({ status: 'ready', hypothesis: 'change', depth: 2, ranAt: AT });
	});

	it('keeps the hypothesis and the depth the one who asks names', async () => {
		const read = await readImpact({ hypothesis: 'remove', depth: 3 });
		expect(read.impactReport).toMatchObject({ hypothesis: 'remove', depth: 3 });
	});
});
