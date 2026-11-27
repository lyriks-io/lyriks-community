import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { SectionDocumentStorePort } from '$application/ports';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createDraftLeaf, createEvolutionRequest, type EvolutionRequest, type LandingChoice, type ProjectEvolutionDraft, type TouchedReading } from '$domain/evolution';
import { RETROSPEC_SECTION, SPEC360_TAB, applyRetrospecActs, emptyRetrospecDocument, type PersonRef, type RetrospecAct, type RetrospecDocument, type SpecElement } from '$domain/retrospec';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { forgetShortMemos } from '$lib/server/short-memo.server';

const scene = vi.hoisted(() => ({ elements: [] as unknown[], view: null as unknown }));
vi.mock('$lib/server/spec-elements.server', () => ({ readSpecElements: async () => scene.elements, forgetSpecElements: () => {} }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => scene.view
}));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
const { GET, POST } = await import('./+server');
const validation = await import('../../../routes/projects/[projectId]/spec/validation/+server');

/**
 * The scenarios of the new actions of the screen "Change: Simulation and
 * readings" (feature feat-lyriks-copy-a52881-32, surface b8f8a781) that EVO-003
 * brings, run through the real doors: POST /api/evolution for the request's
 * choices, POST /projects/:projectId/spec/validation for Validate now, and
 * GET /api/evolution?part=knowledge to read the block back. Only the IO edges
 * are faked: the section store, the elements the specification holds, the
 * roster, the access port and the dossier loader.
 */

const NOW = '2026-11-20T09:00:00.000Z';
const PROJECT = 'p';
const F = 'feat-cart';
const REQUEST = '6f0c1d2e-0000-4000-8000-000000000003';
/** The reader. */
const mia: PersonRef = { id: 'mia@company.test', name: 'Mia' };
/** The lead of the validation when the element does not wait on the reader. */
const leo: PersonRef = { id: 'leo@company.test', name: 'Leo' };
const pat: PersonRef = { id: 'pat@company.test', name: 'Pat' };
/** The element each scenario looks at: an action the change amends. */
const FOCUS = `action:${F}:a1`;

type State = Readonly<Record<string, unknown>>;

/** The defaults of the surface for every declared path (export_behavior_scenarios initialState). */
const SURFACE_DEFAULTS: State = {
	'installation.signInRequired': true,
	'installation.edition': 'enterprise',
	'session.workspaceRole': 'designer',
	'session.callerKind': 'person',
	'workspace.singleMember': false,
	'request.status': 'open',
	'request.stage': 'specification',
	'touched.awaitingChoice': 3,
	'touchedElement.waitsOnMe': true,
	'touchedElement.choice': 'none',
	'knowledge.readable': true
};
/** 66a77bea Viewer: a workspace member who reads only. */
const VIEWER: State = { 'session.workspaceRole': 'viewer' };

const given = (overrides: State = {}, persona: State = {}): State => ({ ...SURFACE_DEFAULTS, ...persona, ...overrides });

/** The actions the change amends, the focused one first: as many as the lines the state counts. */
function amendedActions(state: State): string[] {
	const chosen = state['touchedElement.choice'] !== 'none';
	const others = Math.max(0, Number(state['touched.awaitingChoice']) - (chosen ? 0 : 1));
	return ['a1', ...Array.from({ length: others }, (_, i) => `a${i + 2}`)];
}

const actionElement = (id: string): SpecElement => ({ id: `action:${F}:${id}`, title: `Action ${id}`, place: 'Shop › Cart', fingerprint: `f-${id}` });

/** The project as the doors read it: the request, Knowledge, the roster and who reads. */
interface World {
	readonly state: State;
	readonly request: EvolutionRequest;
	readonly elements: readonly SpecElement[];
	readonly doc: RetrospecDocument;
}

