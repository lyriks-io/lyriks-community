import { vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createDraftLeaf, createEvolutionRequest, snapshotOf, type Actor, type DraftLeaf, type EvolutionRequest, type RequestStage } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDataDraft, createEntity, createField } from '$domain/data';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft, createEmptyOperationsDraft } from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { applyEvolutionOperations } from './evolution-operations.server';
import type { EvolutionView } from './evolution-view.server';

/**
 * One request of a project, run through the real batch of operations, to prove
 * the scenarios of the Evolution actions against the code (EVO-012). Only the
 * edges are stand-ins: the stores, and an engine that computes a draft's
 * feature from the operations of its model. A test file mocks the view loader
 * on `scene.view` (vi.mock is hoisted into each file) and builds its scene here.
 */
export const NOW = '2026-11-20T00:40:00Z';
export const ana: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };
export const claude: Actor = { id: 'claude@example.test', kind: 'ai_client', role: 'admin', channel: 'ai_client' };
export const TEAM = [
	{ id: 'ana@example.test', role: 'admin' },
	{ id: 'bo@example.test', role: 'admin' }
];

const rule = (id: string, description: string) => ({ id, category: 'business', description, condition: { left: 'cart.count', operator: 'greater_than', right: 20 }, effect: { type: 'block_action', reason: description } });
const action = (id: string, name: string) => ({ id, name, intent: name, roles: [], rules: [rule(`r-${id}`, `${name} has a rule`)], effects: [], scenarios: [] });
const featureOf = (names: readonly string[]) => ({ id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', type: 'screen', stateDefinitions: [], invariants: [], actions: [action('a1', 'Pay'), ...names.map((n, i) => action(`a${i + 3}`, n))] }] });

export const BASE_DESCRIPTION = 'Lets a shopper pay for the cart.';
export const draftOn = (over: Partial<DraftLeaf> = {}): DraftLeaf =>
	createDraftLeaf({ id: 'draft:r-1', kind: 'amend', baseLeafId: 'feat-1', objective: 'Keep a cart for later.', acceptanceCriteria: [{ id: 'c-1', text: 'A saved cart comes back' }], ...over });

/** The request at a stage, as the run leaves it there: frozen as version 1 from the Build on. */
export function requestAt(stage: RequestStage, over: Partial<EvolutionRequest> = {}): EvolutionRequest {
	const fresh = createEvolutionRequest();
	const frozen = stage === 'implementation' || stage === 'acceptance' || stage === 'delivered';
	const request = createEvolutionRequest({
		id: 'r',
		title: 'Save a cart for later',
		origin: 'internal_idea',
		need: { ...fresh.need, situation: 'A shopper who leaves loses the cart.', objectives: 'A cart kept for later comes back.' },
		stage,
		frozen,
		specVersion: frozen ? 1 : 0,
		leafIds: ['feat-1', 'draft:r-1'],
		drafts: [draftOn()],
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: NOW },
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: NOW },
		...over
	});
	return frozen ? { ...request, frozenVersions: [{ version: 1, at: '2026-11-19T12:00:00Z', by: 'ana@example.test', snapshot: snapshotOf(request) }] } : request;
}

export interface Scene {
	readonly services: AppServices;
	readonly engine: { answers: boolean; refuses: string | null };
	readonly save: ReturnType<typeof vi.fn>;
	show(request: EvolutionRequest, members?: readonly { id: string; role: string }[], others?: readonly EvolutionRequest[]): void;
	run(operations: unknown[], actor?: Actor): ReturnType<typeof applyEvolutionOperations>;
	/** The request as the last save wrote it. */
	saved(): EvolutionRequest;
	/** The request as it stands: the last save, else what the scene showed. */
	current(): EvolutionRequest;
	summaryOf(result: Awaited<ReturnType<typeof applyEvolutionOperations>>, op: string): string | undefined;
}

export function batchScene(holder: { view: unknown }, gaps: readonly Record<string, unknown>[] = []): Scene {
	const engine = { answers: true, refuses: null as string | null };
	const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: NOW }));
	const foundation = { projectId: 'p', identity: { ...createEmptyIdentityDraft('p'), lastSavedAt: '2026-10-01T00:00:00.000Z' }, definition: createEmptyDefinitionDraft('p'), operations: createEmptyOperationsDraft('p') };
	const services = {
		clock: { nowIso: () => NOW },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		sectionDocuments: { currentRevision: async () => 1 },
		saveEvolutionDraft: { execute: save },
		saveFeaturesDraft: { execute: async () => ({ revision: 2 }) },
		saveDataDraft: { execute: async () => ({ revision: 2 }) },
		implementationCoverage: { invalidate: () => {} },
		scheduleBackSync: async () => {},
		codeAdoption: { available: false },
		readBehaviorFeature: { execute: async () => ({ feature: featureOf([]) }) },
		authorProjectBehavior: {
			execute: async (input: { dryRun: boolean }) => ({ kind: 'answer', value: engine.refuses ? { ok: false, errors: [engine.refuses] } : { ok: true, dryRun: input.dryRun } })
		},
		readProjectBehavior: { execute: async () => ({ projectInvariants: [], coreFeatures: [], stateVariables: {}, library: {} }) },
		simulateBehavior: {
			draftFeatureWalk: async (_project: string, target: { model?: { operations: Record<string, unknown>[] } }) =>
				engine.answers ? { kind: 'walk', walk: { ok: true, feature: featureOf((target.model?.operations ?? []).map((o) => String(o.name ?? 'Action'))) } } : null,
			execute: async () => (!engine.answers ? null : engine.refuses ? { kind: 'walk', walk: { ok: false, errors: [engine.refuses] } } : { kind: 'walk', walk: { ok: true, batch: { mintedIds: [] } } })
		},
		projectHealthView: { get: async () => ({ points: gaps }) },
		readProjectHealth: { execute: async () => ({ points: gaps }) },
		loadFoundationDraft: { execute: async () => structuredClone(foundation), loadIdentity: async () => structuredClone(foundation.identity) },
		loadSpecLanguage: { generated: async () => 'en' },
		loadEvolutionDraft: { execute: async () => (holder.view as EvolutionView).draft },
		loadGlossaryDraft: { execute: async () => createEmptyGlossaryDraft('p') }
	} as unknown as AppServices;
	let shown: EvolutionRequest | null = null;
	const show = (request: EvolutionRequest, members: readonly { id: string; role: string }[] = [], others: readonly EvolutionRequest[] = []) => {
		shown = request;
		const cart = createEntity({ id: 'ent-1', name: 'Cart' });
		const data = { ...createEmptyDataDraft('p'), entities: [cart, createEntity({ id: 'ent-2', name: 'Order' })], fields: [createField('ent-1', { id: 'fld-1', name: 'total', type: 'decimal' })] };
		const features = { ...createEmptyFeaturesDraft('p'), features: [{ id: 'feat-1', name: 'Checkout', coreId: '', description: BASE_DESCRIPTION }] };
		holder.view = {
			projectId: 'p',
			draft: { projectId: 'p', requests: [request, ...others] },
			features,
			data,
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
		save.mockClear();
	};
	const saved = (): EvolutionRequest => {
		const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
		return draft.requests[0];
	};
	return {
		services,
		engine,
		save,
		show,
		run: (operations, actor = ana) => applyEvolutionOperations(services, { projectId: 'p', operations, actor, origin: null }),
		saved,
		current: () => (save.mock.calls.length > 0 ? saved() : shown!),
		summaryOf: (result, op) => result.results.find((r) => r.op === op)?.summary
	};
}
