import { currentRun, lastPublishedRun, type ItemVerdict, type RetrospecDocument, type RetrospecMode, type RetrospecRun } from './document';
import { checkedSince, runProgress, sectionRevision, type RunProgress } from './progress';

/**
 * Where a project's retrospecification stands, in one word the shell, the home
 * page and the notifications share, with the percentage they show beside it.
 * Everything is read from what is stored (the runs, the specification's
 * revisions, the completion audits), never from a timer.
 */
export type RetrospecStatusKind = 'start' | 'source' | 'running' | 'bilan' | 'review' | 'done';

export interface RetrospecStatus {
	readonly status: RetrospecStatusKind;
	/** 0 to 100: the analysis while it runs, the share of items handled in review, 100 once read or published. */
	readonly pct: number;
	/** One line a person reads, e.g. "Live retrospec · 42 %". */
	readonly label: string;
	/** A run was published: the Specification 360° reads "Published". Stays true while a later run is under way. */
	readonly published: boolean;
	/**
	 * The current run starts from a specification already gathered (a later run):
	 * the navigation keeps the Specification 360° while it goes on (criterion 9359cb3c).
	 */
	readonly complementary: boolean;
	readonly publishedAt: string | null;
	/** While in review: how many items are decided (validated or rejected) out of how many. */
	readonly review: { readonly handled: number; readonly total: number } | null;
	/**
	 * Once the analysis is over: when the AI ran its final check (the completion
	 * audit), or, for a partial run a person closed before it, the share the AI
	 * had read then (criterion a0959413). Null before the analysis ends.
	 */
	readonly ending?: { readonly checkedAt: string } | { readonly closedAtPct: number } | null;
}

/** The facts a status is read from; all of them are cheap to gather. */
export interface RetrospecFacts {
	readonly doc: RetrospecDocument;
	/** Every stored revision of the project's sections (document and legacy stores summed per key). */
	readonly revisions: Readonly<Record<string, number>>;
	/** When each completion audit of the project ran (the scope ledger). */
	readonly auditTimes: readonly string[];
	/**
	 * What the project is rebuilt from when it was created from an existing
	 * product (its code or its documentation), null for one the team describes
	 * itself or builds from scratch: its AI's work reads as a retrospecification
	 * even with no run started from the page (criterion 029a8736).
	 */
	readonly rebuiltFrom: RetrospecMode | null;
	/** The specification already holds features. */
	readonly hasSpec: boolean;
	/** The leaf features of the tree, when the caller read it: their behaviour counts in the progress. */
	readonly leafFeatureIds?: readonly string[];
}

/**
 * What a project is rebuilt from, read off the source mode its identity records:
 * its code, or its documentation (criterion 029a8736); null for a project the
 * team describes itself or builds from scratch.
 */
export function rebuiltFromSourceMode(sourceMode: string | null | undefined): RetrospecMode | null {
	if (sourceMode === 'code_to_spec') return 'repo';
	if (sourceMode === 'from_document') return 'docs';
	return null;
}

/** Where one item stands for the review. */
export type ItemState = 'validated' | 'rejected' | 'later' | 'shared' | 'open';

export function itemState(verdict: ItemVerdict | undefined): ItemState {
	if (!verdict) return 'open';
	if (verdict.flag?.kind === 'rejected') return 'rejected';
	if (verdict.validatedBy.length > 0) return 'validated';
	if (verdict.flag?.kind === 'later') return 'later';
	if (verdict.flag?.kind === 'shared') return 'shared';
	return 'open';
}

/** Validated or rejected: someone decided, nothing is left to do on it. */
export const isHandled = (state: ItemState) => state === 'validated' || state === 'rejected';

export interface ReviewCounts {
	/** Validated or rejected. */
	readonly handled: number;
	readonly validated: number;
	readonly rejected: number;
	readonly later: number;
	readonly shared: number;
	readonly total: number;
}

/** Count the review over the items it holds now; without them, over the total the run last recorded. */
export function reviewCounts(run: RetrospecRun | null, itemIds?: readonly string[]): ReviewCounts {
	const verdicts = run?.verdicts ?? {};
	const ids = itemIds ?? Object.keys(verdicts);
	const states = ids.map((id) => itemState(verdicts[id]));
	const count = (s: ItemState) => states.filter((x) => x === s).length;
	const validated = count('validated');
	const rejected = count('rejected');
	return {
		handled: validated + rejected,
		validated,
		rejected,
		later: count('later'),
		shared: count('shared'),
		total: itemIds ? itemIds.length : Math.max(run?.itemTotal ?? 0, ids.length)
	};
}

/**
 * A project nobody started a run for but whose specification the AI rebuilt
 * from its code (the kickoff, or before this page existed) reads as if a run
 * had started from nothing: everything in it is the AI's work.
 */
function implicitBaselineOf(run: RetrospecRun | null): Readonly<Record<string, number>> {
	return run?.baseline ?? {};
}

/** How many leaves received their behaviour since the run started (all of it for a run nobody started here). */
function behaviorOfRun(facts: RetrospecFacts, run: RetrospecRun | null): { authored: number; leaves: number } | undefined {
	if (!facts.leafFeatureIds) return undefined;
	const since = run && !run.implicit ? run.startedAt : null;
	const authored = facts.leafFeatureIds.filter((id) => {
		const at = facts.doc.behaviorAuthored?.[id];
		return !!at && (since === null || at >= since);
	}).length;
	return { authored, leaves: facts.leafFeatureIds.length };
}