function worldOf(state: State): World {
	const actions = amendedActions(state);
	const lead = state['touchedElement.waitsOnMe'] === true ? mia : leo;
	const elements: SpecElement[] = [{ id: `feature:${F}`, title: 'Cart', place: 'Shop', fingerprint: 'f-cart' }, ...actions.map(actionElement)];
	let doc = emptyRetrospecDocument();
	const act = (acts: RetrospecAct[], actor: PersonRef) => {
		const outcome = applyRetrospecActs(doc, acts, { actor, now: NOW });
		if (!outcome.ok) throw new Error(outcome.reason);
		doc = outcome.doc;
	};
	act([{ op: 'start_review', total: elements.length }], lead);
	// The feature itself stands validated: the block lists only the actions.
	act([{ op: 'validate', itemId: `feature:${F}`, title: 'Cart', tab: SPEC360_TAB }], lead);
	if (state['touchedElement.choice'] === 'validated_now') act([{ op: 'validate', itemId: FOCUS, title: 'Action a1', tab: SPEC360_TAB }], mia);
	const choices: Record<string, LandingChoice> = state['touchedElement.choice'] === 'at_landing' ? { [FOCUS]: { by: mia.id, at: NOW } } : {};
	const request = createEvolutionRequest({
		id: REQUEST,
		title: 'Cart limit',
		stage: state['request.stage'] as EvolutionRequest['stage'],
		status: state['request.status'] as EvolutionRequest['status'],
		leafIds: [F],
		drafts: [
			createDraftLeaf({
				id: 'draft:cart',
				kind: 'amend',
				baseLeafId: F,
				behaviourModel: { operations: actions.map((id) => ({ kind: 'update_action', actionId: id, patch: { intent: 'Capped' } })), mintedIds: [], updatedAt: NOW }
			})
		],
		...(Object.keys(choices).length > 0 ? { landingChoices: choices } : {})
	});
	return { state, request, elements, doc };
}

/** The stores, revision by revision: the dossier and the Reverse-Specification document. */
let documents: Map<string, { doc: unknown; revision: number }>;
let dossier: { draft: ProjectEvolutionDraft; revision: number };
const sectionDocuments = {
	load: async (projectId, section) => documents.get(`${projectId}/${section}`)?.doc ?? null,
	save: async (projectId, section, doc, expected) => {
		const now = documents.get(`${projectId}/${section}`)?.revision ?? 0;
		if (expected !== null && expected !== now) return null;
		documents.set(`${projectId}/${section}`, { doc, revision: now + 1 });
		return now + 1;
	},
	currentRevision: async (projectId, section) => (section === 'evolution' ? dossier.revision : (documents.get(`${projectId}/${section}`)?.revision ?? 0))
} satisfies SectionDocumentStorePort;

/** The dossier as the loader reads it. */
function viewOf() {
	return {
		projectId: PROJECT,
		draft: dossier.draft,
		features: createEmptyFeaturesDraft(PROJECT),
		data: { projectId: PROJECT, entities: [], fields: [] },
		leaves: [{ id: F, name: 'Cart' }],
		sources: [],
		glossaryTerms: [],
		productName: 'Shop',
		members: [mia, leo, pat].map((p) => ({ id: p.id, name: p.name, role: 'member' })),
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: dossier.revision,
		language: 'en',
		assistantAvailable: false
	};
}

/** The IO ports the doors reach, as this world answers them. */
function partsOf(world: World): Record<string, unknown> {
	const role = String(world.state['session.workspaceRole']);
	const roster = [mia, leo, pat].map((p) => ({ email: p.id, name: p.name, jobIds: [] as string[], names: [] as string[] }));
	return {
		sectionDocuments,
		currentSession: () => ({ isAuthenticated: true, email: mia.id }),
		identity: { multiUser: true },
		installEdition: () => String(world.state['installation.edition']),
		resolveActiveProject: { execute: async () => null },
		enterpriseHooks: null,
		projectExists: async () => true,
		projectAccess: {
			authorize: async (_project: string, _token: string | null, action: string) =>
				role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
		},
		backLinks: { find: async () => ({ backWorkspaceId: 'ws' }) as never },
		workspaces: { listForCaller: async () => [{ id: 'ws', role: role === 'viewer' ? 'viewer' : 'designer' }] as never },
		resolveActiveMemberName: { execute: async () => mia.name },
		teamJobs: {
			forProject: async () => new Map(),
			participantsForProject: async () => {
				if (world.state['knowledge.readable'] === false) throw new Error('roster offline');
				return roster;
			}
		},
		loadBaselinesDraft: { execute: async () => ({ baselines: [] }) as never },
		loadFoundationDraft: { loadIdentity: async () => ({ ...createEmptyIdentityDraft(PROJECT), productName: 'Shop' }) },
		clock: { nowIso: () => NOW },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		loadEvolutionDraft: { execute: async () => dossier.draft },
		saveEvolutionDraft: {
			execute: async (draft: ProjectEvolutionDraft, opts: { expectedRevision: number | null }) => {
				if (opts.expectedRevision !== null && opts.expectedRevision !== dossier.revision) return null;
				dossier = { draft, revision: dossier.revision + 1 };
				scene.view = viewOf();
				return { revision: dossier.revision, savedAt: NOW };
			}
		},
		implementationCoverage: { invalidate: () => {} },
		scheduleBackSync: async () => {}
	};
}

const servicesOf = (world: World) => servicesWith(partsOf(world) as never);

