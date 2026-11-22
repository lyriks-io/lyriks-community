import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { SectionDocumentStorePort } from '$application/ports';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { parseSpecValidationActs } from '$application/specification/parse-spec-validation-acts';
import { createEmptyIdentityDraft } from '$domain/foundation';
import {
	RETROSPEC_SECTION,
	SPEC360_TAB,
	applyRetrospecActs,
	currentRun,
	emptyRetrospecDocument,
	retrospecEvents,
	samePersonRef,
	specValidationBoard,
	waitingOn,
	type PersonRef,
	type RetrospecAct,
	type RetrospecDocument,
	type SpecElement,
	type TeamMember
} from '$domain/retrospec';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { forgetShortMemos } from '$lib/server/short-memo.server';
import { readSpecValidationBoard } from '$lib/server/spec-validation.server';

const elementsRead = vi.hoisted(() => ({ current: [] as readonly SpecElement[] }));
vi.mock('$lib/server/spec-elements.server', () => ({ readSpecElements: async () => elementsRead.current }));
const { POST } = await import('./+server');

/**
 * The scenarios of the screen "Validation of a draft specification"
 * (feature feat-lyriks-copy-a52881-164, surface 2e49df91), run through the real
 * door: POST /projects/:projectId/spec/validation, its project access gate, the
 * acts parser, the server's validation acts and the board read from the stored
 * Reverse-Specification document. Only the IO edges are faked: the section
 * store, the elements the spec holds, the project roster and the access port.
 */

const NOW = '2026-11-20T09:00:00.000Z';
const PROJECT = 'p';
/** The reader. */
const mia: PersonRef = { id: 'mia@company.test', name: 'Mia' };
/** A colleague who leads the validation when the reader does not. */
const leo: PersonRef = { id: 'leo@company.test', name: 'Leo' };
/** A colleague who holds the job owning the element when it waits on two. */
const pat: PersonRef = { id: 'pat@company.test', name: 'Pat' };
/** The element every scenario looks at: a feature, owned by the product job. */
const FOCUS = 'feature:refunds';
const OWNING_JOB = 'product';

/** The state a scenario starts from, by the spec's dotted paths. */
type State = Readonly<Record<string, unknown>>;

/** The defaults of the surface for every declared path (export_behavior_scenarios initialState). */
const SURFACE_DEFAULTS: State = {
	'installation.signInRequired': true,
	'session.workspaceRole': 'designer',
	'specification.state': 'draft',
	'element.inSpec': true,
	'element.waitsOnMe': true,
	'element.required': 1,
	'element.validations': 0,
	'element.byMe': false,
	'element.outsideValidations': 0,
	'element.settled': false,
	'element.rejected': false,
	'spec.waitingOnMe': 3,
	'reminders.sent': 0,
	'validationController.maySend': false,
	'validationRequests.sent': 0,
	'validationRequests.people': [],
	'validationRoster.available': true,
	'topicReview.defaultRequired': false
};

/** The personas of the feature and their state overrides. */
const PERSONAS = {
	/** da0fa5f8 Viewer: a workspace member who reads the project only. */
	viewer: { 'session.workspaceRole': 'viewer' },
	/** eb133d6e Outside the workspace. */
	outside: { 'session.workspaceRole': 'none' },
	/** 9b3bddf4 Community operator: the one account of a Community installation. */
	operator: { 'session.workspaceRole': 'operator' }
} as const satisfies Record<string, State>;

/** The persona's overrides, then the scenario's, on top of the surface defaults. */
function given(overrides: State = {}, persona?: keyof typeof PERSONAS): State {
	return { ...SURFACE_DEFAULTS, ...(persona ? PERSONAS[persona] : {}), ...overrides };
}

/** What the scenario's parameters add to the world it starts from. */
interface Shape {
	/** The colleague a reminder names: still awaited, or validated meanwhile. */
	readonly colleague?: 'awaited' | 'validated';
	/** Elements of the specification besides the focused one, each waiting on the same people. */
	readonly others?: number;
}

