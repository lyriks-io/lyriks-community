import type { RetrospecDocument, RetrospecMode, RetrospecRun } from './document';
import type { RetrospecStatusKind } from './status';

/**
 * The Reverse-Specifications of a product as the history of the Reverse page
 * lists them (criterion 2dbed801): one row per run, newest first, with where it
 * read from, whether it read only the delta since the last validated run, the
 * commit it read once its AI reported it, where it stands, and its steps as the
 * document recorded them, each with who and when. Pure.
 */

export type RunCardStatus = 'validated' | 'closed' | 'running' | 'paused' | 'ready' | 'review' | 'not_launched';

export const RUN_STATUS_LABEL: Readonly<Record<RunCardStatus, string>> = {
	validated: 'Validated',
	closed: 'Closed',
	running: 'Running',
	paused: 'Paused',
	ready: 'Ready to review',
	review: 'In review',
	not_launched: 'Not launched'
};

export const RUN_SOURCE_LABEL: Readonly<Record<RetrospecMode, string>> = {
	repo: 'From the code',
	docs: 'From the documentation',
	both: 'From the code and the documentation'
};

export interface RunStep {
	readonly label: string;
	readonly at: string;
	readonly by: string | null;
}

export interface RunCard {
	readonly id: string;
	readonly startedAt: string;
	readonly mode: RetrospecMode;
	readonly status: RunCardStatus;
	readonly startedBy: string;
	readonly validatedBy: string | null;
	/** The run the specification stands on now: the figures of its reading are its own. */
	readonly current: boolean;
	/** The commit it read, short, once its AI reported it. */
	readonly commit: string | null;
	/** It started from the specification gathered and read only what changed. */
	readonly complementary: boolean;
	/** It started from the specification gathered and read the whole product again (criterion 98612117). */
	readonly whole: boolean;
	readonly history: readonly RunStep[];
}

/** Where the current run stands, from the project's retrospecification status. */
function currentStatus(run: RetrospecRun, status: RetrospecStatusKind): RunCardStatus {
	if (run.publishedAt) return 'validated';
	switch (status) {
		case 'review':
			return 'review';
		case 'bilan':
			return 'ready';
		case 'running':
			return 'running';
		default:
			return run.launchedAt ? 'running' : 'not_launched';
	}
}

/** A commit as git shows it short. */
export const shortCommit = (sha: string) => sha.slice(0, 7);

const nameOf = (person: { readonly name: string } | null | undefined) => person?.name.trim() || null;

function historyOf(run: RetrospecRun): RunStep[] {
	const steps: (RunStep | null)[] = [
		{ label: 'Reverse-Specification started', at: run.startedAt, by: nameOf(run.startedBy) },
		run.launchedAt ? { label: 'Prompt handed to the AI', at: run.launchedAt, by: null } : null,
		run.commit ? { label: `Commit ${shortCommit(run.commit.sha)} recorded`, at: run.commit.at, by: null } : null,
		run.analysisEndedAt ? { label: 'Analysis closed', at: run.analysisEndedAt, by: nameOf(run.analysisEndedBy) } : null,
		run.reviewStartedAt ? { label: 'Review started', at: run.reviewStartedAt, by: null } : null,
		run.publishedAt ? { label: 'Specification validated', at: run.publishedAt, by: nameOf(run.publishedBy) } : null,
		run.closedAt ? { label: 'Closed when the next run started', at: run.closedAt, by: nameOf(run.closedBy) } : null
	];
	return steps.filter((s): s is RunStep => !!s && !!s.at).sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The runs of a project, newest first. A specification its AI rebuilt from the
 * code or the documentation with no run started from the page is its current
 * run all the same, from what the project is rebuilt from, never "no
 * Reverse-Specification yet" (criterion 029a8736).
 */
export function runCards(doc: RetrospecDocument, status: RetrospecStatusKind, rebuiltFrom: RetrospecMode | null = null): RunCard[] {
	if (doc.runs.length === 0) return rebuiltFrom && (status === 'running' || status === 'bilan') ? [unstartedRun(rebuiltFrom, status)] : [];
	const last = doc.runs.length - 1;
	return doc.runs
		.map((run, i): RunCard => ({
			id: run.id,
			startedAt: run.startedAt,
			mode: run.implicit && rebuiltFrom ? rebuiltFrom : run.mode,
			// A run before the last one was validated, or closed when the next one started.
			status: i === last ? currentStatus(run, status) : run.publishedAt ? 'validated' : run.closedAt ? 'closed' : 'not_launched',
			startedBy: nameOf(run.startedBy) ?? 'Someone',
			validatedBy: nameOf(run.publishedBy),
			current: i === last,
			commit: run.commit ? shortCommit(run.commit.sha) : null,
			complementary: run.complementary?.scope === 'delta',
			whole: run.complementary?.scope === 'whole',
			history: historyOf(run)
		}))
		.reverse();
}

/** The run nobody started from the page: the AI's own reading of the product, as it stands now. */
function unstartedRun(mode: RetrospecMode, status: RetrospecStatusKind): RunCard {
	return {
		id: 'run-unstarted',
		startedAt: '',
		mode,
		status: status === 'bilan' ? 'ready' : 'running',
		startedBy: 'Lyriks',
		validatedBy: null,
		current: true,
		commit: null,
		complementary: false,
		whole: false,
		history: []
	};
}

/**
 * The run under way reads paused while its LLM is silent, never running
 * (criterion 7a4a99e4); the other runs read as they stand.
 */
export function withSilence(runs: readonly RunCard[], silent: boolean): RunCard[] {
	return runs.map((run) => (silent && run.current && run.status === 'running' ? { ...run, status: 'paused' } : run));
}

/**
 * What the next run reads (criterion 2dbed801): a product that already holds
 * what a run or its AI gathered gets a complementary run, which erases nothing
 * and reads the delta, since the commit the last validated run recorded when
 * there is one; only a product with nothing gathered yet reads it whole.
 */
export function nextRunReads(doc: RetrospecDocument, gathered: boolean): { readonly complementary: true; readonly fromCommit: string | null } | { readonly complementary: false } {
	let last: RetrospecDocument['runs'][number] | null = null;
	for (let i = doc.runs.length - 1; i >= 0 && !last; i--) if (doc.runs[i].publishedAt) last = doc.runs[i];
	if (!last && !gathered && doc.runs.length === 0) return { complementary: false };
	return { complementary: true, fromCommit: last?.commit ? shortCommit(last.commit.sha) : null };
}