/**
 * Each world stores its Knowledge document under a revision never used before, a thousand above the last
 * (past what its own writes reach), as a real store does: the read paths keep a document per revision
 * (read-on-revision), so a revision reused for another document served the previous test's.
 */
let knowledgeRevision = 0;

/** Store the world: the dossier, Knowledge and the elements the specification holds. */
function seed(world: World) {
	dossier = { draft: { projectId: PROJECT, requests: [world.request] } as ProjectEvolutionDraft, revision: 1 };
	scene.view = viewOf();
	documents.set(`${PROJECT}/${RETROSPEC_SECTION}`, { doc: world.doc, revision: (knowledgeRevision += 1000) });
	scene.elements = [...world.elements];
}

const cookies = { lyriks_session: 'token' };

/** The block as the reader reads it, through the page's own door. */
async function readBlock(world: World): Promise<TouchedReading> {
	forgetShortMemos();
	const event = requestEvent({
		path: `/api/evolution?projectId=${PROJECT}&requestId=${REQUEST}&part=knowledge`,
		services: servicesOf({ ...world, state: { ...world.state, 'session.workspaceRole': 'designer' } }),
		authRequired: true,
		cookies
	});
	const response = await GET(event as never);
	return ((await response.json()) as { knowledge: TouchedReading }).knowledge;
}

/** The scenario's paths read back from the stores; the block is read only where it can be (a deleted request has none). */
async function stateOf(world: World): Promise<State> {
	const request = dossier.draft.requests[0];
	const kept = { 'request.stage': request.stage, 'request.status': request.status };
	if (request.status === 'deleted') return kept;
	const reading = await readBlock(world);
	const line = reading.lines.find((l) => l.id === FOCUS);
	return {
		...kept,
		'knowledge.readable': reading.readable,
		'touchedElement.choice': line ? line.choice : reading.validated.includes(FOCUS) ? 'validated_now' : 'none',
		'touched.awaitingChoice': reading.awaitingChoice
	};
}

interface Outcome {
	readonly status: 'success' | 'blocked';
	readonly refusal: { readonly status: number; readonly message: string } | null;
	readonly finalState: State;
}

async function refusalOf(response: Response | null, cause: unknown): Promise<Outcome['refusal']> {
	if (cause) {
		if (!isHttpError(cause)) throw cause;
		return { status: cause.status, message: cause.body.message };
	}
	if (response && response.status !== 200) {
		const body = (await response.json()) as { results?: { ok: boolean; summary: string }[] };
		return { status: response.status, message: body.results?.find((r) => !r.ok)?.summary ?? '' };
	}
	return null;
}

/** The adapter for the request's choices: POST one operation through the request's door. */
async function choose(state: State, operation: Record<string, unknown>): Promise<Outcome> {
	const world = worldOf(state);
	seed(world);
	// The world reads as the scenario's Given before anything is sent, where the block can be read.
	const before = await stateOf(world);
	expect(before).toMatchObject({ 'request.status': state['request.status'] });
	if (before['knowledge.readable'] === true)
		expect(before).toMatchObject({ 'touchedElement.choice': state['touchedElement.choice'], 'touched.awaitingChoice': state['touched.awaitingChoice'] });
	const event = requestEvent({
		path: '/api/evolution',
		method: 'POST',
		body: JSON.stringify({ projectId: PROJECT, operations: [{ ...operation, requestId: REQUEST }] }),
		services: servicesOf(world),
		authRequired: state['installation.signInRequired'] === true,
		cookies
	});
	let response: Response | null = null;
	let cause: unknown = null;
	try {
		response = await POST(event as never);
	} catch (e) {
		cause = e;
	}
	const refusal = await refusalOf(response, cause);
	return { status: refusal ? 'blocked' : 'success', refusal, finalState: await stateOf(world) };
}

/** The adapter for Validate now: the Specification 360°'s own act, sent from the request. */
async function validateNow(state: State): Promise<Outcome> {
	const world = worldOf(state);
	seed(world);
	const event = requestEvent({
		path: `/projects/${PROJECT}/spec/validation`,
		method: 'POST',
		body: JSON.stringify({ acts: [{ op: 'validate', itemId: FOCUS, fromRequest: REQUEST }] }),
		params: { projectId: PROJECT },
		services: servicesOf(world),
		authRequired: state['installation.signInRequired'] === true,
		cookies
	});
	let refusal: Outcome['refusal'] = null;
	try {
		const response = await validation.POST(event as never);
		expect(response.status).toBe(200);
	} catch (cause) {
		refusal = await refusalOf(null, cause);
	}
	return { status: refusal ? 'blocked' : 'success', refusal, finalState: await stateOf(world) };
}

beforeEach(() => {
	documents = new Map();
	forgetShortMemos();
});

