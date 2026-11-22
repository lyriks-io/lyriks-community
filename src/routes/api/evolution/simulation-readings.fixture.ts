import { expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, SectionDocumentStorePort } from '$application/ports';
import { createEmptyFeaturesDraft } from '$domain/features';
import {
	createDraftLeaf,
	createEvolutionRequest,
	findingHoldsGate,
	freeze,
	type CoherenceFinding,
	type DraftLeaf,
	type EvolutionRequest,
	type ProjectEvolutionDraft
} from '$domain/evolution';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { GET, POST } from './+server';

/**
 * The world of the screen "Change: Simulation and readings" (feature
 * feat-lyriks-copy-a52881-32, surface b8f8a781) as its scenarios start it, and
 * the adapters that drive the real doors: POST /api/evolution for every act on
 * a request, GET /api/evolution for what is read. Only the IO edges are faked:
 * the dossier store, the access port, and the engine behind the readings (the
 * knowledge graph, the coherence analysis, the behaviour verification, the
 * solver's proof comparison).
 *
 * A test file using it mocks the dossier loader with `dossierView()` and the
 * sync bus before importing it, so the doors read the dossier this world holds.
 */

export const NOW = '2026-11-20T09:00:00.000Z';
/** When the drafts last changed, and a reading taken after or before that. */
export const DRAFTED_AT = '2026-11-20T08:00:00.000Z';
export const READ_AFTER = '2026-11-20T08:30:00.000Z';
const READ_BEFORE = '2026-11-20T07:30:00.000Z';
export const PROJECT = 'p';
export const F = 'feat-cart';
export const REQUEST = '6f0c1d2e-0000-4000-8000-000000000032';
/** Another request whose id starts with the same eight characters, the way the board shortens both. */
export const TWIN = '6f0c1d2e-0000-4000-8000-000000000033';
/** The finding a decision names. */
export const FINDING = 'coh-6f0c1d2e-limit';
export const mia = { id: 'mia@company.test', name: 'Mia' };
export const leo = { id: 'leo@company.test', name: 'Leo' };
const pat = { id: 'pat@company.test', name: 'Pat' };
/** The features of the product: the cart the change amends, and three a drafted feature may be named after. */
const LEAVES = [
	{ id: F, name: 'Cart' },
	{ id: 'feat-pay', name: 'Payments' },
	{ id: 'feat-ship', name: 'Shipping' },
	{ id: 'feat-ret', name: 'Returns' }
];
export const REASON = 'Only administrators reach this page today.';

export type State = Readonly<Record<string, unknown>>;

/** The defaults of the surface for every declared path (export_behavior_scenarios initialState). */
const SURFACE_DEFAULTS: State = {
	'installation.signInRequired': true,
	'installation.edition': 'enterprise',
	'session.workspaceRole': 'designer',
	'session.callerKind': 'person',
	'workspace.singleMember': false,
	'request.status': 'open',
	'request.stage': 'specification',
	'impact.status': 'not_run',
	'impact.depth': 2,
	'impact.upToDate': false,
	'impact.proofsCompared': false,
	'coherence.status': 'not_run',
	'coherence.upToDate': false,
	'coherence.blockingUndecided': 0,
	'finding.severity': 'major',
	'finding.riskAccepted': false
};
/** 807c07d5 AI client. */
export const AI_CLIENT: State = { 'session.callerKind': 'ai_client', 'session.workspaceRole': 'designer' };
/** 66a77bea Viewer: a workspace member who reads only. */
export const VIEWER: State = { 'session.workspaceRole': 'viewer' };
/** bd36110a Outside the workspace. */
export const OUTSIDE: State = { 'session.workspaceRole': 'none' };
/** f36b63a0 Community installation. */
export const COMMUNITY: State = { 'installation.edition': 'community', 'session.workspaceRole': 'operator' };

export const given = (overrides: State = {}, persona: State = {}): State => ({ ...SURFACE_DEFAULTS, ...persona, ...overrides });

/* ───────────── The project as the doors read it ───────────── */

export interface Shape {
	/** The request holds the finding a decision names (findingExists). */
	readonly finding?: boolean;
	/** Drafted features named like an existing one: each is a contradiction the check finds (blockingFound). */
	readonly clashing?: number;
}

const draftChange = (at: string): EvolutionRequest['history'][number] => ({
	id: `h-draft-${at}`,
	type: 'draft_change',
	summary: 'Drafted amend "Cart"',
	authorId: mia.id,
	authorKind: 'person',
	recordedAt: at,
	proposalId: null,
	acceptedByPersonId: null,
	supersededById: null,
	channel: 'page'
});

