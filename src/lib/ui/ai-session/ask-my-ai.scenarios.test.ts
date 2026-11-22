import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { render } from 'svelte/server';
import type { SectionDraftRepositoryPort, SectionDraftSaveOptions, SectionDocumentStorePort } from '$application/ports';
import { LoadResidueDraftUseCase, SaveResidueDraftUseCase } from '$application/specification/residue-draft-use-cases';
import { AiConversationsUseCase } from '$application/collaboration/ai-conversations';
import { createEmptyEvolutionDraft, createEvolutionRequest, type ProjectEvolutionDraft } from '$domain/evolution';
import { AI_CONVERSATIONS_SECTION } from '$lib/shared/section-sync';
import { LIVE_SESSION_EVENT } from '$lib/shared/live-session';
import { subscribeLiveSignals } from '$lib/server/sync-bus.server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { pendingDialog, settleDialog } from '$ui/design-system/dialog.svelte';
import { dismissToast, toasts } from '$ui/design-system/toast.svelte';
import { startChat } from '$ui/ask/ask-client';
import { GET as readLive, POST as liveAct } from '../../../routes/api/evolution/live/+server';
import { GET as readConversations, POST as askAct } from '../../../routes/projects/[projectId]/ask/+server';
import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
import { ProjectAiSession } from './project-ai-session.svelte';
import { aiStanding } from './ai-standing';

/**
 * The scenarios of "Ask my AI in the navigation" (surface db7246fa of
 * feat-lyriks-copy-a52881-11, as EVO-015 version 1 has them): the actions that
 * read or write what Ask my AI says of the reader's AIs (chip.session,
 * chip.panelOpen, chip.aisInSession, chip.rowsShown), run against the real
 * code. The reader's page is the real ProjectAiSession store over the real
 * doors (/api/evolution/live, /projects/:projectId/ask) and an in-memory
 * store; their AIs are the real door called with the AI client's mark; the
 * button and what the box decides to show come from a server render of the
 * real AskAiTool.
 *
 * Vitest renders a Svelte component on the server only: the box starts closed
 * there, so what it shows once opened is read where the component reads it,
 * its own `inSession` (the button's title says "Your AI is in session" exactly
 * when the box shows the session lines) and the store's `aiSessions`, one line
 * each. The press of Ask is the box's own sequence (copy the prompt unless an
 * AI listens, then start the conversation through the real client).
 */

