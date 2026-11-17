import { describe, expect, it, vi } from 'vitest';
import { ProjectAiSession } from './project-ai-session.svelte';
import { projectSessionPrompt, sessionPrompt } from '$ui/evolution/session-prompt';
import { aiStanding } from './ai-standing';
import { APPROVALS_AHEAD } from './approvals';
import { llmOnRun } from '$domain/retrospec';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Ask my AI in the navigation is the one place that says whether the reader's AI is connected (criterion 4cb97f74). */

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const sessionWith = (session: ProjectAiSession['reading']) => {
	const live = new ProjectAiSession(() => 'kutt-c76982', () => 'Kutt', () => true);
	live.reading = session;
	return live;
};
const OPEN = { id: 's1', open: true, startedAt: '2026-10-29T10:00:00.000Z', endReason: null };
const NOW = Date.parse('2026-10-29T22:00:00.000Z');

describe('Ask my AI alone says whether my AI is connected [criterion:4cb97f74]', () => {
	it('holds no chip in the top bar, on any page', () => {
		const bar = source('../shell/TopBar.svelte');
		expect(bar).not.toContain('AiSessionChip');
		expect(bar).toContain('class="lk-top bare"');
	});

	it('shows the mark and the word under Ask my AI', () => {
		const tool = source('../spec360/page/AskAiTool.svelte');
		expect(tool).toContain('<span class="ai-st" data-tone={standing.tone}');
	});

	it('reads Not connected when no session was ever opened', () => {
		expect(aiStanding(sessionWith({ session: null, presence: null, clicks: [] }), null)).toEqual({ tone: 'off', word: 'Not connected', doing: null });
		expect(aiStanding(null, null).word).toBe('Not connected');
	});

	it('reads Connecting until a call of the AI waits, then Listening', () => {
		const live = sessionWith({ session: OPEN, presence: null, clicks: [] });
		expect(aiStanding(live, null).word).toBe('Connecting');
		live.presence = { requestId: '', sessionId: 's1', status: 'listening', thinkingAbout: null, saying: null } as unknown as ProjectAiSession['presence'];
		expect(aiStanding(live, null).word).toBe('Listening');
	});

	it('reads Working with what the AI does while it works on a click [criterion:39e1abc1]', () => {
		const live = sessionWith({ session: OPEN, presence: null, clicks: [] });
		live.presence = { requestId: '', sessionId: 's1', status: 'thinking', thinkingAbout: 'your message in Runs', saying: null } as unknown as ProjectAiSession['presence'];
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