describe('Validate a touched element now (344ad4b5)', () => {
	it('A person the element waits on validates it from the Simulation [unspa:b8f8a781:344ad4b5:b967cbee]', async () => {
		const run = await validateNow(given());
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'validated_now', 'touched.awaitingChoice': 2 });
	});

	it('Someone the element does not wait on cannot validate it now [unspa:b8f8a781:344ad4b5:627f0ed9]', async () => {
		const run = await validateNow(given({ 'touchedElement.waitsOnMe': false }));
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 403, message: 'This question does not require your validation.' });
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'none', 'touched.awaitingChoice': 3 });
	});

	it('A frozen request takes no choice [unspa:b8f8a781:344ad4b5:0ea59c0a]', async () => {
		const run = await validateNow(given({ 'request.stage': 'implementation' }));
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 400, message: 'The version is frozen: its choices read only.' });
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'none' });
	});

	it('No validation while the team cannot be read [unspa:b8f8a781:344ad4b5:59fc1c97]', async () => {
		const run = await validateNow(given({ 'knowledge.readable': false }));
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 503, message: 'The project team is unavailable. Try again when it is available.' });
	});

	it('A viewer the element waits on validates it now [unspa:b8f8a781:344ad4b5:e84d6dba]', async () => {
		// The viewer leads the validation of this element: it waits on them, who may not write the request.
		const run = await validateNow(given({}, VIEWER));
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'validated_now' });
	});

	it('No validation from a deleted request [unspa:b8f8a781:344ad4b5:d7654bf3]', async () => {
		const run = await validateNow(given({ 'request.status': 'deleted' }));
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 404, message: 'This change request does not exist.' });
		expect((await standingOf(FOCUS))?.state).toBe('todo');
	});

	it('refuses someone outside the workspace as if the project did not exist (rule 276018ca)', async () => {
		const run = await validateNow(given({ 'session.workspaceRole': 'none' }));
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});
});

describe('Set a touched element to validate at the landing (30fa09a3)', () => {
	const atLanding = { op: 'validate_at_landing', elementId: FOCUS };

	it('A team member sets an element to validate at the landing [unspa:b8f8a781:30fa09a3:9809ba7d]', async () => {
		const run = await choose(given({ 'touchedElement.waitsOnMe': false }), atLanding);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 });
		expect(dossier.draft.requests[0].landingChoices?.[FOCUS]).toEqual({ by: mia.id, at: NOW });
	});

	it('A viewer chooses nothing [unspa:b8f8a781:30fa09a3:363037fb]', async () => {
		const run = await choose(given({}, VIEWER), atLanding);
		expect(run.status).toBe('blocked');
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'none', 'touched.awaitingChoice': 3 });
	});

	it('An element validated now is not set to the landing [unspa:b8f8a781:30fa09a3:938d57bc]', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'validated_now' }), atLanding);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This element is validated already.');
		expect(dossier.draft.requests[0].landingChoices).toBeUndefined();
	});

	it('A cancelled request takes no choice [unspa:b8f8a781:30fa09a3:6606f77c]', async () => {
		const run = await choose(given({ 'request.status': 'cancelled' }), atLanding);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This request is cancelled: reopen it first.');
		expect(dossier.draft.requests[0].landingChoices).toBeUndefined();
	});

	it('No choice while Knowledge cannot be read [unspa:b8f8a781:30fa09a3:31f2dc08]', async () => {
		const run = await choose(given({ 'knowledge.readable': false }), atLanding);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('The project team is unavailable. Try again when it is available.');
		expect(dossier.draft.requests[0].landingChoices).toBeUndefined();
	});

	it('An element the block does not list takes no choice [unspa:b8f8a781:30fa09a3:155ddcd3]', async () => {
		// An element the change neither amends nor builds on.
		const run = await choose(given(), { op: 'validate_at_landing', elementId: 'feature:feat-elsewhere' });
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This element is not one this change touches that waits for a validation.');
		expect(dossier.draft.requests[0].landingChoices).toBeUndefined();
	});

	it.each([
		['deleted', 'This request is deleted.'],
		['closed', 'This request is closed.']
	])('refuses a %s request (rules bd977794, e9ea99db)', async (status, message) => {
		const run = await choose(given({ 'request.status': status }), atLanding);
		expect(run.refusal?.message).toBe(message);
	});

	it('refuses someone outside the workspace as if the project did not exist (rule 1aedbfd5)', async () => {
		const run = await choose(given({ 'session.workspaceRole': 'none' }), atLanding);
		expect(run.refusal).toEqual({ status: 404, message: 'Project not found' });
	});

	it('keeps the choices a frozen version was frozen with (rule 837f0cb8)', async () => {
		const run = await choose(given({ 'request.stage': 'implementation' }), atLanding);
		expect(run.refusal?.message).toBe('The version is frozen: its choices read only.');
		expect(dossier.draft.requests[0].landingChoices).toBeUndefined();
	});
});

