import { describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { createEmptyFeaturesDraft } from '$domain/features';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import type { EvolutionView } from '$lib/server/evolution-view.server';
import type { EvolutionRequest, JournalEntry, ProjectEvolutionDraft } from '$domain/evolution';

/**
 * The scenarios of "My clicks and my AI's answers" (surface f5c78d5a of
 * feat-6, as EVO-015 version 1 has them in draft e186e7b3), run against the
 * real code: the state a scenario starts from is arranged in the Evolution
 * dossier the real doors read (the person's sessions, one per AI, their clicks,
 * what each AI does now on the bus); the act goes through POST/GET
 * /api/evolution/live or POST /api/evolution and the real session code; what
 * the scenario asserts is read back from the stored dossier and the answer.
 * Only the IO edges are faked: the stores, the dossier loader, the access
 * port, the discussions a block's answer is posted in.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({
	...(await original<typeof import('$lib/server/evolution-view.server')>()),
	loadEvolutionView: async () => scene.view
}));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({
	readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] })
}));

const { POST: batchDoor } = await import('../+server');
const { POST: liveDoor } = await import('./+server');
const { say, PROJECT_SESSION_KEY } = await import('$lib/server/evolution-live.server');
const {
	askAnotherAi,
	clicksFor,
	createEmptyEvolutionDraft,
	createEvolutionRequest,
	endProjectSession,
	handToWaitingCall,
	heardOf,
	fieldKey,
	markCancelled,
	openProjectSessionOf,
	progressSince,
	sendClick,
	sendProjectClick,
	startProjectSession,
	takeProjectClick,
	undoJournal,
	withMirror
} = await import('$domain/evolution');

type State = Readonly<Record<string, unknown>>;
type Outcome = { readonly status: 'success' | 'blocked'; readonly final: State; readonly said?: string };
interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly expected: 'success' | 'blocked';
	readonly then?: readonly { readonly path: string; readonly operator: 'equals' | 'is_true' | 'is_false'; readonly value?: unknown }[];
	/** On a refused scenario, what the code says holds it: the scenario's own rule. */
	readonly holds?: string;
	readonly run: () => Promise<Outcome>;
}

const SURFACE = 'f5c78d5a';
const PROJECT = 'shop';
const REQUEST = 'r-evo';
const ANA = 'ana@example.test';
const BO = 'bo@example.test';
const NOW = '2026-11-22T16:00:00.000Z';
const ago = (seconds: number) => new Date(Date.parse(NOW) - seconds * 1000).toISOString();
const THREAD = 'thread-1';
const MESSAGE = 'msg-1';

let serial = 0;
/** Session ids of their own for each scenario: what each AI does now lives on the bus, which every test shares. */
const sessionIds = () => {
	serial++;
	return { me: `me-${serial}`, other: `other-${serial}`, newer: `newer-${serial}` };
};

// ---------------------------------------------------------------------------
// The world: one dossier, the two doors a page and an AI reach.

interface WorldOptions {
	readonly role?: 'designer' | 'viewer' | 'none';
	readonly signIn?: boolean;
	readonly edition?: 'enterprise' | 'community';
	/** One member alone in the workspace: the AI writes the texts of a step itself. */
	readonly solo?: boolean;
}

