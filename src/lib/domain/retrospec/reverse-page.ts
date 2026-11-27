import type { RetrospecMode, RetrospecScope, RunResume } from './document';
import { shortCommit } from './run-history';
import { phaseLabels } from './source-prompt';
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

/**
 * How much of the product a run reads (criterion 25254e5a): all of it for the
 * first time, what changed, all of it again, or where the last run stopped
 * (EVO-014): the phases it never reached and the code changed since its commit.
 */
export type RunReach =
	| { readonly kind: 'first' }
	| { readonly kind: 'delta'; readonly fromCommit: string | null; readonly handEdits: number }
	| { readonly kind: 'whole' }
	| { readonly kind: 'resume'; readonly left: readonly string[]; readonly fromCommit: string | null };

const FIRST_RUN: RunReach = { kind: 'first' };

/** The reach of a run, from what it records of the specification it starts from: none for a first run. */
export function runReach(
	complementary: { readonly fromCommit: string | null; readonly scope: RetrospecScope; readonly handEdits?: number; readonly resumable?: RunResume | null } | null | undefined
): RunReach {
	if (!complementary) return FIRST_RUN;
	if (complementary.scope === 'resume' && complementary.resumable) return { kind: 'resume', left: complementary.resumable.left, fromCommit: complementary.resumable.fromCommit };
	return complementary.scope === 'whole' ? { kind: 'whole' } : { kind: 'delta', fromCommit: complementary.fromCommit, handEdits: complementary.handEdits ?? 0 };
}

/** What the run reads, as a sentence names it. */
function readObject(productName: string, mode: RetrospecMode, reach: RunReach): string {
	if (reach.kind === 'delta') return `what changed in ${READS[mode]} of ${productName}`;
	if (reach.kind === 'whole') return `all of ${READS[mode]} of ${productName} again`;
	if (reach.kind === 'resume') return `the rest of ${READS[mode]} of ${productName}, where the last run stopped`;
	return `${READS[mode]} of ${productName}`;
}

/** The phases a Resume analysis still reads, then the final check, and the code changed since the commit it starts from. */
function resumeLine(mode: RetrospecMode, reach: Extract<RunReach, { kind: 'resume' }>): string {
	const left = phaseLabels(reach.left, mode);
	const since = reach.fromCommit && mode !== 'docs' ? `, and what changed in the code since commit ${shortCommit(reach.fromCommit)}` : '';
	return `${left.length > 0 ? `${left.join(', ')}, then the final check` : 'The final check'}${since}`;
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
	return held ? `${line} Nothing is written before you validate it on Mismatch and click Write the validated changes: Lyriks then writes it.` : line;
}

function readScope(mode: RetrospecMode, reach: RunReach): string {
	if (reach.kind === 'first') return 'The whole product, read for the first time.';
	// Criterion c54ce677 of feat-144 (EVO-014).
	if (reach.kind === 'resume') return `Where the last run stopped: ${resumeLine(mode, reach)}. What it already read is not read again.`;
	if (reach.kind === 'whole') return 'The whole product again, from the specification already gathered. Nothing is erased.';
	const hand = reach.handEdits > 0 ? `, with ${reach.handEdits === 1 ? 'the change' : `the ${reach.handEdits} changes`} made by hand in the specification` : '';
	return `${deltaStart(mode, reach.fromCommit)}${hand}. The rest of the specification is not read again.`;
}

/** What the celebration says Lyriks did, with the share of it the code holds when the index was synced. */
export function celebrationLine(productName: string, mode: RetrospecMode, reach: RunReach, code: number | null, held = false): string {
	const what = readObject(productName, mode, reach);
	if (held) return `Lyriks has read ${what}. Nothing is written yet: validate what it found on Mismatch, then Write the validated changes has Lyriks write it.`;
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
	const read =
		reach.kind === 'first'
			? `${pct} % of ${READS[mode]} of ${productName}`
			: reach.kind === 'delta'
				? `part of what changed in ${READS[mode]} of ${productName}`
				: reach.kind === 'resume'
					? `part of what the last run left of ${READS[mode]} of ${productName}`
					: `part of ${READS[mode]} of ${productName} again`;
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
 * The confirmation of a launch (criterion bf0ea80c, EVO-014): Run it with my AI
 * on Mismatch, or Relaunch the analysis on Reverse. A later run starts from
 * what is already gathered and erases nothing; the message says what the
 * option reads: what changed (since the commit the last validated run recorded
 * when there is one), the whole product again, or where the last run stopped.
 * `closesRun` says the last run is not validated, so the person knows what
 * becomes of it; `choiceNext` says the Source step of Reverse lets them choose
 * otherwise.
 */
export function relaunchQuestion(
	next: NextRun,
	closesRun = false,
	reach?: RunReach,
	choiceNext = false,
	mode: RetrospecMode = 'repo'
): { readonly title: string; readonly message: string } {
	const closing = closesRun ? ' The last run is not validated: it closes and stays in the history, and the validations already given are kept.' : '';
	if (!next.complementary)
		return {
			title: 'Launch a new Reverse-Specification?',
			message: 'Lyriks reads the product and builds its specification. The specification goes back to validation until your team validates the run.'
		};
	const start = 'Your AI starts from the specification already gathered and erases nothing:';
	const later = choiceNext ? ' You can choose otherwise on the next step.' : '';
	const reads =
		reach?.kind === 'whole'
			? 'it reads the whole product again, element by element: it confirms what still holds, completes what is missing and corrects what the product now says otherwise.'
			: reach?.kind === 'resume'
				? `it resumes where the last run stopped: ${resumeLine(mode, reach)}. What was already read is not read again.`
				: next.fromCommit
					? `it reads what changed in the code since commit ${next.fromCommit} and the changes made in the spec by hand.`
					: 'it reads only what is new or changed since in the code and the documentation its elements cite.';
	return { title: 'Launch a complementary Reverse-Specification?', message: `${start} ${reads} Only what it changes goes back to validation.${later}${closing}` };
}

/** One option of what the next run reads, as Mismatch's head and Reverse's Source step offer it (EVO-014, criteria 04f3bc85, 1f1f4ca8). */
export interface ScopeOption {
	readonly scope: RetrospecScope;
	readonly title: string;
	readonly sub: string;
	/** Why it cannot be ticked, when it cannot. */
	readonly unavailable: string | null;
}

/** The words of each option, the same on Mismatch and on Reverse. */
export const SCOPE_TITLES: Readonly<Record<RetrospecScope, string>> = { whole: 'Full analysis', delta: 'Delta analysis', resume: 'Resume analysis' };

/**
 * What the next run may read (EVO-014): Full analysis always; Delta analysis,
 * greyed on a product with no specification yet; Resume analysis only after a
 * run closed before its final check.
 */
export function scopeOptions(gathered: boolean, resumable: boolean): ScopeOption[] {
	const options: ScopeOption[] = [
		{ scope: 'delta', title: SCOPE_TITLES.delta, sub: 'Only what is new or changed since the last run. Erases nothing.', unavailable: gathered ? null : 'Nothing to compare yet: the product has no specification.' },
		{ scope: 'whole', title: SCOPE_TITLES.whole, sub: gathered ? 'Everything, from the specification gathered: confirms, completes, corrects. Erases nothing.' : 'The whole product, read for the first time.', unavailable: null }
	];
	if (resumable) options.push({ scope: 'resume', title: SCOPE_TITLES.resume, sub: 'Where the last run stopped: the phases it never reached, then the final check. What it read is not read again.', unavailable: null });
	return options;
}
