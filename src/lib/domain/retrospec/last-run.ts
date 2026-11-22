import { currentRun, type RetrospecDocument, type RetrospecMode } from './document';
import { RUN_SOURCE_LABEL } from './run-history';
import { reviewCounts, runSourceOf, type RetrospecStatus } from './status';

/**
 * Where the last Reverse-Specification of a project stands, as Home lists it
 * (criterion a0959413): one word for its state, where it read from and when it
 * started, and one line saying what that state means. A run is partial when a
 * person closed its analysis before the AI ran its final check, complete when
 * the AI ran it. Pure: the caller hands the clock's words for a moment.
 */

export type LastRunState = 'running' | 'paused' | 'partial' | 'complete' | 'review' | 'validated' | 'not_launched';

export interface LastRun {
	readonly state: LastRunState;
	readonly title: string;
	/** Where it read from and when it started: "From the documentation · started 2 h ago". */
	readonly source: string;
	/** What its state means. */
	readonly detail: string;
}

export interface LastRunInput {
	readonly status: RetrospecStatus;
	readonly doc: RetrospecDocument;
	readonly rebuiltFrom: RetrospecMode | null;
	readonly productName: string;
	/** Its LLM went silent while it ran (criterion 7a4a99e4). */
	readonly paused: boolean;
	/** "2 h ago", "on 5 Nov": a moment in the reader's words. */
	readonly when: (iso: string) => string;
}

/** Null for a project that never had a Reverse-Specification. */
export function lastRunOf(input: LastRunInput): LastRun | null {
	const { status, doc, when } = input;
	const run = currentRun(doc);
	const state = stateOf(status, input.paused);
	if (!state) return null;
	const started = run && !run.implicit ? ` · started ${when(run.startedAt)}` : '';
	return {
		state,
		title: `Reverse-Specification of ${input.productName.trim() || 'this product'}`,
		source: `${RUN_SOURCE_LABEL[runSourceOf(run, input.rebuiltFrom)]}${started}`,
		detail: detailOf(state, input)
	};
}

function stateOf(status: RetrospecStatus, paused: boolean): LastRunState | null {
	switch (status.status) {
		case 'start':
			return null;
		case 'source':
			return 'not_launched';
		case 'running':
			return paused ? 'paused' : 'running';
		case 'bilan':
			return status.ending && 'closedAtPct' in status.ending ? 'partial' : 'complete';
		case 'review':
			return 'review';
		case 'done':
			return 'validated';
	}
}

function detailOf(state: LastRunState, { status, doc, when }: LastRunInput): string {
	const run = currentRun(doc);
	const ending = status.ending ?? null;
	switch (state) {
		case 'running':
			return `${status.pct} % read`;
		case 'paused':
			return `Stopped at ${status.pct} %: your LLM stopped calling Lyriks`;
		case 'partial': {
			const pct = ending && 'closedAtPct' in ending ? ending.closedAtPct : status.pct;
			const by = run?.analysisEndedBy?.name ? ` by ${run.analysisEndedBy.name}` : '';
			return `Closed${by} at ${pct} %, before Lyriks ran its final check`;
		}
		case 'complete':
			return ending && 'checkedAt' in ending ? `Lyriks ran its final check ${when(ending.checkedAt)}. Ready to review` : 'Lyriks ran its final check. Ready to review';
		case 'review': {
			const counts = reviewCounts(run);
			return `${counts.validated} of ${counts.total} validated`;
		}
		case 'validated': {
			const by = run?.publishedBy?.name ? ` by ${run.publishedBy.name}` : '';
			return `Validated${by}${run?.publishedAt ? ` ${when(run.publishedAt)}` : ''}`;
		}
		case 'not_launched':
			return 'The prompt was not run yet';
	}
}