/**
 * Where a run read from. A run nobody started from the page read what the
 * project is rebuilt from (its documentation for a project started from it,
 * criterion 029a8736), whatever mode the run was stored with.
 */
export function runSourceOf(run: RetrospecRun | null, rebuiltFrom: RetrospecMode | null): RetrospecMode {
	if (run && !run.implicit) return run.mode;
	return rebuiltFrom ?? run?.mode ?? 'repo';
}

/** The analysis of the current run, as its phases read now, and when its final check ran, if it did. */
export function analysisOf(facts: RetrospecFacts, lastWritten?: string | null): { progress: RunProgress; finished: boolean; checkedAt: string | null } {
	const run = currentRun(facts.doc);
	const since = run && !run.implicit ? run.startedAt : null;
	const checked = checkedSince(facts.auditTimes, since);
	// A run that holds its changes ends when its AI says so: the final check comes once what is validated is written (criterion 50b00229).
	const readAll = !!run?.readingDoneAt;
	const progress = runProgress({
		revisions: facts.revisions,
		baseline: implicitBaselineOf(run),
		checked: checked || readAll,
		mode: runSourceOf(run, facts.rebuiltFrom),
		lastWritten,
		behavior: behaviorOfRun(facts, run),
		// A Resume analysis starts from the phases the closed run read; a run that writes nothing follows what its AI says (EVO-014).
		readBefore: run?.complementary?.scope === 'resume' ? run.complementary.resumable?.read : undefined,
		reported: run?.phaseReported ?? null
	});
	const checkedAt = checked ? (facts.auditTimes.filter((at) => since === null || at >= since).sort().at(-1) ?? null) : (run?.readingDoneAt ?? null);
	return { progress, finished: checked || readAll || !!run?.analysisEndedAt, checkedAt };
}

/**
 * The sections the AI writes from the retro-spec playbook's first step on (its
 * sources, its scope, then the features), and that nothing else writes on a
 * project just created from a codebase. One of them moved: the person's AI is
 * at work, even before its first feature, so the page never invites the person
 * to start what is already running.
 */
const AI_AT_WORK_SECTIONS = ['documents', 'scope', 'features'] as const;

const aiAtWork = (facts: RetrospecFacts): boolean =>
	facts.hasSpec || AI_AT_WORK_SECTIONS.some((s) => sectionRevision(facts.revisions, s) > 0);

/** A Reverse-Specification was started from its page, or the product was rebuilt from its code or its documents. */
export function everRebuilt(doc: Pick<RetrospecDocument, 'runs'>, rebuiltFrom: RetrospecMode | null): boolean {
	return !!rebuiltFrom || doc.runs.some((r) => !r.implicit);
}

export function retrospecStatus(facts: RetrospecFacts): RetrospecStatus {
	const run = currentRun(facts.doc);
	const lastPublished = lastPublishedRun(facts.doc);
	const published = { published: !!lastPublished, publishedAt: lastPublished?.publishedAt ?? null, complementary: !!run?.complementary };
	const make = (status: RetrospecStatusKind, pct: number, label: string, review: RetrospecStatus['review'] = null): RetrospecStatus => ({ status, pct, label, ...published, review });

	if (run?.publishedAt) return make('done', 100, 'Specification published');
	if (run?.reviewStartedAt) {
		const counts = reviewCounts(run);
		const pct = counts.total > 0 ? Math.round((100 * counts.handled) / counts.total) : 0;
		return make('review', pct, counts.total > 0 ? `Reverse-Specification in validation · ${counts.handled} / ${counts.total} validated` : 'Reverse-Specification in validation', { handled: counts.handled, total: counts.total });
	}
	// A run nobody started, on a product never rebuilt, only keeps its hand edits and validations: no analysis runs (criterion 4d51ac1d).
	if (!run || !everRebuilt(facts.doc, facts.rebuiltFrom)) {
		// Rebuilt from the code or the documentation without a run started here: the analysis is there to read (criterion 029a8736).
		if (!facts.rebuiltFrom || !aiAtWork(facts)) return make('start', 0, 'Reverse-Specification not started');
	}
	const { progress, finished, checkedAt } = analysisOf(facts);
	if (finished) {
		// Complete once the AI ran its final check; partial when a person closed it before (criterion a0959413).
		const ending = checkedAt ? { checkedAt } : { closedAtPct: progress.pct };
		return { ...make('bilan', 100, 'Reverse-Specification ready to review'), ending };
	}
	if (run && !run.implicit && !run.launchedAt && !progress.started) return make('source', 0, 'Reverse-Specification starting');
	return make('running', progress.pct, `Live Reverse-Specification · ${progress.pct} %`);
}

/**
 * When the Reverse-Specification finished, for the AI's session to end once its
 * work is done (criterion 45933ee4 of feat-ai-session): the AI's final check of
 * an analysis ready to review, or its validation. Null while it runs, while it
 * is in review, when a person closed it before the final check, and for a
 * project with none.
 */
export function retrospecFinishedAt(status: RetrospecStatus, doc: RetrospecDocument): string | null {
	if (status.status === 'done') return currentRun(doc)?.publishedAt ?? null;
	if (status.status === 'bilan' && status.ending && 'checkedAt' in status.ending) return status.ending.checkedAt;
	return null;
}

/** What the app bar says of a running retrospecification whose LLM went silent, in place of its live label (criterion 7a4a99e4). */
export const pausedRetrospecLabel = (pct: number): string => `Reverse-Specification paused · ${pct} %`;