/** The project as the server will read it: who may write, the elements, the roster, the stored document. */
interface World {
	readonly state: State;
	readonly writer: boolean;
	readonly community: boolean;
	readonly elements: readonly SpecElement[];
	readonly team: readonly TeamMember[];
	readonly doc: RetrospecDocument;
}

const elementOf = (id: string): SpecElement => ({ id, title: id.split(':')[1] ?? id, owner: 'product' });

/**
 * The world a state stands for. The element waits on its lead and on whoever
 * holds the job owning it: the reader leads when they may write and it waits
 * on them; a reader without editing rights waits only through that job; when
 * it does not wait on the reader, Leo leads. Pat holds the job when a second
 * person must validate, or when the reminder names him.
 */
function worldOf(state: State, shape: Shape = {}): World {
	const role = String(state['session.workspaceRole']);
	const writer = state['installation.signInRequired'] === false || (role !== 'viewer' && role !== 'none');
	const community = role === 'operator';
	const waitsOnMe = state['element.waitsOnMe'] === true;
	const required = Number(state['element.required']);
	const lead = waitsOnMe ? (writer ? mia : required > 1 ? leo : null) : leo;
	const owners: PersonRef[] = waitsOnMe && !writer ? [mia] : [];
	if (!community && ((lead ? 1 : 0) + owners.length < required || shape.colleague)) owners.push(pat);
	const team: TeamMember[] = community ? [] : [mia, leo, pat].map((person) => ({ person, jobIds: owners.some((o) => samePersonRef(o, person)) ? [OWNING_JOB] : [] }));

	const all = [FOCUS, ...Array.from({ length: shape.others ?? 2 }, (_, i) => `feature:other-${i + 1}`)].map(elementOf);
	let doc = emptyRetrospecDocument();
	const act = (acts: RetrospecAct[], actor: PersonRef, reviewOnly = false) => {
		const outcome = applyRetrospecActs(doc, acts, { actor, now: NOW, reviewOnly });
		if (!outcome.ok) throw new Error(outcome.reason);
		doc = outcome.doc;
	};
	// The run the validation happens on; a reader's own first act leaves it without a lead.
	act([{ op: 'start_review', total: all.length }], lead ?? mia, lead === null);
	const validators: PersonRef[] = state['element.byMe'] === true ? [mia] : [];
	let counted = state['element.byMe'] === true && waitsOnMe ? 1 : 0;
	for (const person of [...(lead ? [lead] : []), ...owners]) {
		if (samePersonRef(person, mia) || counted >= Number(state['element.validations'])) continue;
		validators.push(person);
		counted++;
	}
	if (shape.colleague === 'validated' && !validators.some((v) => samePersonRef(v, pat))) validators.push(pat);
	for (const person of validators) act([{ op: 'validate', itemId: FOCUS, title: 'refunds', tab: SPEC360_TAB }], person);
	if (state['element.rejected'] === true) act([{ op: 'reject', itemId: FOCUS, title: 'refunds', tab: SPEC360_TAB }], lead ?? leo);
	if (state['specification.state'] === 'validated') doc = { ...doc, runs: doc.runs.map((run) => ({ ...run, publishedAt: NOW, publishedBy: lead ?? leo })) };
	const elements = state['element.inSpec'] === false ? all.filter((e) => e.id !== FOCUS) : all;
	return { state, writer, community, elements, team, doc };
}

/** The Reverse-Specification document as the section store keeps it, revision by revision. */
let documents: Map<string, { doc: unknown; revision: number }>;
const sectionDocuments = {
	load: async (projectId, section) => documents.get(`${projectId}/${section}`)?.doc ?? null,
	save: async (projectId, section, doc, expected) => {
		const now = documents.get(`${projectId}/${section}`)?.revision ?? 0;
		if (expected !== null && expected !== now) return null;
		documents.set(`${projectId}/${section}`, { doc, revision: now + 1 });
		return now + 1;
	},
	currentRevision: async (projectId, section) => documents.get(`${projectId}/${section}`)?.revision ?? 0
} satisfies SectionDocumentStorePort;