describe('Take back the choice at the landing (17cf85a6)', () => {
	const takeBack = { op: 'withdraw_landing_validation', elementId: FOCUS };

	it('The choice at the landing is taken back before the freeze [unspa:b8f8a781:17cf85a6:e32ea596]', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 }), takeBack);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'touchedElement.choice': 'none', 'touched.awaitingChoice': 3 });
	});

	it('refuses a viewer: choosing for a request is writing it (rule efea9db4)', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 }, VIEWER), takeBack);
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
	});

	it('keeps the choices a frozen version was frozen with (rule 6ab01cf6)', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2, 'request.stage': 'acceptance' }), takeBack);
		expect(run.refusal?.message).toBe('The version is frozen: its choices read only.');
		expect(dossier.draft.requests[0].landingChoices?.[FOCUS]).toBeDefined();
	});

	it('A closed request keeps its choices [unspa:b8f8a781:17cf85a6:97b7b722]', async () => {
		const run = await choose(given({ 'request.status': 'closed', 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 }), takeBack);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This request is closed.');
		expect(dossier.draft.requests[0].landingChoices?.[FOCUS]).toBeDefined();
	});

	it.each([
		['deleted', 'This request is deleted.'],
		['cancelled', 'This request is cancelled: reopen it first.']
	])('refuses a %s request (rules 6129349d, 1e89ab89)', async (status, message) => {
		const run = await choose(given({ 'request.status': status, 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 }), takeBack);
		expect(run.refusal?.message).toBe(message);
	});

	it('takes back only a choice at the landing: a validation given now is withdrawn in Knowledge (rule 191ad6a7)', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'validated_now' }), takeBack);
		expect(run.refusal?.message).toBe('No choice at the landing to take back.');
	});
});

describe('Set every open element to validate at the landing (21bdc620)', () => {
	const all = { op: 'validate_all_at_landing' };

	it('Choose for all leaves nothing waiting [unspa:b8f8a781:21bdc620:6cb7ae53]', async () => {
		const run = await choose(given(), all);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'touched.awaitingChoice': 0, 'touchedElement.choice': 'at_landing' });
	});

	it('refuses a viewer: choosing for a request is writing it (rule 5e332b2b)', async () => {
		const run = await choose(given({}, VIEWER), all);
		expect(run.refusal).toEqual({ status: 403, message: 'forbidden' });
	});

	it('keeps the choices a frozen version was frozen with (rule a28c3c00)', async () => {
		const run = await choose(given({ 'request.stage': 'delivered' }), all);
		expect(run.refusal?.message).toBe('The version is frozen: its choices read only.');
	});

	it('A deleted request takes no choice for all [unspa:b8f8a781:21bdc620:20ba9beb]', async () => {
		const run = await choose(given({ 'request.status': 'deleted' }), all);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('This request is deleted.');
	});

	it('No choice for all while Knowledge cannot be read [unspa:b8f8a781:21bdc620:aa784d6b]', async () => {
		const run = await choose(given({ 'knowledge.readable': false }), all);
		expect(run.status).toBe('blocked');
		expect(run.refusal?.message).toBe('The project team is unavailable. Try again when it is available.');
		expect(dossier.draft.requests[0].landingChoices).toBeUndefined();
	});

	it.each([
		['closed', 'This request is closed.'],
		['cancelled', 'This request is cancelled: reopen it first.']
	])('refuses a %s request (rules 29c4f24c, f007ab83)', async (status, message) => {
		const run = await choose(given({ 'request.status': status }), all);
		expect(run.refusal?.message).toBe(message);
	});

	it('with every line chosen, there is nothing left to choose for (rule d57f165c)', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 0 }), all);
		expect(run.refusal?.message).toBe('Every listed element has a choice.');
	});
});

/* ───────────── The freeze: the request leaves the Impact analysis ───────────── */