const PERSON = 'ada@example.test';
const shown = vi.hoisted(() => ({ session: null as ProjectAiSession | null }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/p/spec') } }));
vi.mock('./project-ai-session.svelte', async (original) => ({ ...(await original<object>()), useProjectAiSession: () => shown.session }));

const SURFACE = 'db7246fa';
const NOW = '2026-11-22T15:00:00.000Z';
const COPIED = 'Prompt copied: paste it in a new conversation with your AI agent, then stay on the page.';
const CLIENTS = ['Claude Code', 'Codex', 'Cursor'];

type State = Record<string, string | number | boolean>;
const DEFAULTS: State = {
	'installation.signInRequired': true,
	'session.workspaceRole': 'designer',
	'session.callerKind': 'person',
	'chip.session': 'none',
	'chip.panelOpen': false,
	'chip.aisInSession': 1,
	'chip.rowsShown': 0,
	'page.where': 'knowledge',
	'askBox.open': false,
	'question.state': 'none',
	'sessionPrompt.handed': 'none',
	'clipboard.open': true
};

interface Scenario {
	readonly action: string;
	readonly id: string;
	readonly name: string;
	readonly given?: State;
	readonly question?: string;
	readonly expected: 'success' | 'blocked';
	readonly then?: State;
	/** For a blocked scenario: what the real code answered, so it is refused for the scenario's own reason. */
	readonly holds?: string;
}

const SCENARIOS: readonly Scenario[] = [
	// Ask my AI from the page (336e9466)
	{ action: '336e9466', id: '2cb7bbbd', name: 'A question in session reaches my AI', given: { 'chip.session': 'open' }, question: 'Which rules guard the start of a run?', expected: 'success', then: { 'question.state': 'waiting', 'sessionPrompt.handed': 'none', 'askBox.open': false } },
	{ action: '336e9466', id: 'c2cff6b7', name: 'A question without a session copies the prompt that opens one', question: 'What does a viewer see here?', expected: 'success', then: { 'question.state': 'waiting', 'sessionPrompt.handed': 'copied' } },
	{ action: '336e9466', id: 'b1e0c68e', name: 'A closed clipboard shows the prompt to copy by hand', given: { 'clipboard.open': false }, question: 'Why is this rule here?', expected: 'success', then: { 'sessionPrompt.handed': 'shown' } },
	{ action: '336e9466', id: 'e7e8bbaf', name: 'An empty question is refused', given: { 'chip.session': 'open' }, question: '', expected: 'blocked', holds: 'Write your message first.' },
	{ action: '336e9466', id: 'e53eb632', name: "An AI client cannot ask in the person's place", given: { 'session.callerKind': 'ai_client' }, question: 'Anything?', expected: 'blocked', holds: '403' },
	{ action: '336e9466', id: '4c98e2be', name: 'Someone outside the workspace does not see the project', given: { 'session.workspaceRole': 'none' }, question: 'Anything?', expected: 'blocked', holds: 'Project not found' },
	{ action: '336e9466', id: 'd623c35e', name: 'A viewer asks about what they read', given: { 'session.workspaceRole': 'viewer' }, question: 'What does this term mean?', expected: 'success', then: { 'question.state': 'waiting' } },
	{ action: '336e9466', id: '887ca30e', name: 'Without sign-in anyone asks', given: { 'installation.signInRequired': false, 'session.workspaceRole': 'none' }, question: 'Where is this used?', expected: 'success', then: { 'question.state': 'waiting' } },
	// Read where my AI stands (dd8370af)
	{ action: 'dd8370af', id: 'b849eb75', name: 'Open the chip in session', given: { 'chip.session': 'open' }, expected: 'success', then: { 'chip.panelOpen': true } },
	{ action: 'dd8370af', id: '685df148', name: 'No session, no panel', given: { 'chip.session': 'ended' }, expected: 'blocked', holds: 'no session line' },
	{ action: 'dd8370af', id: 'e86ba2ea', name: 'Two AIs in session read one line each', given: { 'chip.session': 'open', 'chip.aisInSession': 2 }, expected: 'success', then: { 'chip.panelOpen': true, 'chip.rowsShown': 2 } },
	// Record that my session opened (67c8850e)
	{ action: '67c8850e', id: 'd4ab9480', name: 'The session opens', expected: 'success', then: { 'chip.session': 'open' } },
	// Record that my session ended (7af59c58)
	{ action: '7af59c58', id: 'dd5d67b9', name: 'An ending session gives the question back', given: { 'chip.session': 'open', 'question.state': 'taken', 'chip.panelOpen': true }, expected: 'success', then: { 'question.state': 'waiting', 'chip.session': 'ended', 'chip.panelOpen': false } },
	{ action: '7af59c58', id: 'fea994ce', name: 'Nothing ends without an open session', expected: 'blocked', holds: 'There is no session to end.' },
	// Record that my AI took my question (5eb49117)
	{ action: '5eb49117', id: 'da11170a', name: 'The AI takes the waiting question', given: { 'chip.session': 'open', 'question.state': 'waiting' }, expected: 'success', then: { 'question.state': 'taken' } },
	{ action: '5eb49117', id: '264275f4', name: 'Nothing is handed without a session', given: { 'question.state': 'waiting' }, expected: 'blocked', holds: 'No session is open on this project: open one with start_evolution_session given the project alone.' },
	{ action: '5eb49117', id: 'd7478528', name: 'No waiting question, nothing taken', given: { 'chip.session': 'open', 'question.state': 'withdrawn' }, expected: 'blocked', holds: 'nothing' }
];

/** A section document store in memory, with the optimistic revision the real one keeps. */
function memoryDocuments(): SectionDocumentStorePort {
	const rows = new Map<string, { document: unknown; revision: number }>();
	return {
		load: async (projectId, section) => structuredClone(rows.get(`${projectId}/${section}`)?.document ?? null),
		save: async (projectId, section, document, expected) => {
			const key = `${projectId}/${section}`;
			const revision = rows.get(key)?.revision ?? 0;
			if (expected !== null && expected !== revision) return null;
			rows.set(key, { document: structuredClone(document), revision: revision + 1 });
			return revision + 1;
		},
		currentRevision: async (projectId, section) => rows.get(`${projectId}/${section}`)?.revision ?? 0
	};
}

type Answer = { readonly status: number; readonly body: Record<string, unknown> };

/**
 * One project, the reader's page (the store, fed by the bus as the live sync
 * feeds it) and the doors their AI and their page reach, for the state given.
 */
function world(projectId: string, state: State, seed?: ProjectEvolutionDraft) {
	let stored: ProjectEvolutionDraft | null = seed ? structuredClone(seed) : null;
	let revision = 0;
	const repo = {
		load: async () => (stored ? structuredClone(stored) : null),
		save: async (draft: ProjectEvolutionDraft, save?: SectionDraftSaveOptions) => {
			if (save?.expectedRevision != null && save.expectedRevision !== revision) return null;
			stored = structuredClone(draft);
			return ++revision;
		},
		currentRevision: async () => revision
	} satisfies SectionDraftRepositoryPort<ProjectEvolutionDraft>;
	const clock = { nowIso: () => NOW };
	const documents = memoryDocuments();
	const role = String(state['session.workspaceRole']);
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		// The workspace as Lyriks reads it: a project outside it answers as not found, a viewer reads it and writes nothing.
		projectAccess: {
			authorize: async (_id: string, _token: string | null, action: string) =>
				role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action === 'write' ? { ok: false, reason: 'forbidden' } : { ok: true }
		},
		enterpriseHooks: null,
		projectExists: async (id: string) => id === projectId,
		currentSession: () => ({ isAuthenticated: true, email: PERSON }),
		backLinks: { find: async () => null },
		workspaces: { listForCaller: async () => [] },
		clock,
		loadEvolutionDraft: new LoadResidueDraftUseCase(repo, createEmptyEvolutionDraft),
		saveEvolutionDraft: new SaveResidueDraftUseCase(repo, clock),
		sectionDocuments: { ...documents, currentRevision: async (id: string, section: string) => (section === 'evolution' ? revision : documents.currentRevision(id, section)) },
		aiConversations: new AiConversationsUseCase(documents, AI_CONVERSATIONS_SECTION),
		draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
		implementationCoverage: { invalidate: () => {} },
		captureBaseline: { execute: async () => null },
		scheduleBackSync: async () => {}
	});
	const event = (path: string, init: { method?: string; body?: string; ai?: boolean; params?: Record<string, string> } = {}) =>
		requestEvent({
			path,
			method: init.method ?? 'GET',
			...(init.body !== undefined ? { body: init.body } : {}),
			headers: init.ai ? { 'x-lyriks-actor': 'ai_client' } : {},
			authRequired: state['installation.signInRequired'] === true,
			services,
			cookies: { lyriks_session: 'jwt' },
			params: init.params ?? {}
		});
	/** A handler's answer as a Response, a refusal it throws included, as the browser receives it. */
	const respond = (run: () => Response | Promise<Response>): Promise<Response> =>
		Promise.resolve()
			.then(run)
			.catch((failure: unknown) => {
				if (isHttpError(failure)) return new Response(JSON.stringify(failure.body), { status: failure.status, headers: { 'content-type': 'application/json' } });
				throw failure;
			});
	const route = (url: string, init: RequestInit = {}, ai = false): Promise<Response> => {
		const method = init.method ?? 'GET';
		const body = typeof init.body === 'string' ? init.body : undefined;
		if (url.startsWith('/api/evolution/live'))
			return respond(() => (method === 'POST' ? liveAct(event(url, { method, body, ai }) as never) : readLive(event(url, { ai }) as never)));
		if (url.startsWith(`/projects/${projectId}/ask`)) {
			const params = { projectId };
			return respond(() => (method === 'POST' ? askAct(event(url, { method, body, ai, params }) as never) : readConversations(event(url, { ai, params }) as never)));
		}
		return Promise.reject(new Error(`no route for ${url} in this test`));
	};
	const asJson = async (r: Response): Promise<Answer> => ({ status: r.status, body: JSON.parse((await r.text()).trim() || 'null') ?? {} });
	return {
		/** The page's fetch: every call it makes reaches the real door, as the person. */
		fetch: (input: RequestInfo | URL, init?: RequestInit) => route(String(input), init),
		/** A call of the person's AI on the live door, marked as the MCP marks it. */
		ai: async (body: Record<string, unknown>) => asJson(await route('/api/evolution/live', { method: 'POST', body: JSON.stringify({ projectId, ...body }) }, true)),
		/** A call of the person's page on the live door. */
		person: async (body: Record<string, unknown>) => asJson(await route('/api/evolution/live', { method: 'POST', body: JSON.stringify({ projectId, ...body }) })),
		/** An act on the person's conversations, as their page or as an AI client. */
		ask: async (body: Record<string, unknown>, ai = false) => asJson(await route(`/projects/${projectId}/ask`, { method: 'POST', body: JSON.stringify(body) }, ai)),
		conversations: async () => ((await asJson(await route(`/projects/${projectId}/ask`))).body.conversations ?? []) as { id: string; turn: string; messages: { id: string }[] }[]
	};
}