function world(draft: ProjectEvolutionDraft, opts: WorldOptions = {}) {
	let dossier = { draft: structuredClone(draft), revision: 1 };
	const posted: { threadId: string; text: string }[] = [];
	const role = opts.role ?? 'designer';
	const viewOf = (): EvolutionView =>
		({
			projectId: PROJECT,
			draft: dossier.draft,
			features: createEmptyFeaturesDraft(PROJECT),
			data: { projectId: PROJECT, entities: [], fields: [] },
			leaves: [],
			sources: [],
			glossaryTerms: [],
			productName: 'Shop',
			members: (opts.solo ? [ANA] : [ANA, BO]).map((id) => ({ id, name: id === ANA ? 'Ana' : 'Bo', role: 'admin' })),
			held: {},
			coverage: {},
			filled: {},
			readings: {},
			revision: dossier.revision,
			language: 'en',
			assistantAvailable: false
		}) as unknown as EvolutionView;
	scene.view = viewOf();
	const services = servicesWith({
		installEdition: () => opts.edition ?? 'enterprise',
		currentSession: () => ({ isAuthenticated: true, email: ANA }),
		identity: { multiUser: true },
		resolveActiveProject: { execute: async () => null },
		enterpriseHooks: null,
		projectExists: async (id: string) => id === PROJECT,
		projectAccess: {
			authorize: async (_project: string, _token: string | null, action: string) =>
				role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
		},
		backLinks: { find: async () => ({ backWorkspaceId: 'ws' }) },
		workspaces: { listForCaller: async () => [{ id: 'ws', role: role === 'none' ? 'viewer' : role }] },
		resolveActiveMemberName: { execute: async () => 'Ana' },
		clock: { nowIso: () => NOW },
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		// The Reverse-Specification and every other section document read empty.
		sectionDocuments: { currentRevision: async () => dossier.revision, load: async () => null },
		loadEvolutionDraft: { execute: async () => structuredClone(dossier.draft) },
		saveEvolutionDraft: {
			execute: async (next: ProjectEvolutionDraft, save: { expectedRevision: number | null }) => {
				if (save.expectedRevision !== null && save.expectedRevision !== dossier.revision) return null;
				dossier = { draft: structuredClone(next), revision: dossier.revision + 1 };
				scene.view = viewOf();
				return { revision: dossier.revision, savedAt: NOW };
			}
		},
		implementationCoverage: { invalidate: () => {} },
		scheduleBackSync: async () => {},
		captureBaseline: { execute: async () => null },
		loadGlossaryDraft: { execute: async () => ({ projectId: PROJECT, terms: [] }) },
		codeAdoption: { available: false },
		// The block a question was asked on, and the thread its answer is posted in.
		loadDiscussions: {
			execute: async () => ({
				document: { threads: [{ id: THREAD, anchor: 'feature:f1', messages: [{ id: MESSAGE, author: { id: ANA, name: 'Ana', kind: 'person' }, at: ago(300), text: 'Why can a guest not shorten?' }] }] }
			})
		},
		actOnDiscussion: {
			execute: async (_project: string, act: { kind: string; threadId: string; text: string }) => {
				posted.push({ threadId: act.threadId, text: act.text });
				return { ok: true };
			}
		}
	} as never) as AppServices;
	const event = (path: string, body: unknown, asAi: boolean) =>
		requestEvent({
			path,
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json', ...(asAi ? { 'x-lyriks-actor': 'ai_client' } : {}) },
			authRequired: opts.signIn ?? true,
			services,
			cookies: { lyriks_session: 'token' }
		});
	const answered = async (run: () => Response | Promise<Response>) =>
		Promise.resolve()
			.then(run)
			.then(
				async (r) => ({ status: r.status, body: JSON.parse((await r.text()).trim() || 'null') }),
				(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
			);
	return {
		services,
		/** One act through /api/evolution/live, as the person or as their AI. */
		live: (body: Record<string, unknown>, asAi: boolean) => answered(() => liveDoor(event('/api/evolution/live', { projectId: PROJECT, ...body }, asAi) as never)),
		/** One batch through /api/evolution, as the person or as their AI. */
		batch: (operations: readonly unknown[], asAi: boolean) => answered(() => batchDoor(event('/api/evolution', { projectId: PROJECT, operations }, asAi) as never)),
		stored: () => dossier.draft,
		request: () => dossier.draft.requests.find((r) => r.id === REQUEST)!,
		posted,
		/** What one AI of the person does now, said on the bus as its own call would say it. */
		hear: (sessionId: string, status: 'listening' | 'thinking') =>
			say(services, { projectId: PROJECT, requestId: PROJECT_SESSION_KEY, personId: ANA, sessionId }, status, status === 'listening' ? { callHeld: true } : { thinkingAbout: 'a click' })
	};
}

// ---------------------------------------------------------------------------
// The dossier a scenario starts from, built with the real domain functions.

const freshRequest = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => {
	const base = createEvolutionRequest({ id: REQUEST, title: 'Save a cart for later', status: 'open' });
	return { ...base, need: { ...base.need, description: 'Save a cart.', situation: 'Carts are lost on logout.', objectives: 'A cart survives a logout.' }, ...over };
};
const dossierWith = (request: EvolutionRequest = freshRequest()): ProjectEvolutionDraft => ({ ...createEmptyEvolutionDraft(PROJECT), requests: [request] });

function openSession(draft: ProjectEvolutionDraft, id: string, at: string, client = 'Claude Code'): ProjectEvolutionDraft {
	const opened = startProjectSession(draft, ANA, id, at, { client });
	if (!opened.ok) throw new Error(opened.reason);
	return opened.draft;
}

const ASK_BLOCK = { kind: 'ask_block' as const, page: 'spec' as const, anchor: 'feature:f1', title: 'Shorten a link', threadId: THREAD, messageId: MESSAGE, text: 'Why can a guest not shorten?' };
const REREAD = { kind: 'reread' as const, page: 'spec' as const, anchor: 'feature:f1', title: 'Shorten a link', featureId: 'f1' };

function projectClick(draft: ProjectEvolutionDraft, kind: 'ask_block' | 'reread', id: string, at: string): ProjectEvolutionDraft {
	const sent = sendProjectClick(draft, ANA, kind === 'ask_block' ? ASK_BLOCK : REREAD, true, id, at);
	if (!sent.ok) throw new Error(sent.reason);
	return sent.draft;
}

const withRequest = (draft: ProjectEvolutionDraft, change: (r: EvolutionRequest) => EvolutionRequest): ProjectEvolutionDraft => ({
	...draft,
	requests: draft.requests.map((r) => (r.id === REQUEST ? change(r) : r))
});

/** A click of the person on the request, waiting for their AI: a Prefill of the Solution's examples by default. */
function requestClick(draft: ProjectEvolutionDraft, id: string, at: string, input: Parameters<typeof sendClick>[2] = { kind: 'prefill', fieldPath: 'step.solution.examples', leafId: null }) {
	return withRequest(draft, (r) => {
		const sent = sendClick(r, ANA, input, true, id, at);
		if (!sent.ok) throw new Error(sent.reason);
		return sent.request;
	});
}

/** The request holds a session of the same id as one of the person's project sessions: that session holds it. */
const mirrored = (draft: ProjectEvolutionDraft, sessionId: string, at: string) =>
	withRequest(draft, (r) => withMirror(r, ANA, openProjectSessionOf(draft, ANA, sessionId)!, at));

/** The session holding the request takes its oldest click, as its waiting call does. */
function takenOnRequest(draft: ProjectEvolutionDraft, at: string) {
	return withRequest(draft, (r) => {
		const handed = handToWaitingCall(r, ANA, at, true);
		if (handed.kind !== 'click') throw new Error('nothing to take');
		return handed.request;
	});
}

/** The AI the click is taken by is on it, its places written as the journal of the click. */
const withJournal = (draft: ProjectEvolutionDraft, journal: readonly JournalEntry[]) =>
	withRequest(draft, (r) => ({ ...r, aiClicks: r.aiClicks.map((c) => (c.state === 'taken' ? { ...c, journal } : c)) }));

const takenClickOf = (r: EvolutionRequest) => r.aiClicks.find((c) => c.state === 'taken') ?? null;

/** The person cancelled the click the AI was on: what the real cancel leaves on the request. */
const cancelledOn = (draft: ProjectEvolutionDraft) =>
	withRequest(draft, (r) => markCancelled(r, ANA, takenClickOf(r)!.id, { at: ago(5), undone: 0, kept: [] }));

const waitingOf = (d: ProjectEvolutionDraft) =>
	(d.clicks ?? []).filter((c) => c.personId === ANA && c.state === 'waiting').length +
	d.requests.reduce((n, r) => n + (r.aiClicks ?? []).filter((c) => c.personId === ANA && c.state === 'waiting').length, 0);

/** What the waiting call answered, in the model's words. */
const handedState = (w: ReturnType<typeof world>, body: Record<string, unknown> | null, sessionId: string): State => {
	const click = body?.kind === 'click' ? (body.click as { kind?: string }) : null;
	const mirror = w.request().liveSessions?.find((s) => s.id === sessionId && !s.endedAt);
	return {
		'wait.answer': typeof body?.kind === 'string' ? body.kind : 'none',
		'aiTurn.onClick': !!click,
		'aiTurn.clickKind': click ? (body?.requestId ? 'on_request' : click.kind) : 'none',
		'aiClicks.waiting': waitingOf(w.stored()),
		'aiTurn.cancelled': !!mirror?.cancelledClickId
	};
};

const status = (ok: boolean): 'success' | 'blocked' => (ok ? 'success' : 'blocked');
const waitAs = (w: ReturnType<typeof world>, sessionId: string) => w.live({ act: 'await', sessionId, waitSeconds: 1 }, true);

// ---------------------------------------------------------------------------

function prove(actionId: string, title: string, scenarios: readonly Scenario[]): void {
	describe(`${title} (action ${actionId} of feat-6, EVO-015 version 2)`, () => {
		for (const scenario of scenarios) {
			it(`${scenario.name} [unspa:${SURFACE}:${actionId}:${scenario.id}]`, async () => {
				const outcome = await scenario.run();
				expect(outcome.status).toBe(scenario.expected);
				for (const a of scenario.then ?? []) {
					const v = outcome.final[a.path];
					if (a.operator === 'equals') expect(v, a.path).toEqual(a.value);
					else expect(v, a.path).toBe(a.operator === 'is_true');
				}
				if (scenario.holds) expect(outcome.said ?? '').toContain(scenario.holds);
			});
		}
	});
}

const said = (body: unknown): string => JSON.stringify(body ?? '');

// ---------------------------------------------------------------------------
// Hand my oldest click to my AI (ed32c885)

prove('ed32c885', 'Hand my oldest click to my AI', [
	{
		id: '64325df3',
		name: 'My oldest click reaches my AI',
		expected: 'success',
		then: [
			{ path: 'aiTurn.onClick', operator: 'is_true' },
			{ path: 'aiClicks.waiting', operator: 'equals', value: 0 },
			{ path: 'wait.answer', operator: 'equals', value: 'click' },
			{ path: 'aiTurn.clickKind', operator: 'equals', value: 'ask_block' }
		],
		run: async () => {
			const id = sessionIds();
			const w = world(projectClick(openSession(dossierWith(), id.me, ago(120)), 'ask_block', 'c1', ago(30)));
			const answer = await waitAs(w, id.me);
			return { status: status(answer.body?.kind === 'click'), final: handedState(w, answer.body, id.me) };
		}
	},
	{
		id: 'ab0f4449',
		name: 'A click on a request takes the session there',
		expected: 'success',
		then: [{ path: 'aiTurn.clickKind', operator: 'equals', value: 'on_request' }],
		run: async () => {
			const id = sessionIds();
			const w = world(requestClick(openSession(dossierWith(), id.me, ago(120)), 'c1', ago(30)));
			const answer = await waitAs(w, id.me);
			// The request now holds a session of the same id (ai_session.reached_request).
			expect(w.request().liveSessions?.some((s) => s.id === id.me && !s.endedAt)).toBe(true);
			return { status: status(answer.body?.kind === 'click'), final: handedState(w, answer.body, id.me) };
		}
	},
	{
		id: '942dd1a1',
		name: 'A click made while the AI is on one waits its turn',
		expected: 'blocked',
		run: async () => {
			// The AI is on a click of the request; another click waits there. The hand-over of a look finds the click in hand first (rule 767c3380).
			const id = sessionIds();
			let draft = requestClick(openSession(dossierWith(), id.me, ago(120)), 'c1', ago(60));
			draft = takenOnRequest(mirrored(draft, id.me, ago(50)), ago(50));
			draft = requestClick(draft, 'c2', ago(30), { kind: 'ask', fieldPath: '00-need.situation', leafId: null, messageId: 'm2' });
			const handed = handToWaitingCall(draft.requests[0], ANA, NOW, false);
			return { status: status(handed.kind === 'click'), final: {} };
		}
	},
	{
		id: 'b1ea9994',
		name: 'Nothing is handed without a session',
		expected: 'blocked',
		holds: 'No session is open on this project',
		run: async () => {
			const w = world(projectClick(dossierWith(), 'ask_block', 'c1', ago(30)));
			const answer = await w.live({ act: 'await', waitSeconds: 1 }, true);
			return { status: status(answer.status === 200 && answer.body?.kind === 'click'), final: {}, said: said(answer.body) };
		}
	},
	{
		id: '159e21d3',
		name: 'No click, nothing handed',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			const w = world(openSession(dossierWith(), id.me, ago(120)));
			const answer = await waitAs(w, id.me);
			expect(answer.body?.kind).toBe('nothing');
			return { status: status(answer.body?.kind === 'click'), final: {} };
		}
	},
	{
		id: '20996163',
		name: 'Nothing new before the AI hears the cancellation',
		expected: 'blocked',
		run: async () => {
			// The person cancelled the click the AI was on; another click waits. The wait first closes the turn and tells the
			// cancellation (rule e31ba5ee): no click ever reaches the AI before it heard what was undone.
			const id = sessionIds();
			let draft = requestClick(openSession(dossierWith(), id.me, ago(120)), 'c1', ago(60));
			draft = cancelledOn(takenOnRequest(mirrored(draft, id.me, ago(50)), ago(50)));
			draft = projectClick(draft, 'reread', 'c2', ago(30));
			const w = world(draft);
			const answer = await waitAs(w, id.me);
			const handedUnheard = answer.body?.kind === 'click' && !answer.body?.cancelled;
			return { status: status(handedUnheard), final: {} };
		}
	},
	{
		id: 'e4e5278a',
		name: 'After a cancellation the next wait hands the next click',
		expected: 'success',
		then: [
			{ path: 'aiTurn.onClick', operator: 'is_true' },
			{ path: 'aiTurn.cancelled', operator: 'is_false' }
		],
		run: async () => {
			const id = sessionIds();
			let draft = requestClick(openSession(dossierWith(), id.me, ago(120)), 'c1', ago(60));
			draft = cancelledOn(takenOnRequest(mirrored(draft, id.me, ago(50)), ago(50)));
			draft = projectClick(draft, 'ask_block', 'c2', ago(30));
			const w = world(draft);
			const answer = await waitAs(w, id.me);
			// The wait again (bcaddf9c) tells what was undone, with the next click.
			expect(answer.body?.cancelled).toMatchObject({ clickId: 'c1' });
			return { status: status(answer.body?.kind === 'click'), final: handedState(w, answer.body, id.me) };
		}
	},
	{
		id: 'f9c9e31d',
		name: 'A click on a request goes to the AI that holds it',
		expected: 'success',
		then: [
			{ path: 'aiTurn.onClick', operator: 'is_true' },
			{ path: 'aiTurn.clickKind', operator: 'equals', value: 'on_request' }
		],
		run: async () => {
			// Claude Code holds EVO-014 (its mirror is open there); Codex, opened later, listens with its call held.
			const id = sessionIds();
			let draft = openSession(openSession(dossierWith(), id.me, ago(120)), id.newer, ago(60), 'Codex');
			draft = requestClick(mirrored(draft, id.me, ago(110)), 'c1', ago(30));
			const w = world(draft);
			w.hear(id.newer, 'listening');
			const answer = await waitAs(w, id.me);
			return { status: status(answer.body?.kind === 'click'), final: handedState(w, answer.body, id.me) };
		}
	},
	{
		id: 'f3016498',
		name: 'A click another AI holds is left to it',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			let draft = openSession(openSession(dossierWith(), id.other, ago(120), 'Codex'), id.me, ago(60));
			draft = requestClick(mirrored(draft, id.other, ago(110)), 'c1', ago(30));
			const w = world(draft);
			// Codex holds the request and is at work on another click.
			w.hear(id.other, 'thinking');
			const answer = await waitAs(w, id.me);
			expect(w.request().aiClicks[0].state).toBe('waiting');
			return { status: status(answer.body?.kind === 'click'), final: {} };
		}
	},
	{
		id: '52371264',
		name: 'A click the busy AI holds waits for it',
		expected: 'blocked',
		run: async () => {
			// Claude Code holds EVO-014 and is on a click of it; a new click on EVO-014 goes to it (routing), and waits while it is on the first.
			const id = sessionIds();
			let draft = openSession(openSession(dossierWith(), id.me, ago(120)), id.newer, ago(60), 'Codex');
			draft = takenOnRequest(mirrored(requestClick(draft, 'c1', ago(90)), id.me, ago(80)), ago(80));
			draft = requestClick(draft, 'c2', ago(30), { kind: 'ask', fieldPath: '00-need.situation', leafId: null, messageId: 'm2' });
			const routed = clicksFor(draft, ANA, id.me, (s) => ({ free: s === id.newer, working: s === id.me }));
			expect(routed).toEqual([{ where: 'request', requestId: REQUEST, at: ago(30) }]);
			expect(clicksFor(draft, ANA, id.newer, (s) => ({ free: s === id.newer, working: s === id.me }))).toEqual([]);
			const handed = handToWaitingCall(draft.requests[0], ANA, NOW, false);
			return { status: status(handed.kind === 'click'), final: {} };
		}
	},
	{
		id: '9c9ab39a',
		name: 'A free AI opened later takes a click nobody holds',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			const draft = projectClick(openSession(openSession(dossierWith(), id.me, ago(120)), id.newer, ago(60), 'Codex'), 'reread', 'c1', ago(30));
			const w = world(draft);
			w.hear(id.newer, 'listening');
			const answer = await waitAs(w, id.me);
			expect(w.stored().clicks?.[0].state).toBe('waiting');
			return { status: status(answer.body?.kind === 'click'), final: {} };
		}
	},
	{
		id: '0be7952f',
		name: 'The free AI opened last takes a click nobody holds',
		expected: 'success',
		then: [
			{ path: 'aiTurn.onClick', operator: 'is_true' },
			{ path: 'aiTurn.clickKind', operator: 'equals', value: 'reread' }
		],
		run: async () => {
			// The AI opened after this one is at work: this one, free, is the free AI opened last.
			const id = sessionIds();
			const draft = projectClick(openSession(openSession(dossierWith(), id.me, ago(120)), id.newer, ago(60), 'Codex'), 'reread', 'c1', ago(30));
			const w = world(draft);
			w.hear(id.newer, 'thinking');
			const answer = await waitAs(w, id.me);
			return { status: status(answer.body?.kind === 'click'), final: handedState(w, answer.body, id.me) };
		}
	},
	{
		id: '633ebf30',
		name: 'A question of another AI reaches the AI it is addressed to',
		expected: 'success',
		then: [
			{ path: 'aiTurn.clickKind', operator: 'equals', value: 'question' },
			{ path: 'wait.answer', operator: 'equals', value: 'click' }
		],
		run: async () => {
			// Claude Code asked Codex where the run stands; Codex waits.
			const id = sessionIds();
			let draft = openSession(openSession(dossierWith(), id.other, ago(120)), id.me, ago(60), 'Codex');
			const asked = askAnotherAi(draft, ANA, { from: id.other, to: id.me, question: 'Where is the run?' }, 'q1', ago(10));
			if (!asked.ok) throw new Error(asked.reason);
			draft = asked.draft;
			const w = world(draft);
			const answer = await waitAs(w, id.me);
			expect(answer.body?.click).toMatchObject({ kind: 'question', question: 'Where is the run?', from: { sessionId: id.other } });
			return { status: status(answer.body?.kind === 'click'), final: handedState(w, answer.body, id.me) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Hand my progress to my AI (83faf27e)

/** The request the session of `sessionId` reached, which it heard before the person validated a step. */
function progressed(sessionId: string, moved: boolean) {
	let draft = openSession(dossierWith(), sessionId, ago(120));
	draft = mirrored(draft, sessionId, ago(110));
	draft = withRequest(draft, (r) => ({
		...r,
		liveSessions: r.liveSessions.map((s) => (s.id === sessionId ? { ...s, heard: heardOf(r, ago(100)) } : s)),
		...(moved ? { stepValidations: [{ step: 'need' as const, validatorIds: [], validations: [{ by: ANA, kind: 'person' as const, at: ago(20) }] }] } : {})
	}));
	return draft;
}

prove('83faf27e', 'Hand my progress to my AI', [
	{
		id: 'e2a43bd5',
		name: "The person's progress wakes the AI once",
		expected: 'success',
		then: [
			{ path: 'wait.answer', operator: 'equals', value: 'progress' },
			{ path: 'progress.unheard', operator: 'is_false' }
		],
		run: async () => {
			const id = sessionIds();
			const w = world(progressed(id.me, true));
			const answer = await waitAs(w, id.me);
			const heard = w.request().liveSessions.find((s) => s.id === id.me)?.heard;
			return {
				status: status(answer.body?.kind === 'progress'),
				final: { 'wait.answer': answer.body?.kind, 'progress.unheard': !heard || progressSince(w.request(), heard) !== null }
			};
		}
	},
	{
		id: 'a886fdfa',
		name: 'A waiting click goes before progress',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			const w = world(requestClick(progressed(id.me, true), 'c1', ago(10)));
			const answer = await waitAs(w, id.me);
			expect(answer.body?.kind).toBe('click');
			return { status: status(answer.body?.kind === 'progress'), final: {} };
		}
	},
	{
		id: 'da67f0d8',
		name: 'Nothing moved, nothing to hear',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			const w = world(progressed(id.me, false));
			const answer = await waitAs(w, id.me);
			return { status: status(answer.body?.kind === 'progress'), final: {} };
		}
	},
	{
		id: '094f992d',
		name: "No session hears the person's progress",
		expected: 'blocked',
		run: async () => {
			// The request moved on and the person holds no session: nobody's wait hears it, nothing is handed.
			const id = sessionIds();
			const ended = endProjectSession(progressed(id.me, true), ANA, 'ended_by_person', ago(15), id.me);
			if (!ended.ok) throw new Error(ended.reason);
			const w = world(ended.draft);
			const answer = await waitAs(w, id.me);
			expect(answer.body?.kind).toBe('ended');
			return { status: status(answer.body?.kind === 'progress'), final: {} };
		}
	},
	{
		id: 'c408ce71',
		name: 'An AI on a click hears the progress at its next wait',
		expected: 'blocked',
		run: async () => {
			// The AI is on a click of the request when the person validates a step: it hears the progress only by waiting,
			// and the wait first closes the click it was on (rule ba17abe6): never while that click is still in its hands.
			const id = sessionIds();
			const draft = takenOnRequest(requestClick(progressed(id.me, true), 'c1', ago(90)), ago(90));
			const w = world(draft);
			const answer = await waitAs(w, id.me);
			const stillOnIt = w.request().aiClicks.some((c) => c.id === 'c1' && c.state === 'taken');
			return { status: status(answer.body?.kind === 'progress' && stillOnIt), final: {} };
		}
	},
	{
		id: 'a3a89cab',
		name: 'The progress waits until the AI hears the cancellation',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			const draft = cancelledOn(takenOnRequest(requestClick(progressed(id.me, true), 'c1', ago(90)), ago(90)));
			const w = world(draft);
			const answer = await waitAs(w, id.me);
			// The wait tells the cancellation first, with whatever it hands (rule b3718861).
			const handedUnheard = answer.body?.kind === 'progress' && !answer.body?.cancelled;
			return { status: status(handedUnheard), final: {} };
		}
	}
]);