/** The ports the door reaches: the access decision of the role, the roster of the world, the store. */
function servicesOf(world: World) {
	const role = String(world.state['session.workspaceRole']);
	const roster = world.team.map((m) => ({ email: m.person.id, name: m.person.name, jobIds: [...m.jobIds], names: m.jobIds.map(() => 'Product') }));
	return servicesWith({
		sectionDocuments,
		currentSession: () => ({ isAuthenticated: true, email: mia.id }),
		identity: { multiUser: !world.community },
		installEdition: () => (world.community ? 'community' : 'enterprise'),
		resolveActiveProject: { execute: async () => null },
		enterpriseHooks: null,
		projectExists: async () => true,
		projectAccess: {
			authorize: async (_project, _token, action) =>
				role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
		},
		backLinks: { find: async () => ({ backWorkspaceId: 'ws' }) as never },
		workspaces: { listForCaller: async () => [{ id: 'ws' }] as never },
		resolveActiveMemberName: { execute: async () => mia.name },
		teamJobs: {
			forProject: async () => new Map(),
			participantsForProject: async () => {
				if (world.state['validationRoster.available'] === false) throw new Error('roster offline');
				return roster;
			}
		},
		loadBaselinesDraft: { execute: async () => ({ baselines: [] }) as never },
		loadFoundationDraft: { loadIdentity: async () => ({ ...createEmptyIdentityDraft(PROJECT), productName: 'Product' }) }
	});
}

/** The scenario's paths read back from a stored document, the way the server reads the board. */
function stateOf(world: World, doc: RetrospecDocument): State {
	const board = specValidationBoard({ doc, elements: world.elements, team: world.team, viewer: world.writer ? mia : null, baselines: [] });
	const s = board.standings[FOCUS];
	const required = (p: PersonRef) => !!s?.required.some((r) => samePersonRef(r, p));
	return {
		'specification.state': board.summary.state,
		'element.inSpec': !!s,
		'element.waitsOnMe': required(mia),
		'element.required': s?.required.length ?? 0,
		'element.validations': s?.validatedBy.filter(required).length ?? 0,
		'element.byMe': !!s?.validatedBy.some((p) => samePersonRef(p, mia)),
		'element.outsideValidations': s?.validatedBy.filter((p) => !required(p)).length ?? 0,
		'element.settled': s?.state === 'ok',
		'element.rejected': !!s?.rejected,
		'spec.waitingOnMe': waitingOn(board, mia).length,
		'reminders.sent': currentRun(doc)?.reminders?.length ?? 0
	};
}

const ELEMENT_PATHS = ['element.waitsOnMe', 'element.required', 'element.validations', 'element.byMe', 'element.outsideValidations', 'element.settled', 'element.rejected'];
const pick = (state: State, paths: readonly string[]) => Object.fromEntries(paths.map((path) => [path, state[path]]));

/** Store the world and check it reads as the scenario's Given before anything is sent. */
function seed(world: World, paths: readonly string[]) {
	documents.set(`${PROJECT}/${RETROSPEC_SECTION}`, { doc: world.doc, revision: 1 });
	elementsRead.current = world.elements;
	expect(pick(stateOf(world, world.doc), paths)).toEqual(pick(world.state, paths));
}

interface Outcome {
	readonly status: 'success' | 'blocked';
	readonly refusal: { readonly status: number; readonly message: string } | null;
	/** Something was written to the store. */
	readonly saved: boolean;
	readonly finalState: State;
	readonly doc: RetrospecDocument;
}

