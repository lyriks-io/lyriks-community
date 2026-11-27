import type { AppServices } from '$composition/container.server';
import {
	LIVE_SESSION,
	openProjectSessionsOf,
	waitingClickTimesOf,
	wakeRefusal,
	wakeStateOf,
	wakerStatusOf,
	type ProjectEvolutionDraft,
	type WakeState,
	type WakerStatus
} from '$domain/evolution';
import { ensureWatching, presenceOf } from './evolution-live.server';
import { publishLiveSignal, subscribeSectionChanges } from './sync-bus.server';
import { WAKER_KEY } from '$lib/shared/live-session';

/**
 * The person's waker on a project (feat-ai-session): its waiting call held
 * open until a click of theirs waits and none of their AIs is in session
 * ("Keep my waker listening", "Wake my AI"), and what their pages read of it.
 * Like a session's presence, it travels on the live bus on a key of its own
 * (WAKER_KEY), so every node agrees and nothing is saved.
 */

const WAKER_SESSION = 'waker';

/** What the person's pages read of their waker (criterion 7cfc6440). */
export interface WakerReading {
	readonly status: WakerStatus;
	readonly wake: WakeState;
	readonly handedAt: string | null;
}

const samePerson = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The waker was heard: its call is held, and a wake handed now is said with it. */
function hear(services: AppServices, projectId: string, personId: string, wakeHandedAt?: string): void {
	ensureWatching(services);
	const before = presenceOf(projectId, WAKER_KEY, personId);
	publishLiveSignal({
		projectId,
		requestId: WAKER_KEY,
		personId,
		sessionId: WAKER_SESSION,
		status: 'listening',
		thinkingAbout: null,
		saying: null,
		step: null,
		endReason: null,
		callHeld: true,
		wakeHandedAt: wakeHandedAt ?? before?.wakeHandedAt ?? null,
		at: services.clock.nowIso()
	});
}

/** Where the person's waker and their last wake stand, as this node heard it. */
export function wakerReading(draft: ProjectEvolutionDraft, projectId: string, personId: string, nowMs: number): WakerReading {
	const heard = presenceOf(projectId, WAKER_KEY, personId);
	const handedAt = heard?.wakeHandedAt ?? null;
	const startedAts = (draft.sessions ?? []).filter((s) => samePerson(s.personId, personId)).map((s) => s.startedAt);
	return { status: wakerStatusOf(heard?.at ?? null, nowMs), wake: wakeStateOf(handedAt, startedAts, nowMs), handedAt };
}

export type WakeAnswer = { readonly kind: 'wake'; readonly clicks: number; readonly wokenAt: string } | { readonly kind: 'nothing'; readonly waitedSeconds: number };

/**
 * Hold the waker's call ("Keep my waker listening", action 77cdb263) until a
 * wake is due ("Wake my AI", action ccca0911), looking again whenever the
 * project changes (a click is a change) and at every beat, which also says
 * the waker is still there; at most one platform turn.
 */
export async function awaitWake(
	services: AppServices,
	input: { readonly projectId: string; readonly personId: string; readonly waitSeconds: number },
	hooks: { readonly aborted: () => boolean; readonly onAbort: (listener: () => void) => void }
): Promise<WakeAnswer> {
	const { projectId, personId } = input;
	const limit = Math.max(1, Math.min(input.waitSeconds, LIVE_SESSION.platformWaitSeconds));
	const started = Date.now();
	for (;;) {
		hear(services, projectId, personId);
		const draft = await services.loadEvolutionDraft.execute(projectId);
		const now = services.clock.nowIso();
		const reading = wakerReading(draft, projectId, personId, Date.parse(now));
		const waiting = waitingClickTimesOf(draft, personId);
		const refusal = wakeRefusal({
			waitingClickAts: waiting,
			sessionsOpen: openProjectSessionsOf(draft, personId).length,
			waker: 'listening',
			wake: reading.wake,
			handedAt: reading.handedAt
		});
		if (!refusal) {
			hear(services, projectId, personId, now);
			return { kind: 'wake', clicks: waiting.length, wokenAt: now };
		}
		const left = limit * 1000 - (Date.now() - started);
		if (left <= 0) return { kind: 'nothing', waitedSeconds: Math.round((Date.now() - started) / 1000) };
		const woke = await new Promise<'look' | 'abort'>((resolve) => {
			const unsubscribe = subscribeSectionChanges((change) => {
				if (change.projectId === projectId) finish('look');
			});
			const timer = setTimeout(() => finish('look'), Math.min(left, LIVE_SESSION.progressIntervalSeconds * 1000));
			hooks.onAbort(() => finish('abort'));
			function finish(why: 'look' | 'abort') {
				clearTimeout(timer);
				unsubscribe();
				resolve(why);
			}
		});
		// A waker that hung up is no longer heard: it reads gone once wakerGoneSeconds pass.
		if (woke === 'abort' || hooks.aborted()) return { kind: 'nothing', waitedSeconds: Math.round((Date.now() - started) / 1000) };
	}
}
