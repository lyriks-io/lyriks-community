import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushToast } from '$ui/design-system';
import { NO_SESSION_SENTENCE, fieldKey } from '$domain/evolution';
import type { DossierSummary } from '$lib/server/evolution-view.server';
import { LIVE_SESSION_EVENT, type LiveSessionSignal } from '$lib/shared/live-session';
import { LiveSession, isUnsentClick, type LiveClick } from './live-session.svelte';

/**
 * The reader's live session with their AI on one request page (feat-evo-live-session): what the request holds merged
 * with what the stream says the AI does, every click read at once and taken back when its save fails
 * (ac-evo-form-edit-optimistic). The real class over a request the test holds, a server stubbed at fetch and a
 * clipboard stubbed at navigator.
 */

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn(), promptDialog: vi.fn(async () => null) }));

type Live = DossierSummary['live'];
const OPEN: NonNullable<Live['session']> = { id: 's1', open: true, startedAt: '2026-11-18T01:00:00.000Z', endedAt: null, endReason: null };
const problem = { fieldPath: 'need.problem', leafId: null };
const click = (over: Partial<LiveClick> = {}): LiveClick => ({ id: 'c1', kind: 'prefill', fieldKey: fieldKey('need.problem', null), step: null, messageId: null, state: 'waiting', answeredNothing: false, at: '2026-11-18T01:05:00.000Z', ...over });
const signal = (status: LiveSessionSignal['status'], over: Partial<LiveSessionSignal> = {}): LiveSessionSignal => ({
	requestId: 'r1', personId: 'ana', sessionId: 's1', status, thinkingAbout: null, saying: null, step: null, endReason: null, at: '2026-11-18T01:06:00.000Z', ...over
});

let saved: Live;
let editor: boolean;
let copied: string[];
const session = () => new LiveSession('p', () => 'r1', () => 'Pay once', () => saved, () => editor);
/** The server: records each request, answers with the next queued answer (ok by default). */
function server() {
	const sent: { url: string; body: Record<string, unknown> }[] = [];
	const answers: (() => Promise<Response>)[] = [];
	vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
		sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
		return (answers.shift() ?? (async () => Response.json({ ok: true, results: [] })))();
	}));
	return { sent, answers };
}

beforeEach(() => {
	saved = { session: OPEN, clicks: [], stepPrefill: null };
	editor = true;
	copied = [];
	vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0));
	vi.stubGlobal('navigator', { clipboard: { writeText: async (text: string) => void copied.push(text) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('what the page says of the session [criterion:ac-leaf-ac-evo-live-state]', () => {
	it('reads none without a session, open until the AI is heard of, then what the stream says', () => {
		saved = { session: null, clicks: [], stepPrefill: null };
		expect(session().status).toBe('none');
		saved = { session: OPEN, clicks: [], stepPrefill: null };
		const live = session();
		expect(live.status).toBe('open');
		live.presence = signal('thinking', { thinkingAbout: 'the problem', step: 2, saying: 'Reading the code' });
		expect(live.status).toBe('thinking');
		expect(live.thinkingAbout).toBe('the problem');
		expect(live.step).toBe(2);
		expect(live.saying).toBe('Reading the code');
		expect(live.canCancel).toBe(true);
	});

	it('pays no heed to a signal of an earlier session', () => {
		const live = session();
		live.presence = signal('writing', { sessionId: 's0' });
		expect(live.status).toBe('open');
		expect(live.canCancel).toBe(false);
	});

	it('reads ended or gone once the session is over, and says nothing of what the AI was doing', () => {
		saved = { session: { ...OPEN, open: false, endReason: 'gone' }, clicks: [], stepPrefill: null };
		const live = session();
		live.presence = signal('listening', { saying: 'still here' });
		expect(live.status).toBe('gone');
		expect(live.isOpen).toBe(false);
		expect(live.saying).toBeNull();
		saved = { session: { ...OPEN, open: false, endReason: 'ended_by_person' }, clicks: [], stepPrefill: null };
		expect(session().status).toBe('ended');
	});

	it('follows the signals of its own request on the stream, and reads the presence the server holds on arrival', async () => {
		const target = new EventTarget();
		vi.stubGlobal('window', target);
		server().answers.push(async () => Response.json({ presence: signal('listening') }));
		const live = session();
		const stop = live.listen();
		await vi.waitFor(() => expect(live.status).toBe('listening'));
		target.dispatchEvent(new CustomEvent(LIVE_SESSION_EVENT, { detail: signal('writing', { requestId: 'other' }) }));
		expect(live.status).toBe('listening');
		target.dispatchEvent(new CustomEvent(LIVE_SESSION_EVENT, { detail: signal('writing') }));
		expect(live.status).toBe('writing');
		stop();
		target.dispatchEvent(new CustomEvent(LIVE_SESSION_EVENT, { detail: signal('listening') }));
		expect(live.status).toBe('writing');
	});
});

describe('a click reads at once and goes back if its save fails [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	it('waits for the AI on its field the moment it is sent, with what the server needs to write it', async () => {
		const { sent } = server();
		const live = session();
		live.presence = signal('listening');
		const sending = live.send('prefill', { ...problem, step: 'need', section: ['need.problem', 'need.goal'] });
		const shown = live.clickOn(problem);
		expect(shown).toMatchObject({ kind: 'prefill', state: 'waiting' });
		expect(isUnsentClick(shown!)).toBe(true);
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toEqual({ url: '/api/evolution', body: { projectId: 'p', operations: [{ op: 'send_click', requestId: 'r1', clickKind: 'prefill', fieldPath: 'need.problem', step: 'need', section: ['need.problem', 'need.goal'] }] } });
		saved = { ...saved, clicks: [click()] };
		expect(await sending).toBe(true);
		expect(pushToast).toHaveBeenCalledWith({ level: 'success', message: 'Sent to your AI' });
	});

	it('takes a refused click off its field and says why', async () => {
		server().answers.push(async () => Response.json({ ok: false, results: [{ ok: false, summary: 'The request is frozen.' }] }, { status: 422 }));
		const live = session();
		expect(await live.send('draw', { fieldPath: 'step.functional_spec.diagram', leafId: null, step: 'specification' })).toBe(false);
		expect(live.clickOn({ fieldPath: 'step.functional_spec.diagram', leafId: null })).toBeNull();
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'Your drawing click was not saved: The request is frozen.' });
	});

	it('sends a question of a thread with its message and the one it answers', async () => {
		const { sent } = server();
		const ask = session().asker(() => problem);
		expect(ask.refusal).toBeNull();
		const running = ask.run('Why a week?', 'm1');
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].body.operations).toEqual([{ op: 'send_click', requestId: 'r1', clickKind: 'ask', fieldPath: 'need.problem', body: 'Why a week?', replyTo: 'm1' }]);
		saved = { ...saved, clicks: [click({ kind: 'ask' })] };
		await running;
	});

	it('withdraws a waiting click from the page at once', async () => {
		saved = { ...saved, clicks: [click()] };
		const { sent } = server();
		const live = session();
		const withdrawing = live.withdraw('c1');
		expect(live.clickOn(problem)).toBeNull();
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].body.operations).toEqual([{ op: 'withdraw_click', requestId: 'r1', clickId: 'c1' }]);
		saved = { ...saved, clicks: [] };
		expect(await withdrawing).toBe(true);
	});

	it('tells only the AI work in hand: progress of the click it took, while it thinks or writes', () => {
		const taken = click({ state: 'taken' });
		saved = { ...saved, clicks: [taken] };
		const live = session();
		live.presence = signal('writing', { step: 3, saying: 'Writing the goal' });
		expect(live.progressOf(taken)).toEqual({ writing: true, step: 3, saying: 'Writing the goal' });
		expect(live.progressOf(click())).toBeNull();
		live.presence = signal('listening');
		expect(live.progressOf(taken)).toBeNull();
	});
});