/** A request at the Impact analysis whose readings ran: an amendment of the cart, built on features its diagram links to. */
function freezeWorld(state: State): World {
	const open = Number(state['touched.awaitingChoice']);
	const used = Array.from({ length: Math.max(0, open - 1) }, (_, i) => `feat-used-${i + 1}`);
	const lead = mia;
	const elements: SpecElement[] = [
		{ id: `feature:${F}`, title: 'Cart', place: 'Shop', fingerprint: 'f-cart' },
		...used.map((id, i) => ({ id: `feature:${id}`, title: `Used ${i + 1}`, place: 'Shop', fingerprint: `f-${id}` }))
	];
	const started = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'start_review', total: elements.length }], { actor: lead, now: NOW });
	if (!started.ok) throw new Error(started.reason);
	const diagram = ['actor Person', ...used.map((id, i) => `use case Use ${i + 1}: Person @[Used ${i + 1}](feature:${id})`)].join('\n');
	const base = createEvolutionRequest({ id: REQUEST, title: 'Cart limit', stage: 'coherence', status: 'open', leafIds: [F] });
	const request: EvolutionRequest = {
		...base,
		drafts: [createDraftLeaf({ id: 'draft:cart', kind: 'amend', baseLeafId: F })],
		stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram } },
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: NOW },
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: NOW },
		frozenVersions: [],
		specVersion: Number(state['request.frozenVersion'] ?? 0)
	};
	return { state, request, elements, doc: started.doc };
}

/** The services the freeze reaches besides the doors: the behaviour of the touched feature, its code, the baselines. */
function freezeServices(world: World) {
	return servicesWith({
		...partsOf(world),
		readBehaviorFeature: { execute: async () => null },
		// No code was adopted yet: the touched feature has no implementation status to read.
		codeAdoption: { available: false },
		// The engine answers for the drafted feature: the amendment draws no behaviour of its own.
		simulateBehavior: { execute: async () => ({ kind: 'walk', walk: { ok: true } }), draftFeatureWalk: async () => null }
	} as never);
}

/** The adapter for the freeze: cross_stage through the request's door, then read the block and the request back. */
async function freeze(state: State): Promise<Outcome & { readonly request: EvolutionRequest }> {
	const world = freezeWorld(state);
	seed(world);
	expect((await readBlock(world)).awaitingChoice).toBe(state['touched.awaitingChoice']);
	const event = requestEvent({
		path: '/api/evolution',
		method: 'POST',
		body: JSON.stringify({ projectId: PROJECT, operations: [{ op: 'cross_stage', requestId: REQUEST }] }),
		services: freezeServices(world),
		authRequired: true,
		cookies
	});
	let response: Response | null = null;
	let cause: unknown = null;
	try {
		response = await POST(event as never);
	} catch (e) {
		cause = e;
	}
	const refusal = await refusalOf(response, cause);
	const reading = await readBlock(world);
	const request = dossier.draft.requests[0];
	return { status: refusal ? 'blocked' : 'success', refusal, request, finalState: { 'request.stage': request.stage, 'touched.awaitingChoice': reading.awaitingChoice } };
}

describe('Record that the version was frozen (c11a6cd7)', () => {
	it('The version is frozen [unspa:b8f8a781:c11a6cd7:af0f18a6]', async () => {
		const run = await freeze(given({ 'request.stage': 'coherence' }));
		expect(run.refusal).toBeNull();
		expect(run.finalState).toMatchObject({ 'request.stage': 'implementation' });
		expect(run.request.frozen).toBe(true);
	});

	it('The freeze sets what is left to the landing [unspa:b8f8a781:c11a6cd7:9295af23]', async () => {
		const run = await freeze(given({ 'request.stage': 'coherence', 'touched.awaitingChoice': 2 }));
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'request.stage': 'implementation', 'touched.awaitingChoice': 0 });
	});
});

/* ───────────── The acceptance criteria EVO-003 brings ───────────── */

/** The board as the Specification 360° reads it, from the stored document. */
async function standingOf(id: string) {
	const { loadRetrospecDocument } = await import('$application/retrospec/retrospec-store');
	const { specValidationBoard } = await import('$domain/retrospec');
	const { doc } = await loadRetrospecDocument(sectionDocuments, PROJECT);
	const team = [mia, leo, pat].map((person) => ({ person, jobIds: [] as string[] }));
	return specValidationBoard({ doc, elements: scene.elements as SpecElement[], team, viewer: mia, baselines: [] }).standings[id];
}

