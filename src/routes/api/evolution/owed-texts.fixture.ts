import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, SectionDocumentStorePort } from '$application/ports';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEvolutionRequest, type EvolutionRequest, type ProjectEvolutionDraft } from '$domain/evolution';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { POST } from './+server';

/**
 * The world of the actions EVO-013 version 2 amends or adds (the entry into
 * the Impact analysis, the validation of a step, of a path of the journey and
 * of the whole journey), and the adapter that drives them through the real
 * door, POST /api/evolution. Only the IO edges are faked: the dossier store,
 * the access port, and the engine the readings and the freeze ask.
 *
 * A test file using it mocks the dossier loader with `dossierView()` and the
 * sync bus before importing it, so the door reads the dossier this world holds.
 */

export const NOW = '2026-11-20T10:00:00.000Z';
export const PROJECT = 'p';
export const REQUEST = '6f0c1d2e-0000-4000-8000-000000000013';
export const mia = { id: 'mia@company.test', name: 'Mia' };
const leo = { id: 'leo@company.test', name: 'Leo' };
const pat = { id: 'pat@company.test', name: 'Pat' };

export type State = Readonly<Record<string, unknown>>;

/** What every scenario starts from: a designer on a team installation, signed in. */
const DEFAULTS: State = {
	'installation.signInRequired': true,
	'session.workspaceRole': 'designer',
	'session.callerKind': 'person',
	'workspace.singleMember': false
};
/** A member who reads only. */
export const VIEWER: State = { 'session.workspaceRole': 'viewer' };
/** Someone outside the workspace that owns the project. */
export const OUTSIDE: State = { 'session.workspaceRole': 'none' };
/** The person's AI client. */
export const AI_CLIENT: State = { 'session.callerKind': 'ai_client' };

export const given = (overrides: State = {}, persona: State = {}): State => ({ ...DEFAULTS, ...persona, ...overrides });

/** A request in Specify that owes nothing: its Need's situation and objectives and its Solution's description written. */
export function owedWritten(over: Partial<EvolutionRequest> = {}): EvolutionRequest {
	const base = createEvolutionRequest({ id: REQUEST, title: 'Export as CSV' });
	return {
		...base,
		stage: 'specification',
		need: { ...base.need, situation: 'People copy the list by hand.', objectives: 'The list exports as CSV.' },
		stepDescriptions: { ...base.stepDescriptions, solution: 'An Export button writes the list as CSV.' },
		...over
	};
}

/** A step validated by someone else of the team. */
export const validatedBy = (step: 'need' | 'solution' | 'functional_spec' | 'technical_spec' | 'approval', by = leo.id) => ({
	step,
	validatorIds: [],
	validations: [{ by, kind: 'person' as const, at: '2026-11-20T09:00:00.000Z' }]
});

/** The use case diagram of the Functional spec: one use case, one flow, so one path of the journey. */
export const DRAWING = 'actor Person\nuse case Export the list: Person\nflow Export the list\nPerson: clicks Export\n  refused when the list is empty: nothing is exported';

let state: State = DEFAULTS;
let dossier: { draft: ProjectEvolutionDraft; revision: number } = { draft: { projectId: PROJECT, requests: [] } as unknown as ProjectEvolutionDraft, revision: 1 };
let view: unknown = null;

const members = () => (state['workspace.singleMember'] === true ? [mia] : [mia, leo, pat]);

function viewOf(): unknown {
	return {
		projectId: PROJECT,
		draft: dossier.draft,
		features: createEmptyFeaturesDraft(PROJECT),
		data: { projectId: PROJECT, entities: [], fields: [] },
		leaves: [],
		sources: [],
		glossaryTerms: [],
		productName: 'Shop',
		members: members().map((p) => ({ id: p.id, name: p.name, role: 'member' })),
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

/** Store the Given: the scenario's state and the request as it stands. */
export function seed(s: State, request: EvolutionRequest): void {
	state = s;
	dossier = { draft: { projectId: PROJECT, requests: [request] } as unknown as ProjectEvolutionDraft, revision: 1 };
	view = viewOf();
}

/** The request as the store holds it now. */
export const stored = (): EvolutionRequest => dossier.draft.requests[0];

const sectionDocuments = {
	load: async () => null,
	save: async () => 1,
	currentRevision: async (_projectId: string, section: string) => (section === 'evolution' ? dossier.revision : 0)
} as unknown as SectionDocumentStorePort;

function services() {
	const role = String(state['session.workspaceRole']);
	return servicesWith({
		sectionDocuments,
		currentSession: () => ({ isAuthenticated: true, email: mia.id }),
		identity: { multiUser: true },
		installEdition: () => 'enterprise',
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
		// The engine behind the readings an entry makes due and the freeze a validation may bring.
		loadKnowledgeGraph: { execute: async () => ({ nodes: [], edges: [] }) as never },
		readBehaviorFeature: { execute: async () => null },
		simulateBehavior: { execute: async () => ({ kind: 'walk', walk: { ok: true } }), draftFeatureWalk: async () => null },
		codeAdoption: { available: false },
		proofs: true,
		whatIf: { execute: async () => ({ kind: 'comparison', comparison: { proven: { before: true, after: true } } }) },
		behaviorAdvisories: { prime: () => Promise.resolve() },
		loadCoherenceDraft: { execute: async () => ({ analysis: { readinessScore: 82, gaps: [] } }) as never },
		loadRulesDraft: { execute: async () => ({ issues: [] }) as never }
	} as never);
}

export interface Outcome {
	readonly status: 'success' | 'blocked';
	readonly refusal: { readonly status: number; readonly message: string } | null;
	readonly results: readonly { readonly op: string; readonly ok: boolean; readonly summary: string }[];
}

/** Send operations through the request's door, as the person or their AI client. */
export async function send(operations: readonly Record<string, unknown>[]): Promise<Outcome> {
	forgetShortMemos();
	const event = requestEvent({
		path: '/api/evolution',
		method: 'POST',
		headers: state['session.callerKind'] === 'ai_client' ? { 'x-lyriks-actor': 'ai_client' } : {},
		body: JSON.stringify({ projectId: PROJECT, operations: operations.map((op) => ({ requestId: REQUEST, ...op })) }),
		services: services(),
		authRequired: state['installation.signInRequired'] === true,
		cookies: { lyriks_session: 'token' }
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

/** Seed the Given and send the scenario's act. */
export async function act(s: State, request: EvolutionRequest, operations: readonly Record<string, unknown>[]): Promise<Outcome> {
	seed(s, request);
	return send(operations);
}
