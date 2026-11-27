import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { ProjectAiSession } from './project-ai-session.svelte';
import { projectSessionPrompt, sessionPrompt } from '$ui/evolution/session-prompt';
import { aiStanding, withWaiting } from './ai-standing';
import { APPROVALS_AHEAD } from './approvals';
import { llmOnRun } from '$domain/retrospec';
import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
import type { LiveSessionSignal } from '$lib/shared/live-session';

/** Ask my AI in the navigation is the one place that says whether the reader's AI is connected (criterion 4cb97f74). */

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/kutt-c76982/spec') } }));
vi.mock('./project-ai-session.svelte', async (original) => ({ ...await original<object>(), useProjectAiSession: () => shown.session }));
const shown = vi.hoisted(() => ({ session: null as ProjectAiSession | null }));
const sessionWith = (session: ProjectAiSession['reading']) => {
	const live = new ProjectAiSession(() => 'kutt-c76982', () => 'Kutt', () => true);
	live.reading = session;
	return live;
};
const signal = (status: LiveSessionSignal['status']): LiveSessionSignal => ({ requestId: '', personId: 'ana', sessionId: 's1', status, thinkingAbout: null, saying: null, step: null, endReason: null, at: '2026-10-29T10:00:00.000Z' });
const OPEN = { id: 's1', open: true, startedAt: '2026-10-29T10:00:00.000Z', endReason: null };
const NOW = Date.parse('2026-10-29T22:00:00.000Z');