describe('what the Simulation lists', () => {
	it('lists every existing element the change amends, removes from or builds on that Knowledge has not validated, with where it sits and whom it waits on [criterion:ac-leaf-769057fc-7031-4939-bb83-26035517e7c6]', async () => {
		const world = worldOf(given({ 'touchedElement.waitsOnMe': false, 'touched.awaitingChoice': 1 }));
		const used: SpecElement = { id: 'feature:feat-pay', title: 'Payments', place: 'Shop', fingerprint: 'f-pay' };
		const rule: SpecElement = { id: `rule:${F}:r9`, title: 'At most ten items', place: 'Shop › Cart', under: `action:${F}:a9`, fingerprint: 'f-r9' };
		const removedFrom: SpecElement = { ...actionElement('a9') };
		const base = world.request;
		const request: EvolutionRequest = {
			...base,
			drafts: base.drafts.map((d) => ({ ...d, behaviourModel: { ...d.behaviourModel!, operations: [...d.behaviourModel!.operations, { kind: 'remove_action_rule', actionId: 'a9', ruleId: 'r9' }] } })),
			stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: 'actor Buyer\nuse case Pay: Buyer @[Payments](feature:feat-pay)' } }
		};
		seed({ ...world, request, elements: [...world.elements, removedFrom, rule, used] });
		const reading = await readBlock({ ...world, request });
		expect(reading.lines.map((l) => [l.id, l.relation, l.place, l.waitsOn.map((p) => p.name)])).toEqual([
			[FOCUS, 'amended', 'Shop › Cart', ['Leo']],
			[`action:${F}:a9`, 'amended', 'Shop › Cart', ['Leo']],
			['feature:feat-pay', 'used', 'Shop', ['Leo']]
		]);
		expect(reading.lines.every((l) => !l.waitsOnMe)).toBe(true);
	});

	it('lists neither an element a draft removes nor one already validated [criterion:ac-leaf-d7f48fff-50fa-4cf6-a650-c557f9bb6a2c]', async () => {
		const world = worldOf(given({ 'touchedElement.choice': 'validated_now', 'touched.awaitingChoice': 1 }));
		const gone: SpecElement = actionElement('a7');
		const goneRule: SpecElement = { id: `rule:${F}:r7`, title: 'Rule of a7', place: 'Shop › Cart', under: gone.id, fingerprint: 'f-r7' };
		const base = world.request;
		const request: EvolutionRequest = {
			...base,
			drafts: base.drafts.map((d) => ({ ...d, behaviourModel: { ...d.behaviourModel!, operations: [...d.behaviourModel!.operations, { kind: 'remove_action', actionId: 'a7' }] } }))
		};
		seed({ ...world, request, elements: [...world.elements, gone, goneRule] });
		const reading = await readBlock({ ...world, request });
		const listed = reading.lines.map((l) => l.id);
		// The feature and the action validated in Knowledge, the action a draft removes and its rule: none is listed.
		expect(listed).toEqual([`action:${F}:a2`]);
		expect(reading.validated).toEqual([`feature:${F}`, FOCUS]);
	});

	it('says when Knowledge cannot be read and lists nothing, the rest of the Simulation reading as usual [criterion:ac-leaf-2111a3f1-877e-4492-817c-53eea4e50554]', async () => {
		const world = worldOf(given({ 'knowledge.readable': false }));
		seed(world);
		forgetShortMemos();
		const services = servicesOf(world);
		const read = (path: string) => GET(requestEvent({ path, services, authRequired: true, cookies }) as never);
		const block = (await (await read(`/api/evolution?projectId=${PROJECT}&requestId=${REQUEST}&part=knowledge`)).json()) as { knowledge: TouchedReading };
		expect(block.knowledge).toEqual({ readable: false, specValidated: false, lines: [], awaitingChoice: 0, validated: [] });
		const impact = await read(`/api/evolution?projectId=${PROJECT}&requestId=${REQUEST}&part=impact`);
		expect(impact.status).toBe(200);
		expect(((await impact.json()) as { request: { impact: { status: string } } }).request.impact.status).toBe('not_run');
	});
});

