import type { RetrospecMode, RetrospecScope } from './document';
import { shortCommit } from './run-history';
import type { RetrospecStatusKind } from './status';

/**
 * The words of the Reverse page that are not a run's own (criterion 2dbed801):
 * the line under its title, and the question asked before the next run starts.
 * Pure, so both are tested without a page.
 */

const READS: Readonly<Record<RetrospecMode, string>> = {
	repo: 'the code',
	docs: 'the documentation',
	both: 'the code and the documentation'
};

const CITED: Readonly<Record<RetrospecMode, string>> = {
	repo: 'the code',
	docs: 'the documents',
	both: 'the code and the documents'
};

/** How much of the product a run reads (criterion 25254e5a): all of it for the first time, what changed, or all of it again. */
export type RunReach = { readonly kind: 'first' } | { readonly kind: 'delta'; readonly fromCommit: string | null; readonly handEdits: number } | { readonly kind: 'whole' };

const FIRST_RUN: RunReach = { kind: 'first' };

/** The reach of a run, from what it records of the specification it starts from: none for a first run. */
export function runReach(complementary: { readonly fromCommit: string | null; readonly scope: RetrospecScope; readonly handEdits?: number } | null | undefined): RunReach {
	if (!complementary) return FIRST_RUN;
	return complementary.scope === 'whole' ? { kind: 'whole' } : { kind: 'delta', fromCommit: complementary.fromCommit, handEdits: complementary.handEdits ?? 0 };
}

/** What the run reads, as a sentence names it. */
function readObject(productName: string, mode: RetrospecMode, reach: RunReach): string {
	if (reach.kind === 'delta') return `what changed in ${READS[mode]} of ${productName}`;
	if (reach.kind === 'whole') return `all of ${READS[mode]} of ${productName} again`;
	return `${READS[mode]} of ${productName}`;
}

/** What the page does, in one line under its title. */
export function reverseLead(productName: string, mode: RetrospecMode, reach: RunReach = FIRST_RUN): string {
	const what = readObject(productName, mode, reach);
	return reach.kind === 'first' ? `Lyriks reads ${what} and rebuilds its specification: features, rules and users.` : `Lyriks reads ${what} and brings its specification up to date.`;
}

/** The title of the board while the AI reads. */
export const liveTitle = (productName: string, mode: RetrospecMode, reach: RunReach): string => `Lyriks is reading ${readObject(productName, mode, reach)}`;

/** Where the delta of a later run starts from: the commit for the code, what the specification cites otherwise. */
function deltaStart(mode: RetrospecMode, fromCommit: string | null): string {
	if (!fromCommit || mode === 'docs') return `What is new, and what changed in ${CITED[mode]} the specification cites`;
	const since = `What changed in the code since commit ${shortCommit(fromCommit)}`;
	return mode === 'both' ? `${since}, and what is new or changed in the documents the specification cites` : since;
}

/** The Scope line of the board: what this run reads, from the moment it runs to its summary. */
export function scopeLine(mode: RetrospecMode, reach: RunReach, held = false): string {
	const line = readScope(mode, reach);
	return held ? `${line} Nothing is written before you validate it on Mismatch.` : line;
}

function readScope(mode: RetrospecMode, reach: RunReach): string {
	if (reach.kind === 'first') return 'The whole product, read for the first time.';
	if (reach.kind === 'whole') return 'The whole product again, from the specification already gathered. Nothing is erased.';
	const hand = reach.handEdits > 0 ? `, with ${reach.handEdits === 1 ? 'the change' : `the ${reach.handEdits} changes`} made by hand in the specification` : '';
	return `${deltaStart(mode, reach.fromCommit)}${hand}. The rest of the specification is not read again.`;
}

/** What the celebration says Lyriks did, with the share of it the code holds when the index was synced. */
export function celebrationLine(productName: string, mode: RetrospecMode, reach: RunReach, code: number | null, held = false): string {
	const what = readObject(productName, mode, reach);
	if (held) return `Lyriks has read ${what}. Nothing is written yet: what it found waits for you on Mismatch.`;
	const found = code !== null ? `: ${code} % of it is found in the code` : '';
	return reach.kind === 'first' ? `Lyriks has read ${what} and rebuilt its specification${found}.` : `Lyriks has read ${what} and brought its specification up to date${found}.`;
}