/** The adapter: POST the body through the route, then read the stored document back. */
async function post(world: World, body: unknown): Promise<Outcome> {
	const before = await sectionDocuments.currentRevision(PROJECT, RETROSPEC_SECTION);
	const event = requestEvent({
		path: `/projects/${PROJECT}/spec/validation`,
		method: 'POST',
		body: JSON.stringify(body),
		params: { projectId: PROJECT },
		services: servicesOf(world),
		authRequired: world.state['installation.signInRequired'] === true,
		cookies: { lyriks_session: 'token' }
	});
	let refusal: Outcome['refusal'] = null;
	try {
		const response = await POST(event as never);
		expect(response.status).toBe(200);
	} catch (cause) {
		if (!isHttpError(cause)) throw cause;
		refusal = { status: cause.status, message: cause.body.message };
	}
	const { doc, revision } = await loadRetrospecDocument(sectionDocuments, PROJECT);
	return { status: refusal ? 'blocked' : 'success', refusal, saved: revision !== before, finalState: stateOf(world, doc), doc };
}

/** One act on the focused element, from the scenario's state. */
async function invoke(state: State, act: Record<string, unknown>, shape: Shape = {}, checked: readonly string[] = ELEMENT_PATHS): Promise<Outcome> {
	const world = worldOf(state, shape);
	seed(world, state['element.inSpec'] === false ? ['specification.state'] : ['specification.state', ...checked]);
	return post(world, { acts: [act] });
}

function expectBlocked(outcome: Outcome, status: number, message?: string) {
	expect(outcome.status).toBe('blocked');
	expect(outcome.refusal?.status).toBe(status);
	if (message) expect(outcome.refusal?.message).toBe(message);
	expect(outcome.saved).toBe(false);
}

beforeEach(() => {
	documents = new Map();
	elementsRead.current = [];
	forgetShortMemos();
});