// ---------------------------------------------------------------------------
// Answer a click outside a request (f60da228)

/** The AI's session holds a click made outside a request: a question on a block or a re-reading. */
function onProjectClick(kind: 'ask_block' | 'reread', sessionId: string) {
	const draft = projectClick(openSession(dossierWith(), sessionId, ago(120)), kind, 'c1', ago(60));
	const taken = takeProjectClick(draft, 'c1', ago(50), sessionId);
	if (!taken) throw new Error('nothing to take');
	return taken.draft;
}

const answeredState = (w: ReturnType<typeof world>): State => ({
	'aiTurn.clickAnswered': w.stored().clicks?.find((c) => c.id === 'c1')?.state === 'answered',
	'answer.inThread': w.posted.some((p) => p.threadId === THREAD)
});

const answerClick = async (w: ReturnType<typeof world>, text: string, asAi = true) => {
	const answer = await w.batch([{ op: 'answer_click', clickId: 'c1', text }], asAi);
	return { status: status(answer.status === 200 && answer.body?.ok === true), final: answeredState(w), said: said(answer.body) };
};

prove('f60da228', 'Answer a click outside a request', [
	{
		id: '1be5eb1d',
		name: "The AI answers a question in its block's thread",
		expected: 'success',
		then: [
			{ path: 'aiTurn.clickAnswered', operator: 'is_true' },
			{ path: 'answer.inThread', operator: 'is_true' }
		],
		run: async () => answerClick(world(onProjectClick('ask_block', sessionIds().me)), 'Only an editor starts a run: a viewer sees the button greyed.')
	},
	{
		id: '61957f46',
		name: 'A re-reading says what changed',
		expected: 'success',
		then: [
			{ path: 'aiTurn.clickAnswered', operator: 'is_true' },
			{ path: 'answer.inThread', operator: 'is_false' }
		],
		run: async () => answerClick(world(onProjectClick('reread', sessionIds().me)), 'Nothing needed to change: the extraction matches the code.')
	},
	{
		id: 'b32ea6d0',
		name: 'An empty answer to a question is refused',
		expected: 'blocked',
		holds: 'An answer says something.',
		run: async () => answerClick(world(onProjectClick('ask_block', sessionIds().me)), '')
	},
	{
		id: '7c14f682',
		name: 'A re-reading that says nothing is refused',
		expected: 'blocked',
		holds: 'Say what changed, or that nothing needed to change.',
		run: async () => answerClick(world(onProjectClick('reread', sessionIds().me)), '')
	},
	{
		id: 'd662e879',
		name: 'No click in hand, no answer',
		expected: 'blocked',
		holds: 'No click of yours is in hand',
		run: async () => answerClick(world(openSession(dossierWith(), sessionIds().me, ago(120))), 'Hello')
	},
	{
		id: '17e7b8a6',
		name: "A page cannot answer in the AI's place",
		expected: 'blocked',
		holds: 'Only the AI that took the click answers it.',
		run: async () => answerClick(world(onProjectClick('ask_block', sessionIds().me)), 'Hello', false)
	},
	{
		id: 'b0943e7e',
		name: "A viewer's AI answers the viewer's question",
		expected: 'success',
		then: [{ path: 'aiTurn.clickAnswered', operator: 'is_true' }],
		run: async () => answerClick(world(onProjectClick('ask_block', sessionIds().me), { role: 'viewer' }), 'It means the run is under way.')
	},
	{
		id: '63e05b29',
		name: 'An AI outside the workspace answers nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => answerClick(world(onProjectClick('ask_block', sessionIds().me), { role: 'none' }), 'Hello')
	},
	{
		id: '22cb2ddb',
		name: 'Asked, handed and answered in session',
		expected: 'success',
		then: [
			{ path: 'aiTurn.clickAnswered', operator: 'is_true' },
			{ path: 'answer.inThread', operator: 'is_true' }
		],
		run: async () => {
			// The question waits with no session (30c293d0), the AI opens one (2cbbe7a7), is handed it (ed32c885), answers.
			const w = world(projectClick(dossierWith(), 'ask_block', 'c1', ago(60)));
			const opened = await w.live({ act: 'start', client: 'Claude Code' }, true);
			expect(opened.body?.waitingClicks).toBe(1);
			const handed = await waitAs(w, opened.body.session.id as string);
			expect(handed.body).toMatchObject({ kind: 'click', click: { id: 'c1', kind: 'ask_block' } });
			return answerClick(w, 'The start is refused while a run is under way.');
		}
	},
	{
		id: '6a6a7054',
		name: 'On Community the AI answers a question of Ask my AI',
		expected: 'success',
		then: [{ path: 'aiTurn.clickAnswered', operator: 'is_true' }],
		run: async () => answerClick(world(onProjectClick('ask_block', sessionIds().me), { edition: 'community' }), 'Only an editor starts a run.')
	}
]);