/** The reader's page on the project: the real store, fed by the live signals of the bus as the live sync feeds them. */
function readerPage(projectId: string) {
	const page = new EventTarget();
	vi.stubGlobal('window', page);
	const unsubscribe = subscribeLiveSignals((signal) => {
		// The stream of a page carries the signals of its own person only (criterion ea1709d0).
		if (signal.projectId === projectId && signal.personId === PERSON) page.dispatchEvent(new CustomEvent(LIVE_SESSION_EVENT, { detail: signal }));
	});
	const store = new ProjectAiSession(() => projectId, () => 'Signal', () => true);
	const stop = store.listen();
	return { store, stop: () => (stop(), unsubscribe()) };
}

/** What Ask my AI shows, from a server render of the real component: its button, and whether the box would show the session lines. */
function box(store: ProjectAiSession) {
	shown.session = store;
	const html = render(AskAiTool, { props: { anchor: 'product', title: 'Product summary' } }).body.replace(/<!--.*?-->/g, '');
	const button = html.match(/<button[^>]*data-tip="Ask my AI[\s\S]*?<\/button>/)?.[0] ?? '';
	const title = button.match(/ title="([^"]*)"/)?.[1] ?? '';
	return { html, button, inSession: title.startsWith('Your AI is in session'), dialogOpen: html.includes('role="dialog"') };
}