describe('without a session, an AI button copies the prompt that opens one [criterion:ac-leaf-ac-evo-live-no-session]', () => {
	it('says so as the refusal, sends the click, and copies the prompt naming what waits', async () => {
		saved = { session: null, clicks: [], stepPrefill: null };
		// The server writes the click; the page reads it back.
		server().answers.push(async () => {
			saved = { ...saved, clicks: [click()] };
			return Response.json({ ok: true, results: [] });
		});
		const live = session();
		expect(live.refusal('prefill')).toBe(NO_SESSION_SENTENCE);
		expect(await live.send('prefill', problem)).toBe(true);
		expect(copied).toHaveLength(1);
		expect(copied[0]).toContain('Pay once');
		expect(pushToast).toHaveBeenCalledWith({ level: 'info', message: 'Prompt copied: paste it in a new conversation with your AI agent. It opens the session and starts with your prefill.' });
	});

	it('leaves Prefill and Draw to who may edit, and lets anyone ask', async () => {
		editor = false;
		const { sent } = server();
		const live = session();
		expect(live.refusal('draw')).toBe('Only who may edit the request prefills or draws; you may still ask in the thread.');
		expect(live.refusal('ask')).toBeNull();
		expect(await live.send('prefill', problem)).toBe(false);
		expect(sent).toEqual([]);
	});
});

describe('the session ends and a click is cancelled from the page', () => {
	it('reads ended at once, and tells the live route which session', async () => {
		const { sent, answers } = server();
		let reply!: (r: Response) => void;
		answers.push(() => new Promise<Response>((resolve) => (reply = resolve)));
		const live = session();
		const ending = live.end();
		expect(live.status).toBe('ended');
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toEqual({ url: '/api/evolution/live', body: { projectId: 'p', requestId: 'r1', act: 'end', sessionId: 's1' } });
		saved = { ...saved, session: { ...OPEN, open: false, endReason: 'ended_by_person' } };
		reply(Response.json({ ok: true }));
		await ending;
		expect(live.status).toBe('ended');
	});

	it('reads open again when the end was refused, saying why', async () => {
		server().answers.push(async () => Response.json({ results: [{ summary: 'No such session.' }] }, { status: 404 }));
		const live = session();
		await live.end();
		expect(live.status).toBe('open');
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'The end of the session was not saved: No such session.' });
	});

	it('cancels the click in hand: it reads cancelled at once', async () => {
		saved = { ...saved, clicks: [click({ state: 'taken' })] };
		const { sent, answers } = server();
		let reply!: (r: Response) => void;
		answers.push(() => new Promise<Response>((resolve) => (reply = resolve)));
		const live = session();
		const cancelling = live.cancel('c1');
		expect(live.clickOn(problem)?.state).toBe('cancelled');
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].body).toEqual({ projectId: 'p', requestId: 'r1', act: 'cancel' });
		saved = { ...saved, clicks: [click({ state: 'cancelled' })] };
		reply(Response.json({ ok: true, summary: 'Cancelled: the goal is back as it was' }));
		await cancelling;
		expect(pushToast).toHaveBeenCalledWith({ level: 'success', message: 'Cancelled: the goal is back as it was' });
	});
});