// ---------------------------------------------------------------------------
// Write on a request while on a click (d7b7a353)

/** The person's message in the thread of the Need's situation, which their Ask click hands the AI. */
const ASKED_THREAD = {
	id: 't1',
	key: fieldKey('00-need.situation'),
	state: 'open' as const,
	messages: [{ id: 'm1', author: ANA, authorKind: 'person' as const, body: 'Why are carts lost?', postedAt: ago(70) }],
	changeValue: null,
	changedBy: null,
	changedAt: null
};

/**
 * The AI of a solo workspace is on a click of the person on a request at
 * `stage`: their Ask on the Need's situation by default, which a reply under
 * their message answers; or a Prefill of the Solution's examples, which the
 * answer to that question answers (a write a viewer may not make).
 */
function onPrefill(sessionId: string, stage: EvolutionRequest['stage'] = 'specification', on = true, click: 'ask' | 'prefill' = 'ask') {
	let draft = openSession(dossierWith(freshRequest({ stage, fieldThreads: [ASKED_THREAD] })), sessionId, ago(120));
	const input =
		click === 'ask'
			? { kind: 'ask' as const, fieldPath: '00-need.situation', leafId: null, messageId: 'm1' }
			: { kind: 'prefill' as const, fieldPath: 'step.solution.examples', leafId: null };
	draft = mirrored(requestClick(draft, 'c1', ago(60), input), sessionId, ago(55));
	return on ? takenOnRequest(draft, ago(50)) : draft;
}