const finding = (id: string, severity: CoherenceFinding['severity'], accepted: boolean): CoherenceFinding => ({
	id,
	axis: 'functional',
	severity,
	title: `Checkout reads the cart limit (${id})`,
	requestNodeId: F,
	existingNodeId: 'feature:feat-pay',
	fixNowTarget: 'capability:features/feat-pay',
	published: true,
	scope: 'request',
	risk: accepted ? { by: leo.id, at: READ_AFTER, reason: REASON } : null
});

/** When a reading ran: never, after the drafts last changed, or before. */
function ranAt(state: State, reading: 'impact' | 'coherence'): string | null {
	if (state[`${reading}.status`] !== 'ready') return null;
	return state[`${reading}.upToDate`] === true ? READ_AFTER : READ_BEFORE;
}

/** The request the scenario's Given describes: an amendment of the cart, with a behaviour model the solver can prove. */
export function requestOf(state: State, shape: Shape = {}, id = REQUEST): EvolutionRequest {
	const amendment = createDraftLeaf({
		id: 'draft:cart',
		kind: 'amend',
		baseLeafId: F,
		behaviourModel: { operations: [{ kind: 'update_action', actionId: 'a1', patch: { intent: 'Capped at ten items' } }], mintedIds: [], updatedAt: DRAFTED_AT }
	});
	const clashing: DraftLeaf[] = LEAVES.slice(1, 1 + (shape.clashing ?? 0)).map((leaf) => createDraftLeaf({ id: `draft:${leaf.id}-again`, kind: 'add', name: leaf.name }));
	const focus = shape.finding ? [finding(FINDING, state['finding.severity'] as CoherenceFinding['severity'], state['finding.riskAccepted'] === true)] : [];
	const others = Math.max(0, Number(state['coherence.blockingUndecided']) - focus.filter(findingHoldsGate).length);
	const stage = state['request.stage'] as EvolutionRequest['stage'];
	const opened = createEvolutionRequest({
		id,
		title: 'Cart limit',
		requester: leo.id,
		createdAt: '2026-11-19T10:00:00.000Z',
		stage: 'specification',
		status: 'open',
		leafIds: [F, amendment.id, ...clashing.map((d) => d.id)],
		drafts: [amendment, ...clashing],
		history: [draftChange(DRAFTED_AT)],
		impactReport: { status: state['impact.status'] as 'not_run' | 'ready', hypothesis: 'change', depth: Number(state['impact.depth']), ranAt: ranAt(state, 'impact') },
		coherenceReport: { status: state['coherence.status'] as 'not_run' | 'running' | 'ready', projectScore: 80, requestDelta: 0, ranAt: ranAt(state, 'coherence') },
		coherenceFindings: [...focus, ...Array.from({ length: others }, (_, i) => finding(`coh-6f0c1d2e-held-${i + 1}`, 'blocking', false))]
	});
	// A request past the freeze carries the version it was frozen as.
	const frozen = ['implementation', 'acceptance', 'delivered'].includes(stage) ? freeze(opened, { id: mia.id, kind: 'person', role: 'member', channel: 'page' }, DRAFTED_AT) : opened;
	return { ...frozen, stage, status: state['request.status'] as EvolutionRequest['status'] };
}

export interface World {
	readonly state: State;
	readonly requests: readonly EvolutionRequest[];
	readonly members: readonly { id: string; name: string }[];
	/** Whether the behaviour verification a coherence reading folds in answers before its deadline. */
	readonly behaviourReadInTime: boolean;
	/** Whether the engine still replays the drafted behaviour models on the features as they stand. */
	readonly draftsApply: boolean;
}

export interface WorldOptions {
	readonly behaviourReadInTime?: boolean;
	/** The requests the dossier holds, when the scenario's one request is not enough. */
	readonly requests?: readonly EvolutionRequest[];
	/** The engine no longer replays the drafted behaviour models: the features moved under them. */
	readonly draftsApply?: boolean;
}

export function worldOf(state: State, shape: Shape = {}, more: WorldOptions = {}): World {
	return {
		state,
		requests: more.requests ?? [requestOf(state, shape)],
		members: state['workspace.singleMember'] === true ? [mia] : [mia, leo, pat],
		behaviourReadInTime: more.behaviourReadInTime ?? true,
		draftsApply: more.draftsApply ?? true
	};
}