describe('Ask my AI alone says whether my AI is connected [criterion:4cb97f74]', () => {
	it('shows the word of where my AI stands under Ask my AI, and says it on hover', () => {
		const row = (session: ProjectAiSession) => {
			shown.session = session;
			const html = render(AskAiTool, { props: { anchor: 'product', title: 'Product summary' } }).body.replace(/<!--.*?-->/g, '');
			return html.match(/<button[^>]*data-tip="Ask my AI[\s\S]*?<\/button>/)?.[0] ?? '';
		};
		const off = row(sessionWith({ session: null, presence: null, clicks: [] }));
		expect(off).toContain('data-tip="Ask my AI · Not connected"');
		expect(off).toMatch(/Ask my AI<\/span><\/span><span[^>]*data-tone="off"[^>]*>[\s\S]*Not connected/);
		const live = sessionWith({ session: OPEN, presence: null, clicks: [] });
		live.presence = signal('listening');
		expect(row(live)).toMatch(/data-tone="listening"[^>]*>[\s\S]*Listening/);
	});

	it('reads Not connected when no session was ever opened', () => {
		expect(aiStanding(sessionWith({ session: null, presence: null, clicks: [] }), null)).toEqual({ tone: 'off', word: 'Not connected', doing: null });
		expect(aiStanding(null, null).word).toBe('Not connected');
	});

	it('reads Connecting until a call of the AI waits, then Listening', () => {
		const live = sessionWith({ session: OPEN, presence: null, clicks: [] });
		expect(aiStanding(live, null).word).toBe('Connecting');
		live.presence = signal('listening');
		expect(aiStanding(live, null).word).toBe('Listening');
	});

	it('reads Working with what the AI does while it works on a click [criterion:39e1abc1]', () => {
		const live = sessionWith({ session: OPEN, presence: null, clicks: [] });
		live.presence = { ...signal('thinking'), thinkingAbout: 'your message in Runs' };
		expect(aiStanding(live, null)).toEqual({ tone: 'working', word: 'Working', doing: 'on your message in Runs' });
	});

	it('reads Not connected once the session ended', () => {
		const live = sessionWith({ session: { ...OPEN, open: false, endReason: 'gone' }, presence: null, clicks: [] });
		expect(aiStanding(live, null).tone).toBe('off');
	});
});

describe('a Reverse-Specification under way shows its AI in Ask my AI [criterion:bc0f0767]', () => {
	const none = () => sessionWith({ session: null, presence: null, clicks: [] });

	it('reads Working while the run\'s LLM calls, then Check your AI once it went quiet', () => {
		expect(aiStanding(none(), { seenAt: new Date(NOW - 5_000).toISOString(), now: NOW }).word).toBe('Working');
		expect(aiStanding(none(), { seenAt: new Date(NOW - 70_000).toISOString(), now: NOW })).toEqual({ tone: 'quiet', word: 'Check your AI', doing: null });
	});

	it('lets a session speak for the AI over the run', () => {
		expect(aiStanding(sessionWith({ session: OPEN, presence: null, clicks: [] }), { seenAt: new Date(NOW - 70_000).toISOString(), now: NOW }).tone).toBe('connecting');
	});

	it('turns back to working at the next call', () => {
		expect(llmOnRun(new Date(NOW - 5_000).toISOString(), NOW)).toBe('working');
		expect(llmOnRun(new Date(NOW - 70_000).toISOString(), NOW)).toBe('quiet');
		expect(llmOnRun(new Date(NOW - 200_000).toISOString(), NOW)).toBe('disconnected');
	});

	it('tells the approvals ahead once the prompt is copied', () => {
		expect(APPROVALS_AHEAD).toContain('allow each Lyriks tool');
		expect(APPROVALS_AHEAD).toContain('for the whole task');
	});
});

describe('the prompt opens the session of the whole project [criterion:ac-leaf-ac-ai-session-project]', () => {
	it('asks the AI to open it given the project alone and to wait on every page', () => {
		const prompt = projectSessionPrompt('kutt-c76982', 'Kutt');
		expect(prompt).toContain('A Lyriks session begins on the project "Kutt" (kutt-c76982).');
		expect(prompt).toContain('start_evolution_session given the project alone');
		expect(prompt).toContain('await_evolution_event (the project and the session, no request)');
	});

	it('follows the project on screen: never one project\'s name beside another\'s id', () => {
		// Owner screens 2026-11-02: "Frais+" (siggggnal-e6c70b), the layout kept the first project opened.
		let shown = { id: 'siggggnal-e6c70b', name: 'Signal' };
		const live = new ProjectAiSession(() => shown.id, () => shown.name, () => true);
		expect(live.prompt()).toContain('"Signal" (siggggnal-e6c70b)');
		shown = { id: 'frais-plus-1a2b3c', name: 'Frais+' };
		expect(live.projectId).toBe('frais-plus-1a2b3c');
		expect(live.prompt()).toContain('A Lyriks session begins on the project "Frais+" (frais-plus-1a2b3c).');
	});

	it('drops a reading of the project left while it was on its way', async () => {
		let shown = 'siggggnal-e6c70b';
		const live = new ProjectAiSession(() => shown, () => 'Any', () => true);
		let answer: (value: Response) => void = () => {};
		const fetchMock = vi.fn((_url: string) => new Promise<Response>((resolve) => (answer = resolve)));
		vi.stubGlobal('fetch', fetchMock);
		try {
			const pending = live.refresh();
			expect(String(fetchMock.mock.calls[0]?.[0])).toContain('projectId=siggggnal-e6c70b');
			shown = 'frais-plus-1a2b3c';
			answer(new Response(JSON.stringify({ session: { id: 'old', open: true, startedAt: '2026-11-02T10:00:00.000Z', endReason: null }, presence: null, clicks: [] })));
			await pending;
			expect(live.reading).toBeNull();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('Prepare it with my AI opens the project\'s session on the request [criterion:ac-leaf-ac-evo-live-start]', () => {
	it('names the request to start on, and what already waits', () => {
		const prompt = sessionPrompt('kutt-c76982', '138da972-2e61', 'Fix the problems', 'prefill', 'Kutt');
		expect(prompt).toContain('Start with the Evolution request "Fix the problems" (request 138da972).');
		expect(prompt).toContain('My prefill already waits on the page');
	});
});

describe('what my AI asks or tells me on its own waits for me in Ask my AI [criterion:31488628]', () => {
	const question = { about: 'question' as const, text: 'Which billing flow runs in production?' };
	const waitingOn = (count: number) => ({ count, latest: { conversationId: 'c9', at: '2026-11-25T10:00:00.000Z', ...question } });

	it('reads Needs you with the question, over a session that listens or an AI gone quiet', () => {
		const live = sessionWith({ session: OPEN, presence: null, clicks: [], needsYou: waitingOn(1) });
		live.presence = signal('listening');
		expect(withWaiting(aiStanding(live, null), live.needsYou?.latest ?? null)).toEqual({ tone: 'needs', word: 'Needs you', doing: 'asks you: Which billing flow runs in production?' });
		expect(withWaiting(aiStanding(null, { seenAt: new Date(NOW - 70_000).toISOString(), now: NOW }), question).word).toBe('Needs you');
	});

	it('says why the AI stopped, even once its session is over', () => {
		const ended = sessionWith({ session: { ...OPEN, open: false, endReason: 'gone' }, presence: null, clicks: [] });
		expect(withWaiting(aiStanding(ended, null), { about: 'stopped', text: 'My usage limit is reached.' }).doing).toBe('stopped: My usage limit is reached.');
	});

	it('leaves an AI at work saying what it does: its answer comes', () => {
		const live = sessionWith({ session: OPEN, presence: null, clicks: [] });
		live.presence = { ...signal('thinking'), thinkingAbout: 'your message in Runs' };
		expect(withWaiting(aiStanding(live, null), question).tone).toBe('working');
	});

	it('shows the question in the box of Ask my AI, one press from its conversation', () => {
		shown.session = sessionWith({ session: null, presence: null, clicks: [], needsYou: waitingOn(2) });
		const html = render(AskAiTool, { props: { anchor: 'product', title: 'Product summary' } }).body.replace(/<!--.*?-->/g, '');
		expect(html).toMatch(/data-tone="needs"[^>]*>[\s\S]*Needs you/);
		expect(html).toContain('title="Your AI asks you: Which billing flow runs in production?"');
		expect(shown.session.needsYou?.count).toBe(2);
		expect(sessionWith({ session: null, presence: null, clicks: [], needsYou: { count: 0, latest: null } }).needsYou).toBeNull();
	});
});

describe('Ask my AI says when a click wakes my AI, while it wakes and when it did not wake [criterion:7cfc6440]', () => {
	const none = { session: null, presence: null, clicks: [] };

	it('reads Wakes on click while my waker listens and no AI of mine is in session', () => {
		const live = sessionWith({ ...none, waker: { status: 'listening', wake: 'none' } });
		expect(live.wakes).toBe(true);
		expect(aiStanding(live, null)).toEqual({ tone: 'off', word: 'Wakes on click', doing: null });
		expect(live.refusal).toBe('No session with your AI yet: a click wakes it.');
	});

	it('reads Waking once my waker was handed the wake, and Did not wake with the prompt once it ran out [unspa:1f2ed844:be0ba713:ab61a6fb]', () => {
		const waking = sessionWith({ ...none, waker: { status: 'listening', wake: 'handed' } });
		expect(aiStanding(waking, null)).toEqual({ tone: 'connecting', word: 'Waking', doing: 'Waking your AI' });
		const late = sessionWith({ ...none, waker: { status: 'listening', wake: 'not_woken' } });
		expect(aiStanding(late, null)).toMatchObject({ word: 'Did not wake', doing: 'Your AI did not wake: copy the prompt to open it yourself.' });
	});

	it('reads as before without a waker, or with one gone', () => {
		expect(aiStanding(sessionWith(none), null).word).toBe('Not connected');
		const gone = sessionWith({ ...none, waker: { status: 'gone', wake: 'none' } });
		expect(gone.wakes).toBe(false);
		expect(aiStanding(gone, null).word).toBe('Not connected');
		expect(gone.refusal).toBe('No session with your AI yet: a click copies the prompt that opens one.');
	});

	it('speaks for the AI in session first, whatever the waker says', () => {
		const live = sessionWith({ session: OPEN, presence: signal('listening'), clicks: [], waker: { status: 'listening', wake: 'opened' } });
		expect(live.wakes).toBe(false);
		expect(aiStanding(live, null).word).toBe('Listening');
	});
});