const writeState = (w: ReturnType<typeof world>): State => {
	const click = w.request().aiClicks.find((c) => c.id === 'c1');
	return { 'aiTurn.placesWritten': click?.journal?.length ?? 0, 'aiTurn.clickAnswered': click?.state === 'answered' };
};

const WRITES = {
	// The operation the click asks for: a reply under the person's message.
	answer: { op: 'post_on_field', requestId: REQUEST, fieldPath: '00-need.situation', body: 'Carts live in the browser session only.', replyTo: 'm1' },
	// Another write on the request: a message on another question.
	other: { op: 'post_on_field', requestId: REQUEST, fieldPath: '00-need.objectives', body: 'Is a week enough to keep a cart?' },
	// The answer to the question a Prefill bears on.
	prefill_answer: { op: 'answer_step', requestId: REQUEST, step: 'solution', question: 'examples', answer: 'A cart saved on Friday is still there on Monday.' },
	freeze_close_delete: { op: 'close_request', requestId: REQUEST }
} as const;

async function write(w: ReturnType<typeof world>, kind: keyof typeof WRITES): Promise<Outcome> {
	const answer = await w.batch([WRITES[kind]], true);
	return { status: status(answer.status === 200 && answer.body?.ok === true), final: writeState(w), said: said(answer.body) };
}

prove('d7b7a353', 'Write on a request while on a click', [
	{
		id: 'dca53a3a',
		name: 'What the AI writes for a click is kept place by place',
		expected: 'success',
		then: [
			{ path: 'aiTurn.placesWritten', operator: 'equals', value: 1 },
			{ path: 'aiTurn.clickAnswered', operator: 'is_false' }
		],
		run: async () => write(world(onPrefill(sessionIds().me), { solo: true }), 'other')
	},
	{
		id: 'd022dcf5',
		name: 'The operation the click asks for answers it',
		expected: 'success',
		then: [
			{ path: 'aiTurn.clickAnswered', operator: 'is_true' },
			{ path: 'aiTurn.placesWritten', operator: 'equals', value: 1 }
		],
		run: async () => write(world(onPrefill(sessionIds().me), { solo: true }), 'answer')
	},
	{
		id: 'd83518c0',
		name: 'After a cancellation the AI is refused',
		expected: 'blocked',
		holds: 'The person cancelled the request you were answering',
		run: async () => write(world(cancelledOn(onPrefill(sessionIds().me)), { solo: true }), 'answer')
	},
	{
		id: '4644ffe7',
		name: 'No freeze while on a click',
		expected: 'blocked',
		holds: 'Finish the click first',
		run: async () => write(world(onPrefill(sessionIds().me, 'delivered'), { solo: true }), 'freeze_close_delete')
	},
	{
		id: '2dfaa927',
		name: 'Off a click the AI may cross a stage',
		expected: 'success',
		then: [{ path: 'aiTurn.placesWritten', operator: 'equals', value: 0 }],
		run: async () => {
			const w = world(onPrefill(sessionIds().me, 'delivered', false), { solo: true });
			const outcome = await write(w, 'freeze_close_delete');
			expect(w.request().status).toBe('closed');
			return outcome;
		}
	},
	{
		id: 'a1f2c176',
		name: "A viewer's AI writes nothing on a request",
		expected: 'blocked',
		holds: 'forbidden',
		// A click made before the person became a viewer: the answer it asks for is a write on the request.
		run: async () => write(world(onPrefill(sessionIds().me, 'specification', true, 'prefill'), { solo: true, role: 'viewer' }), 'prefill_answer')
	},
	{
		id: '8a5f6aba',
		name: 'An AI outside the workspace writes nothing on a request',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => write(world(onPrefill(sessionIds().me, 'specification', true, 'prefill'), { solo: true, role: 'none' }), 'prefill_answer')
	}
]);

// ---------------------------------------------------------------------------
// Wait again after a click (bcaddf9c)