/** What the head of a run's summary reads (criterion a05bca06): whole once Lyriks ran its final check, partial otherwise. */
export type ReadingEnd = { readonly whole: true; readonly title: string } | { readonly whole: false; readonly pct: number; readonly title: string; readonly line: string };

export interface ReadingEndInput {
	readonly productName: string;
	readonly mode: RetrospecMode;
	/** How much of the product the run read; a first run when absent. */
	readonly reach?: RunReach;
	/** Lyriks ran its final check on this run. */
	readonly checked: boolean;
	/** The share of the product the reading reached. */
	readonly pct: number;
	/** A person closed the analysis before the final check (Mark the analysis as finished). */
	readonly closed: boolean;
	readonly closedBy: string | null;
}

/**
 * How far the reading of a run went, once its analysis is over: the summary
 * never claims the product was read whole when the analysis was closed, or its
 * review started, before Lyriks ran its final check. A partial run reads with
 * the words Home gives it (criterion a0959413). A later run says what it read;
 * its share counts the sections it wrote and not what changed, so its title
 * says part (criterion 25254e5a).
 */
export function readingEnd({ productName, mode, reach = FIRST_RUN, checked, pct, closed, closedBy }: ReadingEndInput): ReadingEnd {
	if (checked) return { whole: true, title: `Lyriks has read ${readObject(productName, mode, reach)}` };
	const by = closedBy ? ` by ${closedBy}` : '';
	const read = reach.kind === 'first' ? `${pct} % of ${READS[mode]} of ${productName}` : reach.kind === 'delta' ? `part of what changed in ${READS[mode]} of ${productName}` : `part of ${READS[mode]} of ${productName} again`;
	return {
		whole: false,
		pct,
		title: `Lyriks read ${read}`,
		line: closed ? `Closed${by} at ${pct} %, before Lyriks ran its final check.` : `The review started at ${pct} %, before Lyriks ran its final check.`
	};
}

/** The analysis of the last run is over: it is ready to review, in review or validated. */
export function analysisOver(status: RetrospecStatusKind): boolean {
	return status === 'bilan' || status === 'review' || status === 'done';
}

/**
 * Relaunch the analysis is offered (action e296dd4f) to who may edit the
 * project, once the analysis of the last run is over: while it waits for its
 * prompt or its AI reads, the page is that run.
 */
export function relaunchOffered(canEdit: boolean, status: RetrospecStatusKind): boolean {
	return canEdit && analysisOver(status);
}

/** What the next run reads, as nextRunReads says it. */
export type NextRun = { readonly complementary: true; readonly fromCommit: string | null } | { readonly complementary: false };

/**
 * The confirmation of Relaunch the analysis. A later run starts from what is
 * already gathered and erases nothing: it reads the delta, since the commit
 * the last validated run recorded when there is one. `closesRun` says the last
 * run is not validated, so the person knows what becomes of it.
 */
export function relaunchQuestion(next: NextRun, closesRun = false): { readonly title: string; readonly message: string } {
	const closing = closesRun ? ' The last run is not validated: it closes and stays in the history, and the validations already given are kept.' : '';
	if (!next.complementary)
		return {
			title: 'Launch a new Reverse-Specification?',
			message: 'Lyriks reads the product and builds its specification. The specification goes back to validation until your team validates the run.'
		};
	return {
		title: 'Launch a complementary Reverse-Specification?',
		message:
			(next.fromCommit
				? `Your AI starts from the specification already gathered and erases nothing: it reads what changed in the code since commit ${next.fromCommit} and the changes made in the spec by hand, or, if you choose so next, the whole product again. Only what it changes goes back to validation.`
				: 'Your AI starts from the specification already gathered and erases nothing: it reads only what is new or changed since in the code and the documentation its elements cite, or, if you choose so next, the whole product again. Only what it changes goes back to validation.') + closing
	};
}