/** The dossier, revision by revision, as the loader and the save read it. */
let dossier: { draft: ProjectEvolutionDraft; revision: number };
let world: World;
let view: unknown = null;

const sectionDocuments = {
	load: async () => null,
	save: async () => 1,
	currentRevision: async (_projectId, section) => (section === 'evolution' ? dossier.revision : 0)
} satisfies SectionDocumentStorePort;

function viewOf() {
	return {
		projectId: PROJECT,
		draft: dossier.draft,
		features: createEmptyFeaturesDraft(PROJECT),
		data: { projectId: PROJECT, entities: [], fields: [] },
		leaves: LEAVES,
		sources: [],
		glossaryTerms: [],
		productName: 'Shop',
		members: world.members.map((p) => ({ id: p.id, name: p.name, role: 'member' })),
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: dossier.revision,
		language: 'en',
		assistantAvailable: false
	};
}

/** The dossier as the loader reads it: what the test files mock `loadEvolutionView` with. */
export const dossierView = (): unknown => view;

/** Store the world: the dossier holds its requests. */
export function seed(w: World): World {
	world = w;
	dossier = { draft: { projectId: PROJECT, requests: [...w.requests] } as ProjectEvolutionDraft, revision: 1 };
	view = viewOf();
	return w;
}

/** The services the doors reach: the stores, the access port, and the engine behind the readings. */
export function servicesOf(w: World) {
	const role = String(w.state['session.workspaceRole']);
	const enterprise = w.state['installation.edition'] === 'enterprise';
	return servicesWith({
		sectionDocuments,
		currentSession: () => ({ isAuthenticated: true, email: mia.id }),
		identity: { multiUser: true },
		installEdition: () => String(w.state['installation.edition']),
		resolveActiveProject: { execute: async () => null },
		enterpriseHooks: null,
		projectExists: async () => true,
		projectAccess: {
			authorize: async (_project: string, _token: string | null, action: AccessAction) =>
				role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
		},
		backLinks: { find: async () => ({ backWorkspaceId: 'ws' }) as never },
		workspaces: { listForCaller: async () => [{ id: 'ws', role: role === 'none' ? 'viewer' : role }] as never },
		clock: { nowIso: () => NOW },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		loadEvolutionDraft: { execute: async () => dossier.draft },
		saveEvolutionDraft: {
			execute: async (draft: ProjectEvolutionDraft, opts: { expectedRevision: number | null }) => {
				if (opts.expectedRevision !== null && opts.expectedRevision !== dossier.revision) return null;
				dossier = { draft, revision: dossier.revision + 1 };
				view = viewOf();
				return { revision: dossier.revision, savedAt: NOW };
			}
		},
		implementationCoverage: { invalidate: () => {} },
		scheduleBackSync: async () => {},
		captureBaseline: { execute: async () => null },
		// The engine behind the readings.
		loadKnowledgeGraph: { execute: async () => ({ nodes: [], edges: [] }) as never },
		readBehaviorFeature: { execute: async () => null },
		simulateBehavior: {
			execute: async () => ({ kind: 'walk', walk: w.draftsApply ? { ok: true } : { ok: false, errors: ['action a1 no longer exists'] } }),
			draftFeatureWalk: async () => null
		},
		// No code was adopted yet: the touched feature has no implementation status to read.
		codeAdoption: { available: false },
		// Proof by the solver is an Enterprise capability.
		proofs: enterprise,
		whatIf: { execute: async () => ({ kind: 'comparison', comparison: { proven: { before: true, after: true } } }) },
		// A verification still running past its deadline never settles here.
		behaviorAdvisories: { prime: () => (w.behaviourReadInTime ? Promise.resolve() : new Promise<void>(() => {})) },
		loadCoherenceDraft: { execute: async () => ({ analysis: { readinessScore: 82, gaps: [] } }) as never },
		loadRulesDraft: { execute: async () => ({ issues: [] }) as never }
	} as never);
}

/* ───────────── Reading the scenario's paths back ───────────── */

/** When the drafts last changed, off the request's timeline. */
const lastDraftChange = (request: EvolutionRequest): string | null =>
	request.history.filter((h) => h.type === 'draft_change').reduce<string | null>((latest, h) => (latest === null || h.recordedAt > latest ? h.recordedAt : latest), null);

/** A reading follows the drafts when it ran and no change to them is newer (rule c3d66b7d, as dueReadings reads it). */
const followsDrafts = (request: EvolutionRequest, at: string | null): boolean => {
	const changed = lastDraftChange(request);
	return at !== null && (changed === null || at >= changed);
};