describe('the choices of the block', () => {
	it('Validate now validates the element in Knowledge at once, for whom it waits on only [criterion:ac-leaf-5ca7229b-7761-4e8d-83ce-7b37e33703c3]', async () => {
		const refused = await validateNow(given({ 'touchedElement.waitsOnMe': false }));
		expect(refused.refusal?.message).toBe('This question does not require your validation.');
		expect((await standingOf(FOCUS))?.state).toBe('todo');
		const done = await validateNow(given());
		expect(done.status).toBe('success');
		expect(await standingOf(FOCUS)).toMatchObject({ state: 'ok', validatedBy: [mia] });
	});

	it('Validate at the landing is taken by anyone who may write the request, and taken back until the freeze [criterion:ac-leaf-3baeaf02-f697-46e6-b9da-111549c79ec1]', async () => {
		// The element waits on Leo: Mia, who may write the request, still chooses the landing for it.
		const chosen = await choose(given({ 'touchedElement.waitsOnMe': false }), { op: 'validate_at_landing', elementId: FOCUS });
		expect(chosen.finalState['touchedElement.choice']).toBe('at_landing');
		const back = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 }), { op: 'withdraw_landing_validation', elementId: FOCUS });
		expect(back.finalState['touchedElement.choice']).toBe('none');
		const frozen = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2, 'request.stage': 'implementation' }), { op: 'withdraw_landing_validation', elementId: FOCUS });
		expect(frozen.refusal?.message).toBe('The version is frozen: its choices read only.');
		const viewer = await choose(given({}, VIEWER), { op: 'validate_at_landing', elementId: FOCUS });
		expect(viewer.refusal?.status).toBe(403);
	});

	it('Choose for all sets every line still open to the landing and leaves a line chosen before as it was [criterion:ac-leaf-5d001101-89ec-4879-8334-486345e70947]', async () => {
		const run = await choose(given({ 'touchedElement.choice': 'at_landing', 'touched.awaitingChoice': 2 }), { op: 'validate_all_at_landing' });
		expect(run.finalState['touched.awaitingChoice']).toBe(0);
		const choices = dossier.draft.requests[0].landingChoices ?? {};
		expect(Object.keys(choices).sort()).toEqual([FOCUS, `action:${F}:a2`, `action:${F}:a3`].sort());
		expect(choices[FOCUS]).toEqual({ by: mia.id, at: NOW });
	});

	it('a validation given from the Simulation is the very act of the Specification 360°, under its rules [criterion:ac-leaf-f3b2dfe9-1512-479a-983d-95c3fd45f90b]', async () => {
		await validateNow(given());
		const fromSimulation = (await import('$application/retrospec/retrospec-store')).loadRetrospecDocument(sectionDocuments, PROJECT);
		const simulated = (await fromSimulation).doc;
		// The same act sent from the Specification 360°, without the request.
		const world = worldOf(given());
		seed(world);
		const event = requestEvent({ path: `/projects/${PROJECT}/spec/validation`, method: 'POST', body: JSON.stringify({ acts: [{ op: 'validate', itemId: FOCUS }] }), params: { projectId: PROJECT }, services: servicesOf(world), authRequired: true, cookies });
		expect((await validation.POST(event as never)).status).toBe(200);
		const direct = (await (await import('$application/retrospec/retrospec-store')).loadRetrospecDocument(sectionDocuments, PROJECT)).doc;
		// The two were given a moment apart: the same verdict, at whatever time each was given.
		const verdicts = (doc: RetrospecDocument) => JSON.stringify(doc.runs.map((r) => r.verdicts[FOCUS])).replace(/"at":"[^"]*"/g, '"at":"*"');
		expect(verdicts(simulated)).toBe(verdicts(direct));
		// The same refusal for someone it does not wait on, from either place.
		const refused = await validateNow(given({ 'touchedElement.waitsOnMe': false }));
		expect(refused.refusal).toEqual({ status: 403, message: 'This question does not require your validation.' });
	});
});

describe('the freeze and the choices', () => {
	it('freezing sets every element still without a choice to Validate at the landing, and the history of the request records it [criterion:ac-leaf-dcb7269e-a05d-45a7-b34a-0a6509094c7c]', async () => {
		const run = await freeze(given({ 'request.stage': 'coherence', 'touched.awaitingChoice': 2 }));
		expect(run.request.landingChoices).toEqual({
			[`feature:${F}`]: { by: mia.id, at: NOW, atFreeze: true },
			'feature:feat-used-1': { by: mia.id, at: NOW, atFreeze: true }
		});
		const recorded = run.request.history.find((h) => h.type === 'knowledge_validation');
		expect(recorded?.summary).toBe('The freeze set 2 elements this change touches, still without a choice, to Validate at the landing: Cart, Used 1.');
		// The frozen version carries the choices it was frozen with.
		expect(run.request.frozenVersions.at(-1)?.snapshot?.landingChoices).toEqual(run.request.landingChoices);
	});

	it('a frozen request takes no validation choice until a rebrief reopens it [criterion:ac-leaf-5c0eb653-4472-4a4b-aeaf-b6b6e626bfac]', async () => {
		const frozen = await choose(given({ 'request.stage': 'implementation' }), { op: 'validate_at_landing', elementId: FOCUS });
		expect(frozen.refusal?.message).toBe('The version is frozen: its choices read only.');
		const world = worldOf(given({ 'request.stage': 'implementation' }));
		seed(world);
		const send = (operations: unknown[]) =>
			POST(requestEvent({ path: '/api/evolution', method: 'POST', body: JSON.stringify({ projectId: PROJECT, operations }), services: freezeServices(world), authRequired: true, cookies }) as never);
		const reopened = await send([
			{ op: 'rebrief', requestId: REQUEST },
			{ op: 'validate_at_landing', requestId: REQUEST, elementId: FOCUS }
		]);
		expect(reopened.status).toBe(200);
		expect(dossier.draft.requests[0].stage).toBe('specification');
		expect(dossier.draft.requests[0].landingChoices?.[FOCUS]).toEqual({ by: mia.id, at: NOW });
	});
});