describe('Validate an element (942d5827)', () => {
	const validate = { op: 'validate', itemId: FOCUS };

	it('The lead validates an element only they wait on [unspa:2e49df91:942d5827:0c634b61]', async () => {
		const run = await invoke(given(), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.validations': 1, 'element.settled': true, 'element.byMe': true });
	});

	it('An element waiting on two is not validated by one [unspa:2e49df91:942d5827:68c4661c]', async () => {
		const run = await invoke(given({ 'element.required': 2 }), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.validations': 1, 'element.settled': false });
	});

	it('The last awaited validation settles the element [unspa:2e49df91:942d5827:d9ace32f]', async () => {
		const run = await invoke(given({ 'element.required': 2, 'element.validations': 1 }), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.validations': 2, 'element.settled': true });
	});

	it('A validation from someone the element does not wait on is refused [unspa:2e49df91:942d5827:bd8cac7c]', async () => {
		const run = await invoke(given({ 'element.waitsOnMe': false }), validate);
		expectBlocked(run, 403, 'This question does not require your validation.');
	});

	it('Validating twice changes nothing [unspa:2e49df91:942d5827:df5c085a]', async () => {
		const run = await invoke(given({ 'element.byMe': true, 'element.validations': 1, 'element.settled': true }), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.validations': 1 });
		expect(run.saved).toBe(false);
	});

	it('Validating an element whose change was requested restores it [unspa:2e49df91:942d5827:ca686d4d]', async () => {
		const run = await invoke(given({ 'element.rejected': true }), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.rejected': false, 'element.validations': 1 });
	});

	it('An unassigned viewer cannot validate [unspa:2e49df91:942d5827:6c9ce9d6]', async () => {
		const run = await invoke(given({ 'element.waitsOnMe': false }, 'viewer'), validate);
		expectBlocked(run, 403, 'This question does not require your validation.');
	});

	it('Someone outside the workspace cannot validate [unspa:2e49df91:942d5827:aeacfe3b]', async () => {
		const run = await invoke(given({}, 'outside'), validate);
		expectBlocked(run, 404, 'Project not found');
	});

	it('A validated specification takes no more validations [unspa:2e49df91:942d5827:8930242e]', async () => {
		const run = await invoke(given({ 'specification.state': 'validated' }), validate);
		expectBlocked(run, 400, 'The specification is already validated.');
	});

	it('An element removed meanwhile cannot be validated [unspa:2e49df91:942d5827:82416d9a]', async () => {
		const run = await invoke(given({ 'element.inSpec': false }), validate);
		expectBlocked(run, 400, 'This element is no longer in the specification. Reload the page.');
	});

	it('Without sign-in a viewer validates [unspa:2e49df91:942d5827:bc08178b]', async () => {
		const run = await invoke(given({ 'installation.signInRequired': false, 'session.workspaceRole': 'viewer' }), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.byMe': true });
	});

	it('The Community operator validates [unspa:2e49df91:942d5827:f81f1ef7]', async () => {
		const run = await invoke(given({}, 'operator'), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.settled': true });
	});

	it('A rejected element is validated again once corrected [unspa:2e49df91:942d5827:1b6b2613]', async () => {
		const world = worldOf(given());
		seed(world, ELEMENT_PATHS);
		// Step: Request a change (187d271b) with "Name the refund limit.", which the page posts as a discussion.
		const step = await post(world, { acts: [{ op: 'reject', itemId: FOCUS }] });
		expect(step.status).toBe('success');
		const run = await post(world, { acts: [validate] });
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.rejected': false, 'element.settled': true });
	});

	it('An assigned viewer validates their own question [unspa:2e49df91:942d5827:bc8c3a3c]', async () => {
		const run = await invoke(given({ 'session.workspaceRole': 'viewer', 'element.waitsOnMe': true }), validate);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.byMe': true, 'element.settled': true });
	});

	it('No approval while the current validation roster is unavailable [unspa:2e49df91:942d5827:e7eea79e]', async () => {
		const run = await invoke(given({ 'validationRoster.available': false }), validate);
		expectBlocked(run, 503, 'The project team is unavailable. Try again when it is available.');
	});
});

describe('Withdraw my validation (4f151e72)', () => {
	const withdraw = { op: 'withdraw', itemId: FOCUS };

	it('A person withdraws their validation [unspa:2e49df91:4f151e72:cbf5af0e]', async () => {
		const run = await invoke(given({ 'element.byMe': true, 'element.validations': 1, 'element.settled': true }), withdraw);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.validations': 0, 'element.settled': false, 'element.byMe': false });
	});

	it('Withdrawing what one did not validate changes nothing [unspa:2e49df91:4f151e72:dcdeb1f5]', async () => {
		const run = await invoke(given(), withdraw);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.validations': 0 });
		expect(run.saved).toBe(false);
	});

	it('A validation that counted for nothing can be withdrawn [unspa:2e49df91:4f151e72:da8670ef]', async () => {
		const run = await invoke(given({ 'element.waitsOnMe': false, 'element.byMe': true, 'element.outsideValidations': 1 }), withdraw);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.outsideValidations': 0 });
	});

	it('An unassigned viewer cannot withdraw a required approval [unspa:2e49df91:4f151e72:dd52d8d3]', async () => {
		const run = await invoke(given({ 'element.waitsOnMe': false, 'element.byMe': true, 'element.outsideValidations': 1 }, 'viewer'), withdraw);
		expectBlocked(run, 403, 'This question does not require your validation.');
	});

	it('Someone outside the workspace cannot withdraw [unspa:2e49df91:4f151e72:0628a1e3]', async () => {
		const run = await invoke(given({}, 'outside'), withdraw);
		expectBlocked(run, 404, 'Project not found');
	});

	it('A validated specification keeps its validations [unspa:2e49df91:4f151e72:407ddf7f]', async () => {
		const run = await invoke(given({ 'specification.state': 'validated', 'element.byMe': true, 'element.validations': 1, 'element.settled': true }), withdraw);
		expectBlocked(run, 400, 'The specification is already validated.');
		expect(run.finalState).toMatchObject({ 'element.byMe': true, 'element.validations': 1 });
	});

	it('A withdrawal on an element removed meanwhile is refused [unspa:2e49df91:4f151e72:8afce342]', async () => {
		const run = await invoke(given({ 'element.inSpec': false }), withdraw);
		expectBlocked(run, 400, 'This element is no longer in the specification. Reload the page.');
	});

	it('An assigned viewer withdraws only their own approval [unspa:2e49df91:4f151e72:b536ea22]', async () => {
		const state = given({ 'session.workspaceRole': 'viewer', 'element.waitsOnMe': true, 'element.byMe': true, 'element.validations': 1, 'element.settled': true });
		const run = await invoke(state, withdraw);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.byMe': false, 'element.validations': 0, 'element.settled': false });
	});
});

describe('Request a change (187d271b)', () => {
	// What should change is posted by the page as a discussion: the server neither needs it nor stores it with the request.
	const reject = { op: 'reject', itemId: FOCUS };

	it('A change requested wipes every validation [unspa:2e49df91:187d271b:bcf74c0f]', async () => {
		const run = await invoke(given({ 'element.byMe': true, 'element.validations': 1, 'element.settled': true }), reject);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.rejected': true, 'element.validations': 0, 'element.settled': false });
	});

	it('The server takes a change request with no words [unspa:2e49df91:187d271b:2a3236e2]', async () => {
		const run = await invoke(given(), reject);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'element.rejected': true });
	});

	it('A viewer cannot request a change [unspa:2e49df91:187d271b:56391cc2]', async () => {
		const run = await invoke(given({}, 'viewer'), reject);
		expectBlocked(run, 403, 'Only a project editor may change validation assignments or the specification.');
	});

	it('Someone outside the workspace cannot request a change [unspa:2e49df91:187d271b:68311aff]', async () => {
		const run = await invoke(given({}, 'outside'), reject);
		expectBlocked(run, 404, 'Project not found');
	});

	it('A validated specification takes no change request [unspa:2e49df91:187d271b:f2024e56]', async () => {
		const run = await invoke(given({ 'specification.state': 'validated' }), reject);
		expectBlocked(run, 400, 'The specification is already validated.');
	});

	it('A change request on an element removed meanwhile is refused [unspa:2e49df91:187d271b:e1ceaa58]', async () => {
		const run = await invoke(given({ 'element.inSpec': false }), reject);
		expectBlocked(run, 400, 'This element is no longer in the specification. Reload the page.');
	});
});

describe('Remind a colleague (c917f478)', () => {
	type To = 'awaited_colleague' | 'colleague_not_awaited' | 'myself';
	/** The colleague (or the reader) the reminder names, and what that says of the world. */
	const remind = (state: State, to: To) => {
		const shape: Shape = to === 'awaited_colleague' ? { colleague: 'awaited' } : to === 'colleague_not_awaited' ? { colleague: 'validated' } : {};
		// Naming a colleague puts him among the people the element waits on: the counts are his world's, not the defaults'.
		const checked = shape.colleague ? ['element.waitsOnMe', 'element.byMe', 'element.rejected'] : ELEMENT_PATHS;
		return invoke(state, { op: 'remind', itemId: FOCUS, to: to === 'myself' ? mia.id : pat.id }, shape, checked);
	};

	it('A person reminds a colleague still awaited [unspa:2e49df91:c917f478:14c3d3ec]', async () => {
		const run = await remind(given(), 'awaited_colleague');
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'reminders.sent': 1 });
		// validation.reminder_sent: the colleague is notified.
		const events = retrospecEvents(run.doc, { projectId: PROJECT, productName: 'Product', auditEntries: [] });
		expect(events.filter((e) => e.kind === 'reminder')).toEqual([expect.objectContaining({ toEmail: pat.id })]);
	});

	it('A colleague the element no longer waits on is not reminded [unspa:2e49df91:c917f478:4568e243]', async () => {
		const run = await remind(given(), 'colleague_not_awaited');
		expectBlocked(run, 400, 'This person no longer has to validate this element.');
	});

	it('Nobody reminds themselves [unspa:2e49df91:c917f478:586cdc53]', async () => {
		const run = await remind(given(), 'myself');
		expectBlocked(run, 400, 'Validate it yourself: the reminder is for someone else.');
	});

	it('A reader who validated is no longer awaited [unspa:2e49df91:c917f478:2f0adb4d]', async () => {
		const run = await remind(given({ 'element.byMe': true, 'element.validations': 1, 'element.settled': true }), 'myself');
		expectBlocked(run, 400, 'This person no longer has to validate this element.');
	});

	it('A viewer cannot remind [unspa:2e49df91:c917f478:05aae9ba]', async () => {
		const run = await remind(given({}, 'viewer'), 'awaited_colleague');
		expectBlocked(run, 403, 'Only a project editor may change validation assignments or the specification.');
	});

	it('Someone outside the workspace cannot remind [unspa:2e49df91:c917f478:9eb611e6]', async () => {
		const run = await remind(given({}, 'outside'), 'awaited_colleague');
		expectBlocked(run, 404, 'Project not found');
	});

	it('Nothing is reminded once the specification is validated [unspa:2e49df91:c917f478:65120510]', async () => {
		const run = await remind(given({ 'specification.state': 'validated' }), 'awaited_colleague');
		expectBlocked(run, 400, 'The specification is already validated.');
		expect(run.finalState).toMatchObject({ 'reminders.sent': 0 });
	});

	it('A reminder on an element removed meanwhile is refused [unspa:2e49df91:c917f478:46f8cbbf]', async () => {
		const run = await remind(given({ 'element.inSpec': false }), 'awaited_colleague');
		expectBlocked(run, 400, 'This element is no longer in the specification. Reload the page.');
	});
});

describe('Validate everything still waiting on me (0ac8c763)', () => {
	type Scope = 'page_or_section' | 'features' | 'specification';
	/**
	 * For all the features or the whole specification the page sends one act and
	 * the server picks the elements; for a page or a section, one validation per
	 * element of it waiting on the reader. The world holds that many elements
	 * waiting on the reader (none: the elements wait on Leo).
	 */
	async function validateWaiting(state: State, scope: Scope, actCount: number): Promise<Outcome> {
		const waiting = scope === 'page_or_section' ? actCount : Number(state['spec.waitingOnMe']);
		const world = worldOf({ ...state, 'element.waitsOnMe': waiting > 0 }, { others: Math.max(waiting, 3) - 1 });
		seed(world, ['specification.state']);
		expect(stateOf(world, world.doc)['spec.waitingOnMe']).toBe(waiting);
		const acts = scope === 'page_or_section'
			? world.elements.slice(0, actCount).map((e) => ({ op: 'validate', itemId: e.id }))
			: [scope === 'features' ? { op: 'validate_waiting', scope: 'features' } : { op: 'validate_waiting' }];
		expect(acts).toHaveLength(actCount);
		return post(world, { acts });
	}

	it('A person validates everything waiting on them in the spec [unspa:2e49df91:0ac8c763:efe82059]', async () => {
		const run = await validateWaiting(given(), 'specification', 1);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'spec.waitingOnMe': 0 });
	});

	it('A person validates everything waiting on them in the features [unspa:2e49df91:0ac8c763:447503c2]', async () => {
		const run = await validateWaiting(given(), 'features', 1);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'spec.waitingOnMe': 0 });
	});

	it('A page validates its elements in one request [unspa:2e49df91:0ac8c763:128f0ae8]', async () => {
		const run = await validateWaiting(given(), 'page_or_section', 12);
		expect(run.status).toBe('success');
		expect(run.finalState).toMatchObject({ 'spec.waitingOnMe': 0 });
	});

	it('More than 500 acts at once are refused [unspa:2e49df91:0ac8c763:42c6bead]', async () => {
		const run = await validateWaiting(given(), 'page_or_section', 501);
		expectBlocked(run, 400, 'At most 500 acts at once.');
	});

	it('A viewer with no assigned question cannot validate a batch [unspa:2e49df91:0ac8c763:b915cebd]', async () => {
		const run = await validateWaiting(given({ 'spec.waitingOnMe': 0 }, 'viewer'), 'specification', 1);
		expectBlocked(run, 403, 'No question currently requires your validation.');
	});

	it('Someone outside the workspace cannot validate in one click [unspa:2e49df91:0ac8c763:c5a3bf0b]', async () => {
		const run = await validateWaiting(given({}, 'outside'), 'specification', 1);
		expectBlocked(run, 404, 'Project not found');
	});

	it('A validated specification takes no batch [unspa:2e49df91:0ac8c763:72080517]', async () => {
		const run = await validateWaiting(given({ 'specification.state': 'validated' }), 'specification', 1);
		expectBlocked(run, 400, 'The specification is already validated.');
	});
});