/** The paths of the surface, read off a request as the store holds it. */
export function readState(request: EvolutionRequest): State {
	const focus = request.coherenceFindings.find((f) => f.id === FINDING);
	return {
		'request.status': request.status,
		'request.stage': request.stage,
		'impact.status': request.impactReport.status,
		'impact.depth': request.impactReport.depth,
		'impact.upToDate': followsDrafts(request, request.impactReport.ranAt),
		// A proof plane was computed: each modelled draft proved as it stands and as the draft would leave it.
		'impact.proofsCompared': (request.proofImpact ?? []).some((p) => p.unavailable === undefined),
		'coherence.status': request.coherenceReport.status,
		'coherence.upToDate': followsDrafts(request, request.coherenceReport.ranAt),
		'coherence.blockingUndecided': request.coherenceFindings.filter(findingHoldsGate).length,
		...(focus ? { 'finding.severity': focus.severity, 'finding.riskAccepted': !!focus.risk } : {})
	};
}

/** A request as the store holds it now. */
export const stored = (id = REQUEST): EvolutionRequest => dossier.draft.requests.find((r) => r.id === id)!;

/** The Given, as the paths the world models read it. */
const givenPaths = (state: State, withFinding: boolean): State =>
	Object.fromEntries(
		Object.keys(readState(createEvolutionRequest()))
			.filter((k) => k !== 'impact.proofsCompared')
			.concat(withFinding ? ['finding.severity', 'finding.riskAccepted'] : [])
			.map((k) => [k, state[k]])
	);

/* ───────────── The adapters ───────────── */

export interface Outcome {
	readonly status: 'success' | 'blocked';
	readonly refusal: { readonly status: number; readonly message: string } | null;
	readonly results: readonly { readonly op: string; readonly ok: boolean; readonly summary: string }[];
	readonly finalState: State;
}

const cookies = { lyriks_session: 'token' };

/** Send operations through the request's door, as the person or their AI client. */
export async function send(w: World, operations: readonly Record<string, unknown>[]): Promise<Omit<Outcome, 'finalState'>> {
	forgetShortMemos();
	const event = requestEvent({
		path: '/api/evolution',
		method: 'POST',
		headers: w.state['session.callerKind'] === 'ai_client' ? { 'x-lyriks-actor': 'ai_client' } : {},
		body: JSON.stringify({ projectId: PROJECT, operations }),
		services: servicesOf(w),
		authRequired: w.state['installation.signInRequired'] === true,
		cookies
	});
	try {
		const response = await POST(event as never);
		const body = (await response.json()) as { results?: { op: string; ok: boolean; summary: string }[] };
		const results = body.results ?? [];
		const refused = response.status !== 200 ? { status: response.status, message: results.find((r) => !r.ok)?.summary ?? '' } : null;
		return { status: refused ? 'blocked' : 'success', refusal: refused, results };
	} catch (cause) {
		if (!isHttpError(cause)) throw cause;
		return { status: 'blocked', refusal: { status: cause.status, message: cause.body.message }, results: [] };
	}
}

/** Seed the Given, check it reads as the scenario says, act, and read the request back off the store. */
export async function act(state: State, operations: readonly Record<string, unknown>[], shape: Shape = {}, more: WorldOptions = {}): Promise<Outcome> {
	const w = seed(worldOf(state, shape, more));
	expect(readState(stored())).toMatchObject(givenPaths(state, !!shape.finding));
	const outcome = await send(w, operations);
	return { ...outcome, finalState: readState(stored()) };
}

/** The operations the platform ran on its own after the acts of a batch. */
export const automatic = (outcome: Pick<Outcome, 'results'>) => outcome.results.filter((r) => r.summary.startsWith('Automatic:')).map((r) => r.op);

/** Read through the read door. */
export async function read(w: World, query: string): Promise<{ readonly status: 'success' | 'blocked'; readonly refusal: Outcome['refusal']; readonly body: Record<string, unknown> | null }> {
	seed(w);
	forgetShortMemos();
	const event = requestEvent({ path: `/api/evolution?projectId=${PROJECT}${query}`, services: servicesOf(w), authRequired: w.state['installation.signInRequired'] === true, cookies });
	try {
		const response = await GET(event as never);
		return { status: 'success', refusal: null, body: (await response.json()) as Record<string, unknown> };
	} catch (cause) {
		if (!isHttpError(cause)) throw cause;
		return { status: 'blocked', refusal: { status: cause.status, message: cause.body.message }, body: null };
	}
}
