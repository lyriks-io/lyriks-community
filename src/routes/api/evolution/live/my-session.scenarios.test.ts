import { describe, expect, it, vi } from 'vitest';
import type { LiveSession, ProjectClick, ProjectEvolutionDraft } from '$domain/evolution';

/**
 * The scenarios of "My session with my AI" (surface 1f2ed844 of feat-7, as
 * EVO-015 has them in draft b4374a49), run against the real code: the state a
 * scenario starts from is arranged in the Evolution dossier the real door
 * reads (the person's sessions, one per AI, their clicks, the server's clock,
 * what each AI does now on the bus); the act goes through POST/GET
 * /api/evolution/live or the real session functions; what the scenario
 * asserts is read back from the stored dossier, the answer and the bus. Only
 * the IO edges are faked: the store, the access port, and the
 * Reverse-Specification's standing as its store would read it.
 *
 * The parts the MCP gateway computes (how long a wait is held, the update
 * that says nothing) are proven by the same tokens in Lyriks-back
 * (packages/mcp/src/tests/my-session.scenarios.test.ts); here, the platform's
 * part of those scenarios.
 */

const scene = vi.hoisted(() => ({ finishedAt: null as string | null }));
// The Reverse-Specification's standing is read from its store; a test says when it finished.
vi.mock('$lib/server/retrospec-status.server', async (original) => ({
	...(await original<typeof import('$lib/server/retrospec-status.server')>()),
	readRetrospecStanding: async () => {
		if (!scene.finishedAt) throw new Error('This project holds no Reverse-Specification.');
		return { status: { status: 'done' }, doc: { runs: [{ publishedAt: scene.finishedAt }] }, rebuiltFrom: null };
	}
}));

const { liveDoor, ADA, BOB } = await import('./live-door.fixture');
const { say, presenceOf, PROJECT_SESSION_KEY } = await import('$lib/server/evolution-live.server');
const { awaitProjectEvent, awaitPeerAnswer, askOnProject } = await import('$lib/server/ai-session.server');
const { aiActsOf, aiWorkedAt, noteAiWork } = await import('$lib/server/ai-work.server');
const { readRetrospecStanding } = await import('$lib/server/retrospec-status.server');
const { publishLiveSignal, publishSectionChange } = await import('$lib/server/sync-bus.server');
const { retrospecFinishedAt } = await import('$domain/retrospec');
const {
	answerProjectClick,
	closeField,
	closeProjectTurn,
	createEmptyEvolutionDraft,
	createEvolutionRequest,
	isProjectIdle,
	LIVE_SESSION,
	openProjectSessionOf,
	openProjectSessionsOf,
	openSessionOf,
	questionStanding,
	secondsBetween,
	sendClick,
	sessionName,
	sessionWorkDone,
	startProjectSession,
	takeProjectClick,
	withMirror
} = await import('$domain/evolution');
const { GET: feed } = await import('../../sync/events/+server');
const { requestEvent, servicesWith } = await import('$lib/server/request-event.fixture');

type State = Readonly<Record<string, unknown>>;
type Outcome = { readonly status: 'success' | 'blocked'; readonly final?: State; readonly said?: string };
interface Scenario {
	readonly id: string;
	readonly name: string;
	readonly expected: 'success' | 'blocked';
	/** The asserted paths the platform's code settles; a path the gateway settles is proven in Lyriks-back. */
	readonly then?: readonly { readonly path: string; readonly operator: 'equals' | 'is_true' | 'is_false'; readonly value?: unknown }[];
	/** On a refused scenario, what the code says holds it: the scenario's own rule. */
	readonly holds?: string;
	readonly run: () => Promise<Outcome>;
}

const SURFACE = '1f2ed844';
const T0 = '2026-11-22T15:00:00.000Z';
const at = (seconds: number, from = T0) => new Date(Date.parse(from) + seconds * 1000).toISOString();
const status = (ok: boolean): 'success' | 'blocked' => (ok ? 'success' : 'blocked');
const said = (body: unknown): string => JSON.stringify(body ?? '');
const outside = () => ({ ok: false as const, reason: 'not_found' as const });
const tick = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

let serial = 0;
/** A project of its own per scenario: what each AI does now lives on the bus and in each node's memory, which every test shares. */
const projectOf = (name: string) => `p7-${name}-${++serial}`;

const session = (id: string, startedAt: string, extra: Partial<LiveSession> = {}): LiveSession => ({ id, personId: ADA, startedAt, ...extra });
const dossier = (projectId: string, sessions: readonly LiveSession[], over: Partial<ProjectEvolutionDraft> = {}): ProjectEvolutionDraft => ({
	...createEmptyEvolutionDraft(projectId),
	sessions: [...sessions],
	...over
});
const reread = (id: string, when: string, state: ProjectClick['state'] = 'waiting', extra: Partial<ProjectClick> = {}): ProjectClick => ({
	id,
	personId: ADA,
	kind: 'reread',
	page: 'spec',
	anchor: 'feature:f1',
	title: 'Shorten a link',
	featureId: 'f1',
	at: when,
	state,
	...extra
});
const pendingOf = (d: ProjectEvolutionDraft) => (d.clicks ?? []).filter((c) => c.personId === ADA && (c.state === 'waiting' || c.state === 'taken')).length;
const presence = (projectId: string, sessionId: string) => presenceOf(projectId, PROJECT_SESSION_KEY, ADA, sessionId);
const ended = (d: ProjectEvolutionDraft, sessionId: string) => (d.sessions ?? []).find((s) => s.id === sessionId);
const never = { aborted: () => false, onAbort: () => {} };

function prove(actionId: string, title: string, scenarios: readonly Scenario[]): void {
	describe(`${title} (action ${actionId} of feat-7, EVO-015)`, () => {
		for (const scenario of scenarios) {
			it(`${scenario.name} [unspa:${SURFACE}:${actionId}:${scenario.id}]`, async () => {
				const outcome = await scenario.run();
				expect(outcome.status).toBe(scenario.expected);
				for (const a of scenario.then ?? []) {
					const v = outcome.final?.[a.path];
					if (a.operator === 'equals') expect(v, a.path).toEqual(a.value);
					else expect(v, a.path).toBe(a.operator === 'is_true');
				}
				if (scenario.holds) expect(outcome.said ?? '').toContain(scenario.holds);
			}, 15_000);
		}
	});
}

/** Run a scenario with the Reverse-Specification finished at a moment, and never after it. */
async function withFinished<T>(finishedAt: string | null, run: () => Promise<T>): Promise<T> {
	scene.finishedAt = finishedAt;
	try {
		return await run();
	} finally {
		scene.finishedAt = null;
	}
}

// ---------------------------------------------------------------------------
// Open the session (3a4b3288)