describe('Read the validation request envelope (09e6ef74)', () => {
	const kept = { 'element.validations': 0, 'element.byMe': false, 'spec.waitingOnMe': 3 };

	it('A missing or non-array acts value is refused [unspa:2e49df91:09e6ef74:c5c3f4c4]', async () => {
		const world = worldOf(given());
		seed(world, [...ELEMENT_PATHS, 'spec.waitingOnMe']);
		for (const body of [{}, { acts: { op: 'validate', itemId: FOCUS } }]) {
			const run = await post(world, body);
			expectBlocked(run, 400, 'acts must be a non-empty list.');
			expect(run.finalState).toMatchObject(kept);
		}
	});

	it('An empty validation list is refused [unspa:2e49df91:09e6ef74:324a20ad]', async () => {
		const world = worldOf(given());
		seed(world, [...ELEMENT_PATHS, 'spec.waitingOnMe']);
		const run = await post(world, { acts: [] });
		expectBlocked(run, 400, 'acts must be a non-empty list.');
		expect(run.finalState).toMatchObject(kept);
	});

	it('A nonempty list reaches the later parser [unspa:2e49df91:09e6ef74:2d9f7aea]', async () => {
		const world = worldOf(given());
		seed(world, [...ELEMENT_PATHS, 'spec.waitingOnMe']);
		// The envelope check applies nothing: the list goes on to the per-act parser as it came.
		expect(parseSpecValidationActs({ acts: [{ op: 'validate', itemId: FOCUS }] })).toEqual({ ok: true, acts: [{ op: 'validate', itemId: FOCUS }] });
		const { doc } = await loadRetrospecDocument(sectionDocuments, PROJECT);
		expect(stateOf(world, doc)).toMatchObject(kept);
	});
});

describe('Record whether the validation team can be read (2ad73aa7)', () => {
	it('A team lookup failure leaves validation unavailable [unspa:2e49df91:2ad73aa7:21a9da7c]', async () => {
		const world = worldOf(given({ 'validationRoster.available': false }));
		seed(world, ELEMENT_PATHS);
		const read = await readSpecValidationBoard(servicesOf(world), PROJECT, mia);
		expect(read.teamAvailable).toBe(false);
		// The project team is not treated as empty: nothing reads complete, and every act waits for the roster.
		expect(read.board.complete).toBe(false);
		await expect(readSpecValidationBoard(servicesOf(world), PROJECT, mia, { requireTeam: true })).rejects.toMatchObject({ status: 503 });
	});
});