const settle = async () => {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Bring the world to the state given, through the acts that make it so. */
async function given(w: ReturnType<typeof world>, state: State): Promise<{ sessions: string[] }> {
	const sessions: string[] = [];
	if (state['chip.session'] === 'open' || state['chip.session'] === 'ended') {
		const count = state['chip.session'] === 'open' ? Number(state['chip.aisInSession']) : 1;
		for (let i = 0; i < count; i++) {
			const opened = await w.ai({ act: 'start', client: CLIENTS[i] });
			expect(opened.status).toBe(200);
			sessions.push(String((opened.body.session as { id: string }).id));
		}
		if (state['chip.session'] === 'ended') expect((await w.person({ act: 'end', sessionId: sessions[0] })).status).toBe(200);
	}
	if (state['question.state'] !== 'none') {
		const asked = await w.ask({ act: 'start', text: 'Which rules guard the start of a run?', context: { title: 'Runs', href: '/projects/p/spec' } });
		expect(asked.status).toBe(200);
		if (state['question.state'] === 'taken') {
			const taken = await w.ai({ act: 'await', sessionId: sessions[sessions.length - 1], waitSeconds: 1 });
			expect(taken.body.kind).toBe('click');
		}
		if (state['question.state'] === 'withdrawn') {
			const [conversation] = await w.conversations();
			expect((await w.ask({ act: 'withdraw', conversationId: conversation.id, messageId: conversation.messages[0].id })).status).toBe(200);
		}
	}
	return { sessions };
}

/** The clipboard as the browser offers it, open or kept closed. */
function clipboard(open: boolean) {
	const writeText = vi.fn(async () => {
		if (!open) throw new Error('The clipboard is closed to this origin.');
	});
	vi.stubGlobal('navigator', { clipboard: { writeText } });
	return writeText;
}

afterEach(() => {
	// Toasts live for the page: each scenario starts on a page that shows none.
	for (const t of toasts()) dismissToast(t.id);
	vi.unstubAllGlobals();
	settleDialog(null);
	shown.session = null;
});

describe('Ask my AI in the navigation, its scenarios run against the real code (EVO-015 version 1)', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${scenario.action}:${scenario.id}]`, async () => {
			const state: State = { ...DEFAULTS, ...(scenario.given ?? {}) };
			const projectId = `p11-${scenario.id}`;
			const w = world(projectId, state);
			const writeText = clipboard(state['clipboard.open'] === true);
			const { store, stop } = readerPage(projectId);
			vi.stubGlobal('fetch', w.fetch);
			try {
				const { sessions } = await given(w, state);
				await store.refresh();
				let status: 'success' | 'blocked' = 'success';
				let said = '';
				let handed = 'none';
				switch (scenario.action) {
					case '336e9466': {
						if (state['session.callerKind'] === 'ai_client') {
							// The page never marks a call as its AI's: the refusal is the door's own.
							const refused = await w.ask({ act: 'start', text: scenario.question }, true);
							status = refused.status === 200 ? 'success' : 'blocked';
							said = String(refused.status);
							break;
						}
						// The press of Ask, as the box makes it: the prompt is copied first unless an AI listens, then the conversation starts.
						const copying = store.listening ? null : store.copyChatPrompt();
						const started = await startChat(projectId, scenario.question ?? '', { title: 'Runs', href: `/projects/${projectId}/spec` });
						await settle();
						if (pendingDialog()?.request.title === 'Copy this prompt') {
							handed = 'shown';
							settleDialog('');
						}
						await copying;
						if (handed === 'none' && writeText.mock.calls.length > 0 && toasts().some((t) => t.message === COPIED)) handed = 'copied';
						status = started ? 'success' : 'blocked';
						said = toasts().find((t) => t.level === 'error')?.message ?? '';
						break;
					}
					case 'dd8370af':
						status = box(store).inSession ? 'success' : 'blocked';
						said = status === 'blocked' ? 'no session line' : '';
						break;
					case '67c8850e': {
						// The AI opens its session; the page follows it from its signal alone.
						expect((await w.ai({ act: 'start', client: 'Claude Code' })).status).toBe(200);
						for (let i = 0; i < 50 && !store.session; i++) await settle();
						status = store.isOpen ? 'success' : 'blocked';
						break;
					}
					case '7af59c58': {
						const ended = await w.person({ act: 'end', ...(sessions[0] ? { sessionId: sessions[0] } : {}) });
						status = ended.status === 200 ? 'success' : 'blocked';
						said = String(ended.body.message ?? '');
						break;
					}
					case '5eb49117': {
						const waited = await w.ai({ act: 'await', ...(sessions.length > 0 ? { sessionId: sessions[sessions.length - 1] } : {}), waitSeconds: 1 });
						status = waited.status === 200 && waited.body.kind === 'click' ? 'success' : 'blocked';
						said = String(waited.body.message ?? waited.body.kind ?? '');
						break;
					}
				}
				expect(status).toBe(scenario.expected);
				if (scenario.expected !== 'success') {
					expect(said).toContain(scenario.holds ?? '');
					// A refusal writes nothing the conversation would read otherwise.
					const [conversation] = await w.conversations();
					if (state['question.state'] !== 'none') expect(conversation?.turn).toBe(state['question.state']);
					return;
				}
				await store.refresh();
				const shownBox = box(store);
				const [conversation] = await w.conversations();
				const final: State = {
					'chip.session': store.isOpen ? 'open' : store.session ? 'ended' : 'none',
					'chip.panelOpen': shownBox.inSession,
					'chip.rowsShown': shownBox.inSession ? store.aiSessions.length : 0,
					'question.state': conversation?.turn ?? 'none',
					'sessionPrompt.handed': handed,
					'askBox.open': shownBox.dialogOpen
				};
				for (const [path, value] of Object.entries(scenario.then ?? {})) expect({ path, value: final[path] }).toEqual({ path, value });
			} finally {
				stop();
			}
		});
	}
});

describe('Ask my AI alone says whether my AIs are connected, the most active of them first [criterion:4cb97f74]', () => {
	it('reads Not connected, then Listening, then Working while one of several AIs works on a click, Listening again once it ended', async () => {
		const projectId = 'p11-criterion-4cb97f74';
		const w = world(projectId, DEFAULTS);
		const { store, stop } = readerPage(projectId);
		vi.stubGlobal('fetch', w.fetch);
		try {
			await store.refresh();
			expect(box(store).button).toMatch(/data-tone="off"[^>]*>[\s\S]*Not connected/);
			const claude = String(((await w.ai({ act: 'start', client: 'Claude Code' })).body.session as { id: string }).id);
			const codex = String(((await w.ai({ act: 'start', client: 'Codex' })).body.session as { id: string }).id);
			await store.refresh();
			expect(box(store).button).toMatch(/data-tone="listening"[^>]*>[\s\S]*Listening/);
			// The person asks; the free AI opened last takes it and works on it while the other listens.
			expect((await w.ask({ act: 'start', text: 'Who may start a run?', context: { title: 'Runs', href: '/projects/p/spec' } })).status).toBe(200);
			expect((await w.ai({ act: 'await', sessionId: codex, waitSeconds: 1 })).body.kind).toBe('click');
			await store.refresh();
			expect(store.aiSessions.map((a) => [a.name, a.status])).toEqual([
				['Codex', 'thinking'],
				['Claude Code', 'listening']
			]);
			expect(aiStanding(store, null).word).toBe('Working');
			expect(box(store).button).toMatch(/data-tone="working"[^>]*>[\s\S]*Working/);
			expect((await w.person({ act: 'end', sessionId: codex })).status).toBe(200);
			await store.refresh();
			expect(box(store).button).toMatch(/data-tone="listening"[^>]*>[\s\S]*Listening/);
			expect((await w.person({ act: 'end', sessionId: claude })).status).toBe(200);
			await store.refresh();
			expect(box(store).button).toMatch(/data-tone="off"[^>]*>[\s\S]*Not connected/);
		} finally {
			stop();
		}
	});
});

describe('In session Ask my AI lists each AI and what it does [criterion:39e1abc1]', () => {
	it('lists one line per AI in session, newest first, named after its client and what it holds, and ends one AI only', async () => {
		const projectId = 'p11-criterion-39e1abc1';
		const seed = { ...createEmptyEvolutionDraft(projectId), requests: [createEvolutionRequest({ id: 'r1', title: 'Several AIs at once', status: 'open' })] };
		const w = world(projectId, DEFAULTS, seed);
		const { store, stop } = readerPage(projectId);
		vi.stubGlobal('fetch', w.fetch);
		try {
			const claude = String(((await w.ai({ act: 'start', client: 'Claude Code', requestId: 'r1' })).body.session as { id: string }).id);
			const codex = String(((await w.ai({ act: 'start', client: 'Codex' })).body.session as { id: string }).id);
			await store.refresh();
			expect(box(store).inSession).toBe(true);
			expect(store.aiSessions.map((a) => ({ id: a.id, name: a.name, doing: aiStanding({ isOpen: true, ...a }, null).doing }))).toEqual([
				{ id: codex, name: 'Codex', doing: 'listening' },
				{ id: claude, name: 'Claude Code · EVO-001', doing: 'listening' }
			]);
			// End the session on one line ends that AI only.
			await store.end(codex);
			expect(store.aiSessions.map((a) => a.id)).toEqual([claude]);
			expect((await w.ai({ act: 'await', sessionId: claude, waitSeconds: 1 })).body.kind).toBe('nothing');
			expect((await w.ai({ act: 'await', sessionId: codex, waitSeconds: 1 })).body).toMatchObject({ kind: 'ended', reason: 'ended_by_person' });
			expect(box(store).inSession).toBe(true);
		} finally {
			stop();
		}
	});
});