prove('bcaddf9c', 'Wait again after a click', [
	{
		id: 'aa080aa1',
		name: 'A click let go of with nothing written reads Nothing written',
		expected: 'success',
		then: [{ path: 'aiTurn.onClick', operator: 'is_false' }],
		run: async () => {
			const id = sessionIds();
			const w = world(onProjectClick('ask_block', id.me));
			const answer = await waitAs(w, id.me);
			const click = w.stored().clicks?.find((c) => c.id === 'c1');
			expect(click).toMatchObject({ state: 'answered', answeredNothing: true });
			return { status: status(answer.status === 200), final: { 'aiTurn.onClick': click?.state === 'taken' } };
		}
	},
	{
		id: 'b24ebb83',
		name: 'Waiting again settles what the AI wrote',
		expected: 'success',
		then: [
			{ path: 'aiTurn.placesWritten', operator: 'equals', value: 0 },
			{ path: 'aiTurn.onClick', operator: 'is_false' }
		],
		run: async () => {
			const id = sessionIds();
			const journal: JournalEntry[] = [
				{ section: 'evolution', path: ['requests', { id: REQUEST }, 'requester'], existedBefore: true, before: '', existsAfter: true, after: 'Ana' },
				{ section: 'evolution', path: ['requests', { id: REQUEST }, 'title'], existedBefore: true, before: 'Save a cart for later', existsAfter: true, after: 'Keep a cart' }
			];
			const w = world(withJournal(onPrefill(id.me), journal));
			const answer = await waitAs(w, id.me);
			const click = w.request().aiClicks.find((c) => c.id === 'c1');
			return { status: status(answer.status === 200), final: { 'aiTurn.placesWritten': click?.journal?.length ?? 0, 'aiTurn.onClick': click?.state === 'taken' } };
		}
	},
	{
		id: '0facd04c',
		name: 'The AI hears a cancellation once',
		expected: 'success',
		then: [{ path: 'aiTurn.cancelled', operator: 'is_false' }],
		run: async () => {
			const id = sessionIds();
			const w = world(cancelledOn(onPrefill(id.me)));
			const first = await waitAs(w, id.me);
			expect(first.body?.cancelled).toMatchObject({ clickId: 'c1' });
			const second = await waitAs(w, id.me);
			expect(second.body?.cancelled).toBeUndefined();
			return { status: status(first.status === 200), final: handedState(w, second.body, id.me) };
		}
	},
	{
		id: 'bde6f608',
		name: "A page cannot wait in the AI's place",
		expected: 'blocked',
		holds: 'Only the AI client of the session does this',
		run: async () => {
			const id = sessionIds();
			const w = world(openSession(dossierWith(), id.me, ago(120)));
			const answer = await w.live({ act: 'await', sessionId: id.me, waitSeconds: 1 }, false);
			return { status: status(answer.status === 200), final: {}, said: said(answer.body) };
		}
	},
	{
		id: 'd250c961',
		name: 'An AI outside the workspace waits on nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const id = sessionIds();
			const w = world(openSession(dossierWith(), id.me, ago(120)), { role: 'none' });
			const answer = await waitAs(w, id.me);
			return { status: status(answer.status === 200), final: {}, said: said(answer.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Re-read the code with my AI (6f8d4a9c)

const rereadOf = async (w: ReturnType<typeof world>, asAi = false): Promise<Outcome> => {
	const answer = await w.live({ act: 'click', ...REREAD }, asAi);
	const waitingOnPlace = (w.stored().clicks ?? []).some((c) => c.kind === 'reread' && c.anchor === REREAD.anchor && c.state === 'waiting');
	return { status: status(answer.status === 200 && answer.body?.ok === true), final: { 'aiClicks.waiting': waitingOf(w.stored()), 'reread.waitingOnPlace': waitingOnPlace }, said: said(answer.body) };
};

prove('6f8d4a9c', 'Re-read the code with my AI', [
	{
		id: '3cf68841',
		name: 'An editor asks for the code to be re-read',
		expected: 'success',
		then: [
			{ path: 'aiClicks.waiting', operator: 'equals', value: 1 },
			{ path: 'reread.waitingOnPlace', operator: 'is_true' }
		],
		run: async () => rereadOf(world(openSession(dossierWith(), sessionIds().me, ago(120))))
	},
	{
		id: '89872b98',
		name: 'Without a session the prompt is copied',
		expected: 'success',
		then: [{ path: 'aiClicks.waiting', operator: 'equals', value: 1 }],
		run: async () => {
			const w = world(dossierWith());
			const outcome = await rereadOf(w);
			// The page copies the prompt that opens one: the click says no session holds it yet.
			expect(w.stored().sessions ?? []).toEqual([]);
			return outcome;
		}
	},
	{
		id: '74dba23c',
		name: 'A second click on the same place is the same request',
		expected: 'success',
		then: [{ path: 'aiClicks.waiting', operator: 'equals', value: 1 }],
		run: async () => rereadOf(world(projectClick(openSession(dossierWith(), sessionIds().me, ago(120)), 'reread', 'c1', ago(30))))
	},
	{
		id: '49069967',
		name: 'A viewer cannot ask for a re-reading',
		expected: 'blocked',
		holds: 'Only who may edit the project asks for its code to be re-read.',
		run: async () => rereadOf(world(dossierWith(), { role: 'viewer' }))
	},
	{
		id: '1a835f99',
		name: 'An AI client cannot click',
		expected: 'blocked',
		holds: 'Only the person clicks on the page.',
		run: async () => rereadOf(world(dossierWith()), true)
	},
	{
		id: 'd8516660',
		name: 'Someone outside the workspace asks nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => rereadOf(world(dossierWith(), { role: 'none' }))
	},
	{
		id: 'dc5a045c',
		name: 'Without sign-in a viewer asks for a re-reading',
		expected: 'success',
		then: [{ path: 'aiClicks.waiting', operator: 'equals', value: 1 }],
		run: async () => rereadOf(world(dossierWith(), { role: 'viewer', signIn: false }))
	}
]);

// ---------------------------------------------------------------------------
// Withdraw a click on a request (08bb2357)

const ASK_ON_REQUEST = { kind: 'ask' as const, fieldPath: '00-need.situation', leafId: null, messageId: 'm1' };

const withdrawOf = async (w: ReturnType<typeof world>, asAi = false): Promise<Outcome> => {
	const answer = await w.batch([{ op: 'withdraw_click', requestId: REQUEST, clickId: 'c1' }], asAi);
	return { status: status(answer.status === 200 && answer.body?.ok === true), final: { 'aiClicks.waiting': waitingOf(w.stored()) }, said: said(answer.body) };
};

prove('08bb2357', 'Withdraw a click on a request', [
	{
		id: 'b652516d',
		name: 'A waiting click is withdrawn',
		expected: 'success',
		then: [{ path: 'aiClicks.waiting', operator: 'equals', value: 0 }],
		run: async () => withdrawOf(world(requestClick(dossierWith(), 'c1', ago(30), ASK_ON_REQUEST)))
	},
	{
		id: '4e15ee00',
		name: 'No click waits here',
		expected: 'blocked',
		holds: 'No click waits for your AI here.',
		run: async () => {
			// The AI took it: it is no longer the person's to withdraw.
			const id = sessionIds();
			const draft = takenOnRequest(mirrored(requestClick(openSession(dossierWith(), id.me, ago(120)), 'c1', ago(60), ASK_ON_REQUEST), id.me, ago(55)), ago(50));
			return withdrawOf(world(draft));
		}
	},
	{
		id: '70ae3cdd',
		name: "An AI cannot withdraw the person's click",
		expected: 'blocked',
		run: async () => {
			const w = world(requestClick(dossierWith(), 'c1', ago(30), ASK_ON_REQUEST));
			const outcome = await withdrawOf(w, true);
			expect(waitingOf(w.stored())).toBe(1);
			return outcome;
		}
	},
	{
		id: '9959d410',
		name: 'A viewer withdraws their own question',
		expected: 'success',
		run: async () => withdrawOf(world(requestClick(dossierWith(), 'c1', ago(30), ASK_ON_REQUEST), { role: 'viewer' }))
	},
	{
		id: 'c46c68c5',
		name: 'Someone outside the workspace withdraws nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => withdrawOf(world(requestClick(dossierWith(), 'c1', ago(30), ASK_ON_REQUEST), { role: 'none' }))
	}
]);

// ---------------------------------------------------------------------------
// Cancel what my AI is doing (4b75175a)

/** Three places the AI wrote for the click on the request: the request's requester, its title and the cost of its Need. */
const THREE_PLACES: JournalEntry[] = [
	{ section: 'evolution', path: ['requests', { id: REQUEST }, 'requester'], existedBefore: true, before: '', existsAfter: true, after: 'Ana' },
	{ section: 'evolution', path: ['requests', { id: REQUEST }, 'title'], existedBefore: true, before: 'Save a cart for later', existsAfter: true, after: 'Keep a cart' },
	{ section: 'evolution', path: ['requests', { id: REQUEST }, 'need', 'cost'], existedBefore: true, before: '', existsAfter: true, after: 'Lost sales' }
];

/** The dossier as the AI left it after writing those places, the Need's cost changed by someone since. */
const writtenThenChanged = (draft: ProjectEvolutionDraft, changed: boolean) =>
	withRequest(withJournal(draft, THREE_PLACES), (r) => ({ ...r, requester: 'Ana', title: 'Keep a cart', need: { ...r.need, cost: changed ? 'Lost carts, said Bo' : 'Lost sales' } }));

const cancelState = (w: ReturnType<typeof world>): State => {
	const click = w.request().aiClicks.find((c) => c.id === 'c1');
	const mirror = w.request().liveSessions.find((s) => !s.endedAt);
	return {
		'undo.putBack': click?.cancellation?.undone ?? 0,
		'undo.kept': click?.cancellation?.kept.length ?? 0,
		'aiTurn.cancelled': !!mirror?.cancelledClickId,
		'aiTurn.onClick': click?.state === 'taken'
	};
};

const cancelOf = async (w: ReturnType<typeof world>, asAi = false, requestId: string | null = REQUEST): Promise<Outcome> => {
	const answer = await w.live({ ...(requestId ? { requestId } : {}), act: 'cancel' }, asAi);
	return { status: status(answer.status === 200 && answer.body?.ok === true), final: cancelState(w), said: said(answer.body) };
};

prove('4b75175a', 'Cancel what my AI is doing', [
	{
		id: 'd45adae7',
		name: 'Cancel puts back what the AI wrote and keeps what changed since',
		expected: 'success',
		then: [
			{ path: 'undo.putBack', operator: 'equals', value: 2 },
			{ path: 'undo.kept', operator: 'equals', value: 1 },
			{ path: 'aiTurn.cancelled', operator: 'is_true' },
			{ path: 'aiTurn.onClick', operator: 'is_false' }
		],
		run: async () => {
			const w = world(writtenThenChanged(onPrefill(sessionIds().me), true));
			const outcome = await cancelOf(w);
			expect(w.request()).toMatchObject({ requester: '', title: 'Save a cart for later', need: { cost: 'Lost carts, said Bo' } });
			return outcome;
		}
	},
	{
		id: 'a6373987',
		name: 'Your AI is on no request of yours',
		expected: 'blocked',
		holds: 'Your AI is on no request of yours right now.',
		run: async () => cancelOf(world(onPrefill(sessionIds().me, 'specification', false)))
	},
	{
		id: '30f66c47',
		name: 'A click outside a request is not cancelled',
		expected: 'blocked',
		run: async () => {
			// A question on a block is in the AI's hands: Cancel lives on a request, and the request holds no click of the AI.
			const id = sessionIds();
			const w = world(onProjectClick('ask_block', id.me));
			const onRequest = await cancelOf(w);
			const onProject = await cancelOf(w, false, null);
			expect(onProject.status).toBe('blocked');
			expect(w.stored().clicks?.[0].state).toBe('taken');
			return onRequest;
		}
	},
	{
		id: 'e987c1b3',
		name: 'No session, nothing to cancel',
		expected: 'blocked',
		run: async () => {
			const id = sessionIds();
			const ended = endProjectSession(onPrefill(id.me), ANA, 'gone', ago(10), id.me);
			if (!ended.ok) throw new Error(ended.reason);
			return cancelOf(world(ended.draft));
		}
	},
	{
		id: '863466eb',
		name: 'An AI cannot cancel its own work',
		expected: 'blocked',
		holds: 'Only the person whose AI took the click cancels it.',
		run: async () => cancelOf(world(onPrefill(sessionIds().me)), true)
	},
	{
		id: '63b0a75e',
		name: 'A click cancelled before anything was written',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => cancelOf(world(onPrefill(sessionIds().me), { role: 'none' }))
	},
	{
		id: '3947ca66',
		name: 'Handed, written, changed by someone, cancelled',
		expected: 'success',
		then: [
			{ path: 'undo.putBack', operator: 'equals', value: 0 },
			{ path: 'aiTurn.cancelled', operator: 'is_true' }
		],
		run: async () => {
			// The click waits; the AI opens its session (2cbbe7a7) and is handed it (ed32c885); nothing was written for it to change (9211a35b).
			const w = world(requestClick(dossierWith(), 'c1', ago(60)));
			const opened = await w.live({ act: 'start', client: 'Claude Code' }, true);
			const handed = await waitAs(w, opened.body.session.id as string);
			expect(handed.body).toMatchObject({ kind: 'click', requestId: REQUEST });
			return cancelOf(w);
		}
	}
]);

// ---------------------------------------------------------------------------
// Someone changes a place my AI wrote (9211a35b)

/** How many of the places the AI wrote for its click someone changed since, as cancelling would read them. */
const changedSince = (w: ReturnType<typeof world>): number => {
	const click = w.request().aiClicks.find((c) => c.id === 'c1')!;
	return undoJournal({ evolution: w.stored() }, click.journal ?? []).kept.length;
};

prove('9211a35b', 'Someone changes a place my AI wrote', [
	{
		id: '1ba43fe2',
		name: 'Someone changes a place the AI wrote',
		expected: 'success',
		then: [{ path: 'aiTurn.placesChangedSince', operator: 'equals', value: 1 }],
		run: async () => {
			const two = THREE_PLACES.slice(0, 2);
			const draft = withRequest(withJournal(onPrefill(sessionIds().me), two), (r) => ({ ...r, requester: 'Ana', title: 'Keep a cart' }));
			const w = world(draft);
			const before = changedSince(w);
			// A person retitles the request.
			const edit = await w.batch([{ op: 'update_request', requestId: REQUEST, title: 'Keep a cart until Monday' }], false);
			expect(edit.status).toBe(200);
			return { status: status(changedSince(w) > before), final: { 'aiTurn.placesChangedSince': changedSince(w) } };
		}
	},
	{
		id: '6c3c8546',
		name: 'Every place the AI wrote changed already',
		expected: 'blocked',
		run: async () => {
			const draft = withRequest(withJournal(onPrefill(sessionIds().me), THREE_PLACES.slice(1, 2)), (r) => ({ ...r, title: 'Changed by Bo' }));
			const w = world(draft);
			const before = changedSince(w);
			expect(before).toBe(1);
			const edit = await w.batch([{ op: 'update_request', requestId: REQUEST, title: 'Changed again' }], false);
			expect(edit.status).toBe(200);
			return { status: status(changedSince(w) > before), final: {} };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record that my session opened (2cbbe7a7)

prove('2cbbe7a7', 'Record that my session opened', [
	{
		id: 'ee09614d',
		name: 'A new session takes back what a session no longer open held',
		expected: 'success',
		then: [
			{ path: 'aiClicks.waiting', operator: 'equals', value: 1 },
			{ path: 'aiTurn.onClick', operator: 'is_false' }
		],
		run: async () => {
			// Version 2: a session whose AI left without ending took a question on a block; a new AI opens its session.
			const gone = `gone-${sessionIds().me}`;
			const taken = takeProjectClick(projectClick(dossierWith(), 'ask_block', 'c1', ago(60)), 'c1', ago(50), gone);
			if (!taken) throw new Error('nothing to take');
			const w = world(taken.draft);
			const opened = await w.live({ act: 'start', client: 'Codex' }, true);
			const newer = opened.body.session.id as string;
			const heldByNew = (w.stored().clicks ?? []).some((c) => c.state === 'taken' && c.sessionId === newer);
			return { status: status(opened.status === 200), final: { 'aiClicks.waiting': waitingOf(w.stored()), 'aiTurn.onClick': heldByNew } };
		}
	},
	{
		id: '4e309d4f',
		name: "A new session leaves another AI's click to it",
		expected: 'success',
		then: [
			{ path: 'aiClicks.waiting', operator: 'equals', value: 0 },
			{ path: 'aiTurn.onClick', operator: 'is_false' }
		],
		run: async () => {
			// Claude Code's session is open and its AI holds a question on a block; Codex opens its own session.
			const id = sessionIds();
			const w = world(onProjectClick('ask_block', id.me));
			const opened = await w.live({ act: 'start', client: 'Codex' }, true);
			const newer = opened.body.session.id as string;
			const heldByNew = (w.stored().clicks ?? []).some((c) => c.state === 'taken' && c.sessionId === newer);
			return { status: status(opened.status === 200), final: { 'aiClicks.waiting': waitingOf(w.stored()), 'aiTurn.onClick': heldByNew } };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record that my session ended (814118fa)

prove('814118fa', 'Record that my session ended', [
	{
		id: '0e976687',
		name: 'An ending session gives back the click in hand',
		expected: 'success',
		then: [
			{ path: 'aiClicks.waiting', operator: 'equals', value: 1 },
			{ path: 'aiTurn.onClick', operator: 'is_false' }
		],
		run: async () => {
			const id = sessionIds();
			const w = world(withJournal(onPrefill(id.me), THREE_PLACES.slice(0, 1)));
			const ended = await w.live({ act: 'end', sessionId: id.me }, false);
			expect(ended.status).toBe(200);
			const click = w.request().aiClicks.find((c) => c.id === 'c1');
			// What the AI wrote stays: the place keeps its value, only the journal goes.
			expect(w.request().requester).toBe('');
			return { status: status(ended.status === 200), final: { 'aiClicks.waiting': waitingOf(w.stored()), 'aiTurn.onClick': click?.state === 'taken' } };
		}
	},
	{
		id: '826ed1bc',
		name: 'Nothing is given back while the session lasts',
		expected: 'blocked',
		run: async () => {
			// Another AI of the person opens its own session: this one lasts, and keeps the click in its hands.
			const id = sessionIds();
			const w = world(onProjectClick('ask_block', id.me));
			const opened = await w.live({ act: 'start', client: 'Codex' }, true);
			expect(opened.status).toBe(200);
			const givenBack = (w.stored().clicks ?? []).some((c) => c.id === 'c1' && c.state === 'waiting');
			return { status: status(givenBack), final: {} };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record a click waiting for my AI (30c293d0), a click taken back (b2021f6f), that I moved a request on (f2fb6daa)

prove('30c293d0', 'Record a click waiting for my AI', [
	{
		id: '0e2b9f71',
		name: 'A click joins the queue',
		expected: 'success',
		then: [{ path: 'aiClicks.waiting', operator: 'equals', value: 1 }],
		run: async () => rereadOf(world(dossierWith()))
	}
]);

prove('b2021f6f', 'Record a click taken back', [
	{
		id: 'a3b9b1ec',
		name: 'A withdrawn click leaves the queue',
		expected: 'success',
		then: [{ path: 'aiClicks.waiting', operator: 'equals', value: 0 }],
		run: async () => {
			const w = world(projectClick(dossierWith(), 'reread', 'c1', ago(30)));
			const answer = await w.live({ act: 'withdraw', clickId: 'c1' }, false);
			return { status: status(answer.status === 200), final: { 'aiClicks.waiting': waitingOf(w.stored()) } };
		}
	},
	{
		id: '899338a3',
		name: 'Nothing to take out of the queue',
		expected: 'blocked',
		holds: 'Nothing waits for your AI.',
		run: async () => {
			const w = world(dossierWith());
			const answer = await w.live({ act: 'withdraw', clickId: 'c1' }, false);
			return { status: status(answer.status === 200), final: {}, said: said(answer.body) };
		}
	}
]);

prove('f2fb6daa', 'Record that I moved a request on', [
	{
		id: '1ecdb46d',
		name: 'The person moves a request on',
		expected: 'success',
		then: [{ path: 'progress.unheard', operator: 'is_true' }],
		run: async () => {
			// What an AI of the person heard of the request before; the person then validates the Need.
			const heard = heardOf(freshRequest(), ago(100));
			const w = world(dossierWith());
			const moved = await w.batch(
				['00-need.description', '00-need.situation', '00-need.objectives'].map((fieldPath) => ({ op: 'validate_field', requestId: REQUEST, fieldPath })),
				false
			);
			return { status: status(moved.status === 200 && moved.body?.ok === true), final: { 'progress.unheard': progressSince(w.request(), heard) !== null }, said: said(moved.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Criteria of the draft (EVO-015)

describe('the clicks of a person with several AIs in session (EVO-015)', () => {
	it('a click goes to one AI, without the person choosing [criterion:422604cf]', async () => {
		// Claude Code holds EVO-014 and is on a click of it; Codex, opened later, listens.
		const id = sessionIds();
		let draft = openSession(openSession(dossierWith(), id.me, ago(300)), id.newer, ago(200), 'Codex');
		draft = takenOnRequest(mirrored(requestClick(draft, 'c0', ago(250)), id.me, ago(240)), ago(240));
		const w = world(draft);
		w.hear(id.me, 'thinking');
		w.hear(id.newer, 'listening');
		// The person clicks Prefill on EVO-014, then Re-read the code on a feature no AI holds.
		const prefill = sendClick(w.request(), ANA, { kind: 'prefill', fieldPath: '00-need.situation', leafId: null }, true, 'c1', ago(20));
		if (!prefill.ok) throw new Error(prefill.reason);
		w.stored().requests[0] = prefill.request;
		expect((await w.live({ act: 'click', ...REREAD }, false)).status).toBe(200);
		// Codex gets the re-reading, never the Prefill.
		const codex = await waitAs(w, id.newer);
		expect(codex.body).toMatchObject({ kind: 'click', requestId: null, click: { kind: 'reread' } });
		expect(w.request().aiClicks.find((c) => c.id === 'c1')?.state).toBe('waiting');
		// Claude Code waits again: its turn closes and the Prefill on its request reaches it.
		const claude = await waitAs(w, id.me);
		expect(claude.body).toMatchObject({ kind: 'click', requestId: REQUEST, click: { id: 'c1' } });
		// No click reached two AIs.
		expect((w.stored().clicks ?? []).filter((c) => c.state === 'taken').map((c) => c.sessionId)).toEqual([id.newer]);
		// When every AI of the person works, a click waits for the first that frees up.
		w.hear(id.me, 'thinking');
		w.hear(id.newer, 'thinking');
		const later = sendProjectClick(w.stored(), ANA, { ...REREAD, anchor: 'feature:f2', featureId: 'f2' }, true, 'c3', NOW);
		if (!later.ok) throw new Error(later.reason);
		expect(clicksFor(later.draft, ANA, id.newer, (s) => (s === id.newer ? { free: true, working: false } : { free: false, working: true })).map((c) => (c.where === 'project' ? c.click.id : c.requestId))).toEqual(['c3']);
	});

	it('a click is never lost when an AI leaves [criterion:ca1b7a43]', async () => {
		// Claude Code holds a Prefill of EVO-014 unanswered, having written one place for it; Codex listens.
		const id = sessionIds();
		let draft = openSession(openSession(dossierWith(), id.me, ago(300)), id.newer, ago(200), 'Codex');
		draft = withRequest(withJournal(takenOnRequest(mirrored(requestClick(draft, 'c1', ago(250)), id.me, ago(240)), ago(240)), THREE_PLACES.slice(0, 1)), (r) => ({ ...r, requester: 'Ana' }));
		const w = world(draft);
		w.hear(id.newer, 'listening');
		// Claude Code's session ends.
		expect((await w.live({ act: 'end', sessionId: id.me }, false)).status).toBe(200);
		expect(w.request().aiClicks.find((c) => c.id === 'c1')?.state).toBe('waiting');
		// What Claude Code wrote stays.
		expect(w.request().requester).toBe('Ana');
		// The next AI of the person that listens takes it.
		const codex = await waitAs(w, id.newer);
		expect(codex.body).toMatchObject({ kind: 'click', requestId: REQUEST, click: { id: 'c1' } });
	});
});
