import { requestKeyOf } from '$domain/evolution';
import { requestPagePath } from '$domain/evolution';
import { sessionsInProgress } from '$domain/evolution';
import { personKey } from '$domain/evolution';
import type { LastRunState } from '$domain/retrospec/last-run';
import type { ActivityMember } from './evolution-activity';
import { evolutionNext, evolutionPercent, EVOLUTION_STEPS, type EvolutionNext } from './evolution-progress';
import type { HomeSource } from './home-source';
import { personLook } from './people';

/**
 * Running now on Home (feat-home, criterion ee8adfec): what Lyriks is doing
 * for the reader across their projects, one card per run. A
 * Reverse-Specification reads RUNNING while it reads, INACTIVE once its LLM
 * went silent, WAITING before its prompt was run, ready to review or in
 * review; an evolution reads RUNNING while an AI works on it and WAITING while
 * its step waits on the reader. Pure.
 */

export type RunState = 'inactive' | 'waiting' | 'running';

/** The word a state is written with, in its tag and over its group. */
export const RUN_STATE_WORD: Readonly<Record<RunState, string>> = {
	inactive: 'Inactive',
	waiting: 'Waiting',
	running: 'Running'
};

/** INACTIVE first, then what waits on the reader, then the rest. */
export const RUN_STATE_ORDER: readonly RunState[] = ['inactive', 'waiting', 'running'];

/** Past this many runs, the cards are grouped under their state. */
export const RUNS_UNGROUPED = 5;

export type RunKind = 'reverse_specification' | 'evolution';

export interface HomeRunCard {
	readonly id: string;
	readonly projectId: string;
	readonly project: string;
	readonly kind: RunKind;
	/** "Reverse-Specification", or the evolution's key, "EVO-012". */
	readonly label: string;
	readonly state: RunState;
	/** Where it is, in one line. */
	readonly line: string;
	readonly pct: number;
	readonly href: string;
	/** The read mark that hides this card for this reader in its current state (action a6a79b22). */
	readonly hideId?: string;
}

/** A run put aside is hidden for its state: its mark no longer matches once the run moves on. */
export const runMark = (run: Pick<HomeRunCard, 'id' | 'state'>): string => `run:${run.id}:${run.state}`;

export interface RunContext {
	readonly me: string;
	readonly roster: readonly ActivityMember[];
	readonly now: number;
}

const clamp = (pct: number) => Math.max(0, Math.min(100, Math.round(pct)));

const REVERSE_STATE: Readonly<Record<LastRunState, RunState | null>> = {
	running: 'running',
	paused: 'inactive',
	not_launched: 'waiting',
	complete: 'waiting',
	partial: 'waiting',
	review: 'waiting',
	validated: null
};

function reverseRun(p: HomeSource): HomeRunCard[] {
	const run = p.run;
	const state = run ? REVERSE_STATE[run.state] : null;
	if (!run || !state) return [];
	const pct = clamp(run.pct);
	return [
		{
			id: `retro:${p.id}`,
			projectId: p.id,
			project: p.name,
			kind: 'reverse_specification',
			label: 'Reverse-Specification',
			state,
			line: run.state === 'review' ? `In review · ${run.detail}` : run.detail,
			pct,
			href: run.href
		}
	];
}

/** Whether the step an evolution is at waits on the reader's own validation. */
function waitsOnReader(next: EvolutionNext, me: string): boolean {
	const v = next.reading?.validation;
	if (!v) return false;
	const reader = personKey(me);
	const settled = (ids: readonly string[]) => ids.some((g) => personKey(g) === reader);
	return v.expected.includes(reader) && !settled(v.given) && !settled(v.gone);
}

function evolutionRuns(p: HomeSource, ctx: RunContext): HomeRunCard[] {
	return p.requests.flatMap((r) => {
		const next = evolutionNext(r);
		if (!next) return [];
		const session = sessionsInProgress(r, ctx.now)[0];
		const waiting = !session && waitsOnReader(next, ctx.me);
		if (!session && !waiting) return [];
		const pct = evolutionPercent(next);
		const who = session && personKey(session.personId) !== personKey(ctx.me) ? `Lyriks for ${personLook(session.personId, ctx.roster).name}` : 'Lyriks';
		return [
			{
				id: `evo:${r.id}`,
				projectId: p.id,
				project: p.name,
				kind: 'evolution' as const,
				label: p.keys?.[r.id] || requestKeyOf(p.requests, r.id) || 'EVO',
				state: session ? 'running' : 'waiting',
				line: session
					? `${who} is working on the ${next.stepName}`
					: `Step ${next.step} of ${EVOLUTION_STEPS.length} · ${next.action} · waiting for you`,
				pct,
				href: requestPagePath(p.id, r.id)
			}
		];
	});
}

const rank = (s: RunState) => RUN_STATE_ORDER.indexOf(s);

/** Every run of the reader's projects, INACTIVE first, then WAITING and RUNNING, the furthest first within. */
export function homeRuns(sources: readonly HomeSource[], ctx: RunContext): HomeRunCard[] {
	return sources
		.flatMap((p) => [...reverseRun(p), ...evolutionRuns(p, ctx)])
		.sort((a, b) => rank(a.state) - rank(b.state) || b.pct - a.pct || a.project.localeCompare(b.project));
}

export interface RunGroup {
	/** Null when the runs are few enough to read as one list. */
	readonly state: RunState | null;
	readonly runs: readonly HomeRunCard[];
}

/** One list for a few runs; past RUNS_UNGROUPED, one group per state that has runs, in their order. */
export function runGroups(runs: readonly HomeRunCard[]): RunGroup[] {
	if (runs.length === 0) return [];
	if (runs.length <= RUNS_UNGROUPED) return [{ state: null, runs }];
	return RUN_STATE_ORDER.map((state) => ({ state, runs: runs.filter((r) => r.state === state) })).filter((g) => g.runs.length > 0);
}