prove('3a4b3288', 'Open the session', [
	{
		id: '6601b871',
		name: 'The AI opens the session',
		expected: 'success',
		then: [
			{ path: 'aiSession.status', operator: 'equals', value: 'open' },
			{ path: 'aiSession.activity', operator: 'equals', value: 'listening' }
		],
		run: async () => {
			const p = projectOf('open');
			const door = liveDoor(p);
			const opened = await door.call({ act: 'start', client: 'Claude Code' }, 'ai');
			const id = opened.body?.session?.id as string;
			return {
				status: status(opened.status === 200),
				final: { 'aiSession.status': openProjectSessionOf(door.stored(), ADA, id) ? 'open' : 'none', 'aiSession.activity': presence(p, id)?.status }
			};
		}
	},
	{
		id: '58d6ef87',
		name: 'A session opens again after its end',
		expected: 'success',
		then: [
			{ path: 'aiSession.status', operator: 'equals', value: 'open' },
			{ path: 'aiSession.endReason', operator: 'equals', value: 'none' }
		],
		run: async () => {
			const p = projectOf('again');
			const door = liveDoor(p, { seed: dossier(p, [session('old', at(-3600), { endedAt: at(-60), endReason: 'idle' })]) });
			const opened = await door.call({ act: 'start' }, 'ai');
			const fresh = ended(door.stored(), opened.body.session.id)!;
			return { status: status(opened.status === 200), final: { 'aiSession.status': fresh.endedAt ? 'ended' : 'open', 'aiSession.endReason': fresh.endReason ?? 'none' } };
		}
	},
	{
		id: 'ad7e9593',
		name: 'A person cannot open a session',
		expected: 'blocked',
		holds: 'Only the AI client of the session does this',
		run: async () => {
			const door = liveDoor(projectOf('person-open'));
			const refused = await door.call({ act: 'start' });
			return { status: status(refused.status === 200 && door.revision() > 0), said: said(refused.body) };
		}
	},
	{
		id: 'bf810490',
		name: 'An AI outside the workspace does not see the project',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const door = liveDoor(projectOf('outside-open'), { decide: outside });
			const refused = await door.call({ act: 'start' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '9caeb14b',
		name: 'A second AI opens its session beside the first',
		expected: 'success',
		then: [
			{ path: 'aiSession.status', operator: 'equals', value: 'open' },
			{ path: 'aiSessions.othersOpen', operator: 'equals', value: 1 },
			{ path: 'aiSession.client', operator: 'equals', value: 'Codex' }
		],
		run: async () => {
			const p = projectOf('second');
			const door = liveDoor(p, { seed: dossier(p, [session('claude', at(-600), { client: 'Claude Code' })]) });
			const opened = await door.call({ act: 'start', client: 'Codex' }, 'ai');
			const id = opened.body.session.id as string;
			const mine = openProjectSessionOf(door.stored(), ADA, id);
			return {
				status: status(opened.status === 200),
				final: {
					'aiSession.status': mine ? 'open' : 'none',
					'aiSessions.othersOpen': openProjectSessionsOf(door.stored(), ADA).filter((s) => s.id !== id).length,
					'aiSession.client': mine?.client ?? ''
				}
			};
		}
	}
]);

// ---------------------------------------------------------------------------
// Wait for the person's next click (f2f8e2b3)

/** Start a wait through the door and read the bus while it is held. */
async function heldWait(door: ReturnType<typeof liveDoor>, projectId: string, sessionId: string, waitSeconds = 1) {
	const answer = door.call({ act: 'await', sessionId, waitSeconds }, 'ai');
	await tick();
	const during = presence(projectId, sessionId);
	return { during, answer: await answer };
}

prove('f2f8e2b3', "Wait for the person's next click", [
	{
		id: '2270224b',
		name: 'The AI waits on the pages',
		expected: 'success',
		// wait.holdSeconds (1500 with a progress token) is the gateway's: proven in Lyriks-back under the same token.
		then: [
			{ path: 'aiSession.callHeld', operator: 'is_true' },
			{ path: 'aiSession.activity', operator: 'equals', value: 'listening' }
		],
		run: async () => {
			const p = projectOf('wait');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const { during, answer } = await heldWait(door, p, 's1');
			return { status: status(answer.status === 200 && answer.body.kind === 'nothing'), final: { 'aiSession.callHeld': during?.callHeld === true, 'aiSession.activity': during?.status } };
		}
	},
	{
		id: 'de107038',
		name: 'A client without progress waits 50 seconds',
		expected: 'success',
		// The 50 s is the gateway's (Lyriks-back, same token); the platform holds each wait as long as the gateway asks.
		run: async () => {
			const p = projectOf('short');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const answer = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			return { status: status(answer.status === 200 && answer.body.kind === 'nothing' && answer.body.waitedSeconds === 1) };
		}
	},
	{
		id: '168bcf25',
		name: 'A short wait keeps the chat free',
		expected: 'success',
		// The 45 s the AI asked are the gateway's to cut (Lyriks-back, same token); the platform waits as asked, within platformWaitSeconds.
		run: async () => {
			const p = projectOf('asked');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const answer = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			return { status: status(answer.status === 200 && answer.body.kind === 'nothing' && answer.body.waitedSeconds === 1) };
		}
	},
	{
		id: '20bae6ae',
		name: 'A wait after the end says the session ended',
		expected: 'success',
		then: [
			{ path: 'wait.answer', operator: 'equals', value: 'ended' },
			{ path: 'aiSession.callHeld', operator: 'is_false' }
		],
		run: async () => {
			const p = projectOf('after-end');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', at(-3600), { endedAt: at(-60), endReason: 'idle' })]) });
			const answer = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			return {
				status: status(answer.status === 200 && answer.body.reason === 'idle'),
				final: { 'wait.answer': answer.body.kind, 'aiSession.callHeld': presence(p, 's1')?.callHeld === true }
			};
		}
	},
	{
		id: '7cfd319f',
		name: 'No wait without a session',
		expected: 'blocked',
		holds: 'No session is open on this project: open one with start_evolution_session given the project alone.',
		run: async () => {
			const door = liveDoor(projectOf('no-session'));
			const refused = await door.call({ act: 'await', waitSeconds: 1 }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '9033196b',
		name: "A page cannot wait in the AI's place",
		expected: 'blocked',
		holds: 'Only the AI client of the session does this',
		run: async () => {
			const p = projectOf('page-wait');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const refused = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 });
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: 'cc1c4890',
		name: 'An AI outside the workspace waits on nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const p = projectOf('outside-wait');
			const door = liveDoor(p, { decide: outside, seed: dossier(p, [session('s1', T0)]) });
			const refused = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// The wait runs out (dc70750a)

prove('dc70750a', 'The wait runs out', [
	{
		id: '63aacc0f',
		name: 'Nothing came: the AI calls again',
		expected: 'success',
		then: [
			{ path: 'wait.answer', operator: 'equals', value: 'nothing' },
			{ path: 'aiSession.callHeld', operator: 'is_false' }
		],
		run: async () => {
			const p = projectOf('runs-out');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const { during, answer } = await heldWait(door, p, 's1');
			expect(during?.callHeld).toBe(true);
			return { status: status(answer.status === 200), final: { 'wait.answer': answer.body.kind, 'aiSession.callHeld': presence(p, 's1')?.callHeld === true } };
		}
	},
	{
		id: '8e351307',
		name: 'No call, nothing runs out',
		expected: 'blocked',
		run: async () => {
			// Only a held wait answers nothing: with no call of the AI, the bus says no call is held and nothing answers.
			const p = projectOf('no-call');
			const door = liveDoor(p);
			const opened = await door.call({ act: 'start' }, 'ai');
			const signal = presence(p, opened.body.session.id);
			return { status: status(signal?.callHeld === true) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Say what I am doing (083b734b)

prove('083b734b', 'Say what I am doing', [
	{
		id: '4ae09100',
		name: 'The AI says its first step',
		expected: 'success',
		then: [
			{ path: 'aiSession.step', operator: 'equals', value: 1 },
			{ path: 'aiSession.activity', operator: 'equals', value: 'writing' }
		],
		run: async () => {
			const p = projectOf('say');
			const door = liveDoor(p);
			const id = (await door.call({ act: 'start' }, 'ai')).body.session.id as string;
			expect(presence(p, id)?.status).toBe('listening');
			const told = await door.call({ act: 'say', sessionId: id, text: 'Reading the Need to prefill 1.2' }, 'ai');
			return { status: status(told.status === 200), final: { 'aiSession.step': presence(p, id)?.step, 'aiSession.activity': presence(p, id)?.status } };
		}
	},
	{
		id: '3d4381d6',
		name: 'A thinking AI says its next step',
		expected: 'success',
		then: [
			{ path: 'aiSession.step', operator: 'equals', value: 3 },
			{ path: 'aiSession.activity', operator: 'equals', value: 'thinking' }
		],
		run: async () => {
			const p = projectOf('say-thinking');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			say(door.services, { projectId: p, requestId: PROJECT_SESSION_KEY, personId: ADA, sessionId: 's1' }, 'thinking', { thinkingAbout: 'your question', step: 2 });
			const told = await door.call({ act: 'say', sessionId: 's1', text: 'Comparing the texts with the diagram' }, 'ai');
			return { status: status(told.status === 200), final: { 'aiSession.step': presence(p, 's1')?.step, 'aiSession.activity': presence(p, 's1')?.status } };
		}
	},
	{
		id: '94d7957b',
		name: 'An empty sentence is refused',
		expected: 'blocked',
		holds: 'text is required: one sentence on what you are doing.',
		run: async () => {
			const p = projectOf('say-empty');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const refused = await door.call({ act: 'say', sessionId: 's1', text: '' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '6e087811',
		name: 'No session, nothing said',
		expected: 'blocked',
		holds: 'No session is open on this project',
		run: async () => {
			const p = projectOf('say-ended');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', at(-3600), { endedAt: at(-60), endReason: 'gone' })]) });
			const refused = await door.call({ act: 'say', sessionId: 's1', text: 'Still here' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '9cb4c49c',
		name: 'A page cannot speak for the AI',
		expected: 'blocked',
		holds: 'Only the AI client of the session does this',
		run: async () => {
			const p = projectOf('say-page');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const refused = await door.call({ act: 'say', sessionId: 's1', text: 'Hello' });
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '06240547',
		name: 'An AI outside the workspace says nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const p = projectOf('say-outside');
			const door = liveDoor(p, { decide: outside, seed: dossier(p, [session('s1', T0)]) });
			const refused = await door.call({ act: 'say', sessionId: 's1', text: 'Hello' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// End the session (9acf4b58)

prove('9acf4b58', 'End the session', [
	{
		id: '376dc70f',
		name: 'The person ends the session from the chip',
		expected: 'success',
		then: [
			{ path: 'aiSession.status', operator: 'equals', value: 'ended' },
			{ path: 'aiSession.endReason', operator: 'equals', value: 'ended_by_person' },
			{ path: 'wait.answer', operator: 'equals', value: 'ended' },
			{ path: 'aiSession.callHeld', operator: 'is_false' }
		],
		run: async () => {
			const p = projectOf('end');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const waiting = door.call({ act: 'await', sessionId: 's1', waitSeconds: 5 }, 'ai');
			await tick();
			const done = await door.call({ act: 'end', sessionId: 's1' });
			// The store tells every node the section changed, which wakes the held wait (the in-memory store of this test says nothing).
			publishSectionChange({ projectId: p, section: 'evolution', origin: null });
			const answer = await waiting;
			const s = ended(door.stored(), 's1');
			return {
				status: status(done.status === 200),
				final: {
					'aiSession.status': s?.endedAt ? 'ended' : 'open',
					'aiSession.endReason': s?.endReason,
					'wait.answer': answer.body.kind,
					'aiSession.callHeld': presence(p, 's1')?.callHeld === true
				}
			};
		}
	},
	{
		id: '95f51458',
		name: "The AI ends the session on the person's word",
		expected: 'success',
		then: [{ path: 'aiSession.endReason', operator: 'equals', value: 'ended_by_person' }],
		run: async () => {
			const p = projectOf('end-ai');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			const done = await door.call({ act: 'end', sessionId: 's1' }, 'ai');
			return { status: status(done.status === 200), final: { 'aiSession.endReason': ended(door.stored(), 's1')?.endReason } };
		}
	},
	{
		id: 'c2274fdc',
		name: 'There is no session to end',
		expected: 'blocked',
		holds: 'There is no session to end.',
		run: async () => {
			const p = projectOf('end-none');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', at(-3600), { endedAt: at(-60), endReason: 'idle' })]) });
			const refused = await door.call({ act: 'end', sessionId: 's1' });
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: 'd43f7bd6',
		name: 'Someone outside the workspace ends nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const p = projectOf('end-outside');
			const door = liveDoor(p, { decide: outside, seed: dossier(p, [session('s1', T0)]) });
			const refused = await door.call({ act: 'end', sessionId: 's1' });
			return { status: status(refused.status === 200 || !openProjectSessionOf(door.stored(), ADA, 's1')), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Read my session (3bf65f80)

prove('3bf65f80', 'Read my session', [
	{
		id: 'c2b8d93d',
		name: 'The chip reads the session',
		expected: 'success',
		run: async () => {
			const p = projectOf('read');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0, { client: 'Claude Code' }), session('s2', at(60), { client: 'Codex' })]) });
			const reading = await door.read(ADA);
			expect(reading.body.sessions.map((s: { name: string }) => s.name)).toEqual(['Codex', 'Claude Code']);
			return { status: status(reading.status === 200) };
		}
	},
	{
		id: '79a5df0d',
		name: 'Someone outside the workspace reads nothing',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const door = liveDoor(projectOf('read-outside'), { decide: outside });
			const refused = await door.read(ADA);
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// End an idle session (511390a9)

prove('511390a9', 'End an idle session', [
	{
		id: '211d566c',
		name: 'Half an hour with no act ends the session',
		expected: 'success',
		then: [
			{ path: 'aiSession.endReason', operator: 'equals', value: 'idle' },
			{ path: 'wait.answer', operator: 'equals', value: 'ended' }
		],
		run: async () => {
			const p = projectOf('idle');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			door.setNow(at(LIVE_SESSION.idleEndSeconds));
			const answer = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			return { status: status(answer.body.reason === 'idle'), final: { 'aiSession.endReason': ended(door.stored(), 's1')?.endReason, 'wait.answer': answer.body.kind } };
		}
	},
	{
		id: '0f53b6d0',
		name: 'A person still at work keeps the session',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('not-idle');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			door.setNow(at(900));
			await door.read(ADA);
			return { status: status(ended(door.stored(), 's1')?.endReason === 'idle') };
		}
	},
	{
		id: '57e3038e',
		name: 'No session, nothing goes idle',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('idle-none');
			const door = liveDoor(p);
			door.setNow(at(4000));
			await door.read(ADA);
			return { status: status((door.stored().sessions ?? []).some((s) => s.endReason === 'idle')) };
		}
	},
	{
		id: '34f5b382',
		name: 'An opened session left alone ends idle',
		expected: 'success',
		then: [{ path: 'aiSession.endReason', operator: 'equals', value: 'idle' }],
		run: async () => {
			const p = projectOf('left-alone');
			const door = liveDoor(p, { now: T0 });
			const id = (await door.call({ act: 'start' }, 'ai')).body.session.id as string;
			door.setNow(at(1800));
			await door.read(ADA);
			const s = ended(door.stored(), id);
			return { status: status(s?.endReason === 'idle'), final: { 'aiSession.endReason': s?.endReason } };
		}
	}
]);

// ---------------------------------------------------------------------------
// Mark a silent AI gone (f7635fb5)

/**
 * A moment well past this server's own start: silence is counted from the
 * latest of the opening, the server's start and the AI's last call, so a
 * silent hour is only ever read once the server ran that long.
 */
const LATE = new Date(Date.now() + 4 * 3600_000).toISOString();
/** A session silent for that long, whose person acted a minute ago (so it is not idle). */
const silentFor = (projectId: string, seconds: number, extra: Partial<LiveSession> = {}) =>
	dossier(projectId, [session('s1', at(-seconds, LATE), extra)], { clicks: [reread('act', at(-60, LATE), 'withdrawn')] });

prove('f7635fb5', 'Mark a silent AI gone', [
	{
		id: 'eeda6d18',
		name: 'An hour of silence marks the AI gone',
		expected: 'success',
		then: [{ path: 'aiSession.endReason', operator: 'equals', value: 'gone' }],
		run: async () => {
			const p = projectOf('gone');
			const door = liveDoor(p, { now: LATE, seed: silentFor(p, LIVE_SESSION.disconnectAfterSeconds) });
			await door.read(ADA);
			const s = ended(door.stored(), 's1');
			return { status: status(s?.endReason === 'gone'), final: { 'aiSession.endReason': s?.endReason } };
		}
	},
	{
		id: '56520a80',
		name: 'An AI whose call waits is not gone',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('waits');
			const door = liveDoor(p, { now: LATE, seed: silentFor(p, 5000) });
			const waiting = door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			await tick();
			await door.read(ADA);
			const during = ended(door.stored(), 's1');
			await waiting;
			return { status: status(during?.endReason === 'gone') };
		}
	},
	{
		id: 'ab233d36',
		name: 'An AI thinking for twenty minutes is not gone',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('thinking');
			const door = liveDoor(p, { now: LATE, seed: silentFor(p, 1200) });
			await door.read(ADA);
			return { status: status(ended(door.stored(), 's1')?.endReason === 'gone') };
		}
	},
	{
		id: 'd04c2674',
		name: 'No session, no AI to mark gone',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('gone-ended');
			const door = liveDoor(p, { now: LATE, seed: silentFor(p, 4000, { endedAt: at(-120, LATE), endReason: 'ended_by_person' }) });
			await door.read(ADA);
			return { status: status(ended(door.stored(), 's1')?.endReason === 'gone') };
		}
	}
]);

// ---------------------------------------------------------------------------
// The waiting call hangs up (73e982f0)

prove('73e982f0', 'The waiting call hangs up', [
	{
		id: 'e77114a9',
		name: 'A dropped call ends the session at once',
		expected: 'success',
		then: [
			{ path: 'aiSession.endReason', operator: 'equals', value: 'gone' },
			{ path: 'aiSession.callHeld', operator: 'is_false' }
		],
		run: async () => {
			const p = projectOf('drop');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			let hangUp: () => void = () => {};
			let hungUp = false;
			const waiting = awaitProjectEvent(door.services, { projectId: p, personId: ADA, sessionId: 's1', waitSeconds: 30 }, { aborted: () => hungUp, onAbort: (listener) => (hangUp = listener) });
			await tick(40);
			hungUp = true;
			hangUp();
			const answer = await waiting;
			return {
				status: status(answer.kind === 'ended' && answer.reason === 'gone'),
				final: { 'aiSession.endReason': ended(door.stored(), 's1')?.endReason, 'aiSession.callHeld': presence(p, 's1')?.callHeld === true }
			};
		}
	},
	{
		id: 'f388f2af',
		name: 'No call, nothing drops',
		expected: 'blocked',
		run: async () => {
			// No wait is held: nothing listens for a hang-up, and the session stays as it is.
			const p = projectOf('no-drop');
			const door = liveDoor(p, { seed: dossier(p, [session('s1', T0)]) });
			await door.read(ADA);
			return { status: status(ended(door.stored(), 's1')?.endReason === 'gone') };
		}
	}
]);

// ---------------------------------------------------------------------------
// End the session once the work is done (2ae9feb6)

/** A session opened ten minutes ago; the Reverse-Specification finishing a minute ago finished while it was open. */
const OPENED = at(-600);
const finishedRun = (projectId: string, over: Partial<ProjectEvolutionDraft> = {}) => dossier(projectId, [session('s1', OPENED)], over);
const awaitFinished = async (door: ReturnType<typeof liveDoor>) => (await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai')).body;

prove('2ae9feb6', 'End the session once the work is done', [
	{
		id: 'a7a8cbbf',
		name: 'The work done, the AI is told to stop',
		expected: 'success',
		then: [
			{ path: 'aiSession.endReason', operator: 'equals', value: 'finished' },
			{ path: 'wait.answer', operator: 'equals', value: 'ended' }
		],
		run: () =>
			withFinished(at(-60), async () => {
				const p = projectOf('finished');
				const door = liveDoor(p, { now: T0, seed: finishedRun(p) });
				const answer = await awaitFinished(door);
				return { status: status(answer.reason === 'finished'), final: { 'aiSession.endReason': ended(door.stored(), 's1')?.endReason, 'wait.answer': answer.kind } };
			})
	},
	{
		id: 'c281014f',
		name: 'A waiting click keeps the session',
		expected: 'blocked',
		run: () =>
			withFinished(at(-60), async () => {
				const p = projectOf('finished-click');
				const door = liveDoor(p, { now: T0, seed: finishedRun(p, { clicks: [reread('c1', at(-30))] }) });
				const answer = await awaitFinished(door);
				return { status: status(answer.kind === 'ended') };
			})
	},
	{
		id: 'c01c3480',
		name: 'A request on tour keeps the session',
		expected: 'blocked',
		run: () =>
			withFinished(at(-60), async () => {
				const p = projectOf('finished-tour');
				const request = withMirror(createEvolutionRequest({ id: 'r1', title: 'Order the day before', status: 'open' }), ADA, session('s1', OPENED), at(-500));
				const door = liveDoor(p, { now: T0, seed: finishedRun(p, { requests: [request] }) });
				const answer = await awaitFinished(door);
				return { status: status(answer.kind === 'ended') };
			})
	},
	{
		id: 'e363c965',
		name: 'A Reverse-Specification still running keeps the session',
		expected: 'blocked',
		run: () =>
			withFinished(null, async () => {
				const p = projectOf('running');
				const door = liveDoor(p, { now: T0, seed: finishedRun(p, { clicks: [reread('c1', at(-400), 'answered', { sessionId: 's1', answeredAt: at(-300), answer: 'Done' })] }) });
				const answer = await awaitFinished(door);
				return { status: status(answer.kind === 'ended') };
			})
	},
	{
		id: 'de78cd66',
		name: 'A session opened after the work keeps going',
		expected: 'blocked',
		run: () =>
			withFinished(at(-900), async () => {
				const p = projectOf('after-work');
				const door = liveDoor(p, { now: T0, seed: finishedRun(p) });
				const answer = await awaitFinished(door);
				return { status: status(answer.kind === 'ended') };
			})
	},
	{
		id: '5b3023cc',
		name: 'Open, finish the Reverse-Specification, wait, stop',
		expected: 'success',
		then: [{ path: 'aiSession.endReason', operator: 'equals', value: 'finished' }],
		run: async () => {
			const p = projectOf('whole-path');
			const door = liveDoor(p, { now: T0 });
			const id = (await door.call({ act: 'start' }, 'ai')).body.session.id as string;
			door.setNow(at(20));
			return withFinished(at(10), async () => {
				const answer = (await door.call({ act: 'await', sessionId: id, waitSeconds: 1 }, 'ai')).body;
				return { status: status(answer.reason === 'finished'), final: { 'aiSession.endReason': ended(door.stored(), id)?.endReason } };
			});
		}
	},
	{
		id: 'b52373ad',
		name: 'No session, nothing finishes',
		expected: 'blocked',
		run: () =>
			withFinished(at(-60), async () => {
				const door = liveDoor(projectOf('finished-none'), { now: T0 });
				const refused = await door.call({ act: 'await', waitSeconds: 1 }, 'ai');
				return { status: status(refused.status === 200 && refused.body.reason === 'finished') };
			})
	},
	{
		id: 'bcabdb82',
		name: 'The AI learns its work is done only when it waits',
		expected: 'blocked',
		run: () =>
			withFinished(at(-60), async () => {
				const p = projectOf('not-waiting');
				const door = liveDoor(p, { now: T0, seed: finishedRun(p) });
				await door.read(ADA);
				return { status: status(ended(door.stored(), 's1')?.endReason === 'finished') };
			})
	}
]);

// ---------------------------------------------------------------------------
// Time passes (cca6d767)

prove('cca6d767', 'Time passes', [
	{
		id: '96d825c6',
		name: 'Half an hour passes',
		expected: 'success',
		then: [
			{ path: 'aiSession.idleSeconds', operator: 'equals', value: 1800 },
			{ path: 'aiSession.silentSeconds', operator: 'equals', value: 1800 }
		],
		run: async () => {
			// The session's clocks are the server's: moving it moves idleness and silence, measured from what the code stored and heard.
			const p = projectOf('clock');
			const door = liveDoor(p, { now: T0 });
			const id = (await door.call({ act: 'start' }, 'ai')).body.session.id as string;
			const heard = presence(p, id)!.at;
			const now = at(1800);
			door.setNow(now);
			const opened = openProjectSessionOf(door.stored(), ADA, id)!;
			expect(isProjectIdle(door.stored(), ADA, at(1799), [], id)).toBe(false);
			expect(isProjectIdle(door.stored(), ADA, now, [], id)).toBe(true);
			return { status: 'success', final: { 'aiSession.idleSeconds': secondsBetween(opened.startedAt, door.services.clock.nowIso()), 'aiSession.silentSeconds': secondsBetween(heard, now) } };
		}
	}
]);

// ---------------------------------------------------------------------------
// My AI acts on the project (9dd14438)

prove('9dd14438', 'My AI acts on the project', [
	{
		id: '8d3ba3ab',
		name: 'An AI at work keeps its session',
		expected: 'success',
		then: [
			{ path: 'aiSession.idleSeconds', operator: 'equals', value: 0 },
			{ path: 'aiSession.silentSeconds', operator: 'equals', value: 0 }
		],
		run: async () => {
			// Every call of the AI on the project but a wait is noted (the request hook does it for each one): idleness and silence count from it.
			const p = projectOf('acts');
			const door = liveDoor(p, { now: at(1700), seed: dossier(p, [session('s1', T0)]) });
			const actAt = door.services.clock.nowIso();
			noteAiWork(p, ADA, actAt);
			const worked = aiWorkedAt(p, ADA)!;
			// Without the act the session would read idle half an hour after it opened; with it, not before half an hour after the act.
			expect(isProjectIdle(door.stored(), ADA, at(1800), [], 's1')).toBe(true);
			expect(isProjectIdle(door.stored(), ADA, at(1800), aiActsOf(p, ADA), 's1')).toBe(false);
			return { status: 'success', final: { 'aiSession.idleSeconds': secondsBetween(worked, actAt), 'aiSession.silentSeconds': secondsBetween(worked, actAt) } };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record a click of the person (2916cd11)

prove('2916cd11', 'Record a click of the person', [
	{
		id: 'c95cd373',
		name: 'A click waits and counts as an act',
		expected: 'success',
		then: [
			{ path: 'aiClicks.pending', operator: 'equals', value: 1 },
			{ path: 'aiSession.idleSeconds', operator: 'equals', value: 0 }
		],
		run: async () => {
			const p = projectOf('click');
			const door = liveDoor(p, { now: T0, seed: dossier(p, [session('s1', at(-1500))]) });
			const sent = await door.call({ act: 'click', kind: 'reread', page: 'spec', anchor: 'feature:f1', title: 'Shorten a link', featureId: 'f1' });
			const click = (door.stored().clicks ?? [])[0];
			// The click is the person's act: half an hour from the opening reads idle no more.
			expect(isProjectIdle(door.stored(), ADA, at(400), [], 's1')).toBe(false);
			return { status: status(sent.status === 200), final: { 'aiClicks.pending': pendingOf(door.stored()), 'aiSession.idleSeconds': secondsBetween(click.at, T0) } };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record a click taken back (aa18e369)

prove('aa18e369', 'Record a click taken back', [
	{
		id: '86f02acc',
		name: 'A click taken back no longer waits',
		expected: 'success',
		then: [{ path: 'aiClicks.pending', operator: 'equals', value: 0 }],
		run: async () => {
			const p = projectOf('withdraw');
			const door = liveDoor(p, { seed: dossier(p, [], { clicks: [reread('c1', at(-30))] }) });
			const withdrawn = await door.call({ act: 'withdraw', clickId: 'c1' });
			return { status: status(withdrawn.status === 200), final: { 'aiClicks.pending': pendingOf(door.stored()) } };
		}
	},
	{
		id: 'd0500746',
		name: 'Nothing to take back',
		expected: 'blocked',
		holds: 'Nothing waits for your AI.',
		run: async () => {
			const door = liveDoor(projectOf('withdraw-none'));
			const refused = await door.call({ act: 'withdraw', clickId: 'c1' });
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record a click answered (1af1d4a8)

/** Whether the session worked here, as the end of its work reads it: a Reverse-Specification finished before it opened counts only what it answered. */
const workedHere = (d: ProjectEvolutionDraft, sessionId: string) => {
	const opened = (d.sessions ?? []).find((s) => s.id === sessionId);
	return !!opened && sessionWorkDone(d, ADA, sessionId, at(-1, opened.startedAt), false);
};
const takenBy = (projectId: string, sessionId: string) => {
	const taken = takeProjectClick(dossier(projectId, [session(sessionId, at(-600))], { clicks: [reread('c1', at(-60))] }), 'c1', at(-50), sessionId);
	if (!taken) throw new Error('nothing to take');
	return taken.draft;
};

prove('1af1d4a8', 'Record a click answered', [
	{
		id: '95b311bd',
		name: 'An answer counts as work done here',
		expected: 'success',
		then: [
			{ path: 'aiClicks.pending', operator: 'equals', value: 0 },
			{ path: 'aiSession.workedHere', operator: 'is_true' }
		],
		run: async () => {
			// The answer_click operation of apply_evolution_batch writes it through this function.
			const answered = answerProjectClick(takenBy(projectOf('answered'), 's1'), ADA, 'c1', 'Nothing needed to change.', T0);
			if (!answered.ok) return { status: 'blocked', said: answered.reason };
			return { status: 'success', final: { 'aiClicks.pending': pendingOf(answered.draft), 'aiSession.workedHere': workedHere(answered.draft, 's1') } };
		}
	},
	{
		id: '22503bdc',
		name: 'No click held, nothing answered',
		expected: 'blocked',
		holds: 'No click of yours is in hand',
		run: async () => {
			const refused = answerProjectClick(dossier(projectOf('answered-none'), [session('s1', at(-600))]), ADA, 'c1', 'Done.', T0);
			return { status: status(refused.ok), said: refused.ok ? '' : refused.reason };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record a click let go (c5ef95fe)

prove('c5ef95fe', 'Record a click let go', [
	{
		id: 'bb73e535',
		name: 'A click let go reads answered',
		expected: 'success',
		then: [
			{ path: 'aiClicks.pending', operator: 'equals', value: 0 },
			{ path: 'aiSession.workedHere', operator: 'is_true' }
		],
		run: async () => {
			const p = projectOf('let-go');
			const door = liveDoor(p, { now: T0, seed: takenBy(p, 's1') });
			const answer = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			const click = (door.stored().clicks ?? [])[0];
			expect(click).toMatchObject({ state: 'answered', answeredNothing: true });
			return { status: status(answer.status === 200), final: { 'aiClicks.pending': pendingOf(door.stored()), 'aiSession.workedHere': workedHere(door.stored(), 's1') } };
		}
	},
	{
		id: 'd8727f3b',
		name: 'No click held, nothing let go',
		expected: 'blocked',
		run: async () => {
			const before = dossier(projectOf('let-go-none'), [session('s1', at(-600))]);
			return { status: status(closeProjectTurn(before, ADA, T0, 's1') !== before) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record that the session reached a request (bc8333a6)

/** An open request where the person handed a step of the close to their AI: a click that names no field of the dossier. */
const requestWithClick = () => {
	const sent = sendClick(
		createEvolutionRequest({ id: 'r1', title: 'Order the day before', status: 'open' }),
		ADA,
		{ kind: 'close', fieldPath: closeField('merge'), leafId: null, close: { step: 'merge', brief: 'git merge feat/order-day-before' } },
		true,
		'rc1',
		at(-30)
	);
	if (!sent.ok) throw new Error(sent.reason);
	return sent.request;
};

prove('bc8333a6', 'Record that the session reached a request', [
	{
		id: '25ab29e2',
		name: 'The session reaches a request',
		expected: 'success',
		then: [{ path: 'aiSession.onRequest', operator: 'is_true' }],
		run: async () => {
			const p = projectOf('reach');
			const door = liveDoor(p, { now: T0, seed: dossier(p, [session('s1', at(-600))], { requests: [requestWithClick()] }) });
			const answer = await door.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai');
			const request = door.stored().requests.find((r) => r.id === 'r1')!;
			return { status: status(answer.body.kind === 'click' && answer.body.requestId === 'r1'), final: { 'aiSession.onRequest': openSessionOf(request, ADA)?.id === 's1' } };
		}
	},
	{
		id: 'a4fd99e6',
		name: 'No session reaches nothing',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('reach-none');
			const door = liveDoor(p, { now: T0, seed: dossier(p, [], { requests: [requestWithClick()] }) });
			const refused = await door.call({ act: 'await', waitSeconds: 1 }, 'ai');
			const request = door.stored().requests.find((r) => r.id === 'r1')!;
			return { status: status(refused.status === 200 || !!openSessionOf(request, ADA)) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Record that the Reverse-Specification finished (972b7444)

prove('972b7444', 'Record that the Reverse-Specification finished', [
	{
		id: 'f5c30bfb',
		name: 'The Reverse-Specification finishes during the session',
		expected: 'success',
		then: [
			{ path: 'retrospec.finished', operator: 'is_true' },
			{ path: 'aiSession.workedHere', operator: 'is_true' }
		],
		run: () =>
			withFinished(at(-60), async () => {
				const p = projectOf('run-done');
				const door = liveDoor(p, { now: T0, seed: finishedRun(p) });
				const standing = await readRetrospecStanding(door.services, p);
				const finishedAt = retrospecFinishedAt(standing.status as never, standing.doc as never);
				return { status: 'success', final: { 'retrospec.finished': !!finishedAt, 'aiSession.workedHere': sessionWorkDone(door.stored(), ADA, 's1', finishedAt, false) } };
			})
	},
	{
		id: '9cc16057',
		name: 'The Reverse-Specification finishes with no session',
		expected: 'success',
		then: [
			{ path: 'retrospec.finished', operator: 'is_true' },
			{ path: 'aiSession.workedHere', operator: 'is_false' }
		],
		run: () =>
			withFinished(at(-60), async () => {
				const p = projectOf('run-done-alone');
				const door = liveDoor(p, { now: T0 });
				const standing = await readRetrospecStanding(door.services, p);
				const finishedAt = retrospecFinishedAt(standing.status as never, standing.doc as never);
				return { status: 'success', final: { 'retrospec.finished': !!finishedAt, 'aiSession.workedHere': sessionWorkDone(door.stored(), ADA, 's1', finishedAt, false) } };
			})
	}
]);

// ---------------------------------------------------------------------------
// Read my other AIs (93ba7a88)

const twoAis = (projectId: string, a: Partial<LiveSession> = {}) =>
	dossier(projectId, [session('claude', at(-600), { client: 'Claude Code', ...a }), session('codex', at(-300), { client: 'Codex' })]);

prove('93ba7a88', 'Read my other AIs', [
	{
		id: '3ea2e03c',
		name: "An AI reads its person's other AIs",
		expected: 'success',
		then: [{ path: 'aiSessions.othersOpen', operator: 'equals', value: 1 }],
		run: async () => {
			const p = projectOf('peers');
			const door = liveDoor(p, { seed: twoAis(p) });
			const read = await door.call({ act: 'sessions', sessionId: 'claude' }, 'ai');
			const others = (read.body.sessions ?? []).filter((s: { you: boolean }) => !s.you);
			expect(others.map((s: { name: string }) => s.name)).toEqual(['Codex']);
			return { status: status(read.status === 200), final: { 'aiSessions.othersOpen': openProjectSessionsOf(door.stored(), ADA).filter((s) => s.id !== 'claude').length } };
		}
	},
	{
		id: '2b442e17',
		name: 'An AI out of session reads no other AI',
		expected: 'blocked',
		holds: 'No session is open on this project',
		run: async () => {
			const p = projectOf('peers-ended');
			const door = liveDoor(p, { seed: twoAis(p, { endedAt: at(-60), endReason: 'idle' }) });
			const refused = await door.call({ act: 'sessions', sessionId: 'claude' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '8d27bb66',
		name: 'A page does not read the AIs this way',
		expected: 'blocked',
		holds: 'Only the AI client of the session does this',
		run: async () => {
			const p = projectOf('peers-page');
			const door = liveDoor(p, { seed: twoAis(p) });
			const refused = await door.call({ act: 'sessions', sessionId: 'claude' });
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: 'e161acc4',
		name: 'An AI outside the workspace reads no session',
		expected: 'blocked',
		holds: 'Project not found',
		run: async () => {
			const p = projectOf('peers-outside');
			const door = liveDoor(p, { decide: outside, seed: twoAis(p) });
			const refused = await door.call({ act: 'sessions', sessionId: 'claude' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Ask another AI of mine (f2bc0ae9)

const questionOf = (d: ProjectEvolutionDraft) => (d.clicks ?? []).find((c) => c.kind === 'question');
const peerState = (d: ProjectEvolutionDraft, now: string) => {
	const q = questionOf(d);
	return q ? questionStanding(d, ADA, q.id, now).state : 'none';
};

prove('f2bc0ae9', 'Ask another AI of mine', [
	{
		id: 'dcb21ab7',
		name: 'An AI asks another AI of its person',
		expected: 'success',
		then: [{ path: 'peer.question', operator: 'equals', value: 'waiting' }],
		run: async () => {
			const p = projectOf('ask');
			const door = liveDoor(p, { seed: twoAis(p) });
			const asking = door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the Reverse-Specification run?', waitSeconds: 1 }, 'ai');
			await tick();
			const waiting = peerState(door.stored(), door.services.clock.nowIso());
			const answer = await asking;
			return { status: status(answer.status === 200), final: { 'peer.question': waiting } };
		}
	},
	{
		id: '1eb6e985',
		name: 'An AI does not ask its own session',
		expected: 'blocked',
		holds: 'Ask another of your AIs, not your own session.',
		run: async () => {
			const p = projectOf('ask-self');
			const door = liveDoor(p, { seed: twoAis(p) });
			const refused = await door.call({ act: 'ask', sessionId: 'claude', to: 'claude', question: 'Where am I?' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '2ef6a9ef',
		name: 'No question to a session that is not open',
		expected: 'blocked',
		holds: 'No open session of yours has that id on this project: read_evolution_sessions lists them.',
		run: async () => {
			const p = projectOf('ask-closed');
			const seed = dossier(p, [
				session('claude', at(-600), { client: 'Claude Code' }),
				session('codex', at(-300), { client: 'Codex', endedAt: at(-60), endReason: 'gone' }),
				{ id: 'bob-ai', personId: BOB, startedAt: at(-200) }
			]);
			const door = liveDoor(p, { seed });
			const ended = await door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the run?' }, 'ai');
			const another = await door.call({ act: 'ask', sessionId: 'claude', to: 'bob-ai', question: 'Where is the run?' }, 'ai');
			return { status: status(ended.status === 200 || another.status === 200), said: `${said(ended.body)} ${said(another.body)}` };
		}
	},
	{
		id: '0cccf8e4',
		name: 'An empty question is not sent',
		expected: 'blocked',
		holds: 'question is required: one question for the other AI.',
		run: async () => {
			const p = projectOf('ask-empty');
			const door = liveDoor(p, { seed: twoAis(p) });
			const refused = await door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: '' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '18e985bc',
		name: 'An AI out of session asks nothing',
		expected: 'blocked',
		holds: 'No session is open on this project',
		run: async () => {
			const p = projectOf('ask-ended');
			const door = liveDoor(p, { seed: twoAis(p, { endedAt: at(-60), endReason: 'gone' }) });
			const refused = await door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the run?' }, 'ai');
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	},
	{
		id: '8c83e509',
		name: 'A page does not ask an AI this way',
		expected: 'blocked',
		holds: 'Only the AI client of the session does this',
		run: async () => {
			const p = projectOf('ask-page');
			const door = liveDoor(p, { seed: twoAis(p) });
			const refused = await door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the run?' });
			return { status: status(refused.status === 200), said: said(refused.body) };
		}
	}
]);

// ---------------------------------------------------------------------------
// Another AI answers my question (36b196b9)

/** The other AI answers the question it holds, as answer_click of apply_evolution_batch writes it, and the store tells every node. */
function answerAs(door: ReturnType<typeof liveDoor>, projectId: string, clickId: string, text: string) {
	const answered = answerProjectClick(door.stored(), ADA, clickId, text, door.services.clock.nowIso());
	if (answered.ok) door.seed(answered.draft);
	publishSectionChange({ projectId, section: 'evolution', origin: null });
	return answered;
}

prove('36b196b9', 'Another AI answers my question', [
	{
		id: 'bad11afa',
		name: 'The other AI answers in time',
		expected: 'success',
		then: [{ path: 'peer.question', operator: 'equals', value: 'answered' }],
		run: async () => {
			const p = projectOf('answer');
			const door = liveDoor(p, { seed: twoAis(p) });
			const asking = door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the run?', waitSeconds: 5 }, 'ai');
			await tick();
			const handed = await door.call({ act: 'await', sessionId: 'codex', waitSeconds: 1 }, 'ai');
			expect(handed.body).toMatchObject({ kind: 'click', requestId: null, click: { kind: 'question', from: { sessionId: 'claude', name: 'Claude Code' } } });
			const answered = answerAs(door, p, handed.body.click.id, 'Data model, 62 %');
			const answer = await asking;
			expect(answer.body).toMatchObject({ kind: 'answer', answer: 'Data model, 62 %', from: { sessionId: 'codex', name: 'Codex' } });
			return { status: status(answered.ok), final: { 'peer.question': peerState(door.stored(), door.services.clock.nowIso()) } };
		}
	},
	{
		id: '949ffe7a',
		name: 'A late answer is refused',
		expected: 'blocked',
		holds: 'The question ran out: the AI that asked it was told no answer came.',
		run: async () => {
			const p = projectOf('late');
			const door = liveDoor(p, { seed: twoAis(p) });
			const answer = await door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the run?', waitSeconds: 1 }, 'ai');
			expect(answer.body.kind).toBe('no_answer');
			const late = answerAs(door, p, questionOf(door.stored())!.id, 'Data model, 62 %');
			return { status: status(late.ok), said: late.ok ? '' : late.reason };
		}
	}
]);

// ---------------------------------------------------------------------------
// My question runs out (e9a909e1)

/** A question Claude Code asked Codex at T0, through the real ask. */
async function asked(projectId: string) {
	const door = liveDoor(projectId, { now: T0, seed: twoAis(projectId) });
	const outcome = await askOnProject(door.services, projectId, ADA, { from: 'claude', to: 'codex', question: 'Where is the run?' });
	if (!outcome?.ok) throw new Error('the question was not asked');
	return { door, questionId: outcome.click.id };
}

prove('e9a909e1', 'My question runs out', [
	{
		id: 'fac3d360',
		name: 'No answer within the delay',
		expected: 'success',
		then: [{ path: 'peer.question', operator: 'equals', value: 'expired' }],
		run: async () => {
			const p = projectOf('runs-out-q');
			const { door, questionId } = await asked(p);
			door.setNow(at(LIVE_SESSION.peerAnswerSeconds));
			const answer = await awaitPeerAnswer(door.services, { projectId: p, personId: ADA, questionId, to: 'codex', waitSeconds: 1 }, never);
			expect(answer).toMatchObject({ kind: 'no_answer', message: `No answer from Codex within ${LIVE_SESSION.peerAnswerSeconds} s` });
			return { status: status(answer.kind === 'no_answer'), final: { 'peer.question': peerState(door.stored(), door.services.clock.nowIso()) } };
		}
	},
	{
		id: '2a6548c2',
		name: 'The other session ends before answering',
		expected: 'success',
		then: [{ path: 'peer.question', operator: 'equals', value: 'expired' }],
		run: async () => {
			const p = projectOf('other-ends');
			const { door, questionId } = await asked(p);
			door.setNow(at(10));
			await door.call({ act: 'end', sessionId: 'codex' });
			const answer = await awaitPeerAnswer(door.services, { projectId: p, personId: ADA, questionId, to: 'codex', waitSeconds: 5 }, never);
			return { status: status(answer.kind === 'no_answer'), final: { 'peer.question': peerState(door.stored(), door.services.clock.nowIso()) } };
		}
	},
	{
		id: 'c63a24d6',
		name: 'The other AI still has time',
		expected: 'blocked',
		run: async () => {
			const p = projectOf('still-time');
			const { door, questionId } = await asked(p);
			return { status: status(questionStanding(door.stored(), ADA, questionId, at(90)).state === 'expired') };
		}
	}
]);

// ---------------------------------------------------------------------------
// The criteria the request brought or reworded on feat-7

/** What the live feed of a project carries to a reader once `publish` ran, read until it goes quiet. */
async function feedOf(projectId: string, email: string, publish: () => Promise<void>): Promise<string> {
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => ({ ok: true }) },
		enterpriseHooks: null,
		currentSession: () => ({ isAuthenticated: true, email })
	});
	const response = await Promise.resolve(feed(requestEvent({ path: `/api/sync/events?projectId=${projectId}`, authRequired: true, services, cookies: { lyriks_session: 'jwt' } })));
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let text = decoder.decode((await reader.read()).value);
	await publish();
	for (;;) {
		const quiet = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30));
		const chunk = await Promise.race([reader.read(), quiet]);
		if (!chunk || chunk.done) break;
		text += decoder.decode(chunk.value);
	}
	await reader.cancel();
	return text;
}

describe('the criteria of feat-7 the request brought or reworded (EVO-015)', () => {
	it('The opening tells the AI what the session covers and its limits [criterion:88cb2ef1]', async () => {
		const p = projectOf('opening');
		const request = createEvolutionRequest({ id: 'r-open', title: 'Order the day before', status: 'open' });
		const door = liveDoor(p, { seed: dossier(p, [session('claude', at(-600), { client: 'Claude Code' })], { requests: [request], clicks: [reread('c1', at(-30))] }) });
		const opened = await door.call({ act: 'start', client: 'Codex' }, 'ai');
		expect(opened.body).toMatchObject({ ok: true, waitingClicks: 1, others: [{ id: 'claude', name: 'Claude Code' }] });
		expect(opened.body.session).toMatchObject({ id: expect.any(String), startedAt: expect.any(String) });
		expect(opened.body.covers).toContain('the Specification 360°, the Reverse-Specification, the Evolution board and every request');
		expect(opened.body.limits).toMatchObject({ maxHoldSeconds: 1500, progressIntervalSeconds: 30, platformWaitSeconds: 240, disconnectAfterSeconds: 3600, idleEndSeconds: 1800, peerAnswerSeconds: 240 });
	});

	it('The opening on a request names startsOn and the link [criterion:88cb2ef1]', async () => {
		const p = projectOf('opening-request');
		const request = createEvolutionRequest({ id: 'r-open', title: 'Order the day before', status: 'open' });
		const door = liveDoor(p, { seed: dossier(p, [], { requests: [request] }) });
		const event = requestEvent({
			path: '/api/evolution/live',
			method: 'POST',
			body: JSON.stringify({ projectId: p, requestId: 'r-open', act: 'start' }),
			headers: { 'x-lyriks-actor': 'ai_client' },
			authRequired: true,
			services: door.services,
			cookies: { lyriks_session: 'jwt' }
		});
		const { POST } = await import('./+server');
		const body = JSON.parse((await (await POST(event)).text()).trim());
		expect(body).toMatchObject({ startsOn: 'r-open', href: expect.stringContaining('r-open') });
		expect(openProjectSessionOf(door.stored(), ADA)?.startsOn).toBe('r-open');
	});

	it('The AI is told why its session ended, and another AI opening never ends it [criterion:bbf808b9]', async () => {
		const p = projectOf('why-ended');
		const door = liveDoor(p, { now: T0 });
		const first = (await door.call({ act: 'start' }, 'ai')).body.session.id as string;
		await door.call({ act: 'start' }, 'ai');
		expect(openProjectSessionOf(door.stored(), ADA, first)).not.toBeNull();
		await door.call({ act: 'end', sessionId: first });
		expect((await door.call({ act: 'await', sessionId: first, waitSeconds: 1 }, 'ai')).body).toMatchObject({ kind: 'ended', reason: 'ended_by_person' });
		const ip = projectOf('why-idle');
		const idle = liveDoor(ip, { seed: dossier(ip, [session('s1', T0)]) });
		idle.setNow(at(1800));
		expect((await idle.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai')).body).toMatchObject({ kind: 'ended', reason: 'idle' });
		const finished = await withFinished(at(-60), async () => {
			const fp = projectOf('why-finished');
			const fd = liveDoor(fp, { now: T0, seed: finishedRun(fp) });
			return (await fd.call({ act: 'await', sessionId: 's1', waitSeconds: 1 }, 'ai')).body;
		});
		expect(finished).toMatchObject({ kind: 'ended', reason: 'finished' });
		expect((door.stored().sessions ?? []).some((s) => s.endReason === 'replaced')).toBe(false);
	});

	it('Ending from Ask my AI ends that AI only [criterion:ca1a2f15]', async () => {
		const p = projectOf('end-one');
		const door = liveDoor(p, { seed: twoAis(p) });
		expect((await door.call({ act: 'end', sessionId: 'codex' })).body).toMatchObject({ ok: true, ended: { sessionId: 'codex', reason: 'ended_by_person' } });
		expect(openProjectSessionsOf(door.stored(), ADA).map((s) => s.id)).toEqual(['claude']);
		const source = (await import('$ui/spec360/page/AskAiTool.svelte?raw')).default as string;
		expect(source).toContain('The clicks it has not answered go to another of your AIs, or wait for your next session.');
		const store = (await import('$ui/ai-session/project-ai-session.svelte?raw')).default as string;
		expect(store).toContain('Session ended: your AI stops waiting');
	});

	it('What an AI does now reaches its person and their other AIs only and is never saved [criterion:ea1709d0]', async () => {
		const p = projectOf('privacy');
		const seed = dossier(p, [...twoAis(p).sessions!, { id: 'bob-ai', personId: BOB, startedAt: at(-100) }]);
		const door = liveDoor(p, { seed });
		const revision = door.revision();
		let mine = '';
		const theirs = await feedOf(p, BOB, async () => {
			mine = await feedOf(p, ADA, async () => void (await door.call({ act: 'say', sessionId: 'codex', text: 'Reading the data model' }, 'ai', ADA)));
		});
		expect(mine).toContain('Reading the data model');
		expect(theirs).not.toContain('Reading the data model');
		const sibling = await door.call({ act: 'sessions', sessionId: 'claude' }, 'ai', ADA);
		expect(sibling.body.sessions.find((s: { id: string }) => s.id === 'codex').doing).toMatchObject({ saying: 'Reading the data model' });
		const stranger = await door.call({ act: 'sessions', sessionId: 'bob-ai' }, 'ai', BOB);
		expect(stranger.body.sessions.map((s: { id: string }) => s.id)).toEqual(['bob-ai']);
		expect(JSON.stringify(door.stored())).not.toContain('Reading the data model');
		expect(door.revision()).toBe(revision);
	});

	it('Several server nodes share what each AI does, and one AI keeps a click [criterion:8181d158]', async () => {
		const p = projectOf('nodes');
		const door = liveDoor(p, { seed: dossier(p, [session('claude', at(-600)), session('codex', at(-300))], { clicks: [reread('c1', at(-30))] }) });
		// Another node holds Codex's wait: its signal reaches this node through the bus, so the click goes to Codex here too.
		publishLiveSignal({ projectId: p, requestId: PROJECT_SESSION_KEY, personId: ADA, sessionId: 'codex', status: 'listening', thinkingAbout: null, saying: null, step: null, endReason: null, callHeld: true, at: door.services.clock.nowIso() });
		const claude = await door.call({ act: 'await', sessionId: 'claude', waitSeconds: 1 }, 'ai');
		expect(claude.body.kind).toBe('nothing');
		// Both AIs wait at once for one click: one takes it, the other never does.
		const both = await Promise.all([
			door.call({ act: 'await', sessionId: 'claude', waitSeconds: 1 }, 'ai'),
			door.call({ act: 'await', sessionId: 'codex', waitSeconds: 1 }, 'ai')
		]);
		expect(both.map((a) => a.body.kind).sort()).toEqual(['click', 'nothing']);
		expect((door.stored().clicks ?? []).filter((c) => c.state === 'taken')).toHaveLength(1);
	});

	it('The project keeps its 20 latest sessions and every open one [criterion:b1e37149]', () => {
		let draft = dossier('kept', [session('open-first', at(-9000))]);
		for (let i = 0; i < 25; i++) {
			const opened = startProjectSession(draft, ADA, `s${i}`, at(-8000 + i * 10));
			if (!opened.ok) throw new Error(opened.reason);
			draft = { ...opened.draft, sessions: opened.draft.sessions!.map((s) => (s.id === `s${i}` && i % 2 === 0 ? { ...s, endedAt: at(-7000), endReason: 'idle' as const } : s)) };
		}
		const kept = draft.sessions ?? [];
		expect(kept).toHaveLength(20);
		const open = kept.filter((s) => !s.endedAt).map((s) => s.id);
		expect(open).toContain('open-first');
		expect(open).toEqual(['open-first', ...Array.from({ length: 25 }, (_, i) => `s${i}`).filter((_, i) => i % 2 === 1)]);
	});

	it('Several AIs of a person stay in session together [criterion:27e5de03]', async () => {
		const p = projectOf('together');
		const door = liveDoor(p);
		const claude = (await door.call({ act: 'start', client: 'Claude Code' }, 'ai')).body.session.id as string;
		const codex = (await door.call({ act: 'start', client: 'Codex' }, 'ai')).body.session.id as string;
		expect(openProjectSessionsOf(door.stored(), ADA).map((s) => s.id)).toEqual([claude, codex]);
		expect((await door.read(ADA)).body.sessions.map((s: { name: string }) => s.name)).toEqual(['Codex', 'Claude Code']);
		expect((await door.call({ act: 'await', sessionId: claude, waitSeconds: 1 }, 'ai')).body.kind).toBe('nothing');
		expect((door.stored().sessions ?? []).some((s) => s.endReason === 'replaced')).toBe(false);
	});

	it('Each session is named after its AI [criterion:302dae22]', () => {
		const request = createEvolutionRequest({ id: 'r-named', title: 'Order the day before', status: 'open' });
		const draft = dossier('named', [
			session('on-request', at(-600), { client: 'Claude Code', startsOn: 'r-named' }),
			session('on-run', at(-500), { client: 'Claude Code' }),
			session('alone', at(-400), { client: 'Codex' }),
			session('nameless', at(-300))
		], { requests: [request], clicks: [reread('run', at(-60), 'taken', { sessionId: 'on-run', runId: 'run-1', takenAt: at(-50) })] });
		const name = (id: string) => sessionName(draft, ADA, (draft.sessions ?? []).find((s) => s.id === id)!);
		expect(name('on-request')).toBe('Claude Code · EVO-001');
		expect(name('on-run')).toBe('Claude Code · Reverse-Specification');
		expect(name('alone')).toBe('Codex');
		expect(name('nameless')).toBe('Your AI');
	});

	it("An AI reads its person's other sessions [criterion:4536271d]", async () => {
		const p = projectOf('read-others');
		const door = liveDoor(p, { seed: dossier(p, [...twoAis(p).sessions!, { id: 'bob-ai', personId: BOB, startedAt: at(-100) }]) });
		say(door.services, { projectId: p, requestId: PROJECT_SESSION_KEY, personId: ADA, sessionId: 'codex' }, 'writing', { saying: 'Phase Data model, 62 %', step: 4 });
		const read = await door.call({ act: 'sessions', sessionId: 'claude' }, 'ai');
		expect(read.body.sessions).toEqual([
			expect.objectContaining({ id: 'codex', name: 'Codex', you: false, startedAt: at(-300), holds: { requests: [], run: false }, doing: expect.objectContaining({ status: 'writing', saying: 'Phase Data model, 62 %', step: 4 }) }),
			expect.objectContaining({ id: 'claude', name: 'Claude Code', you: true })
		]);
	});

	it('An AI asks another AI and gets its answer, or is told none came [criterion:57735b99]', async () => {
		const p = projectOf('ask-flow');
		const door = liveDoor(p, { seed: twoAis(p) });
		const asking = door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'Where is the run?', waitSeconds: 5 }, 'ai');
		await tick();
		const handed = await door.call({ act: 'await', sessionId: 'codex', waitSeconds: 1 }, 'ai');
		expect(handed.body.click).toMatchObject({ kind: 'question', question: 'Where is the run?', from: { name: 'Claude Code' } });
		answerAs(door, p, handed.body.click.id, 'Data model, 62 %');
		expect((await asking).body).toMatchObject({ kind: 'answer', answer: 'Data model, 62 %', from: { name: 'Codex' } });
		const unanswered = await door.call({ act: 'ask', sessionId: 'claude', to: 'codex', question: 'And now?', waitSeconds: 1 }, 'ai');
		expect(unanswered.body).toMatchObject({ kind: 'no_answer', message: 'No answer from Codex within 240 s' });
		const late = answerAs(door, p, unanswered.body.questionId, 'Too late');
		expect(late).toMatchObject({ ok: false, reason: 'The question ran out: the AI that asked it was told no answer came.' });
	});
});
