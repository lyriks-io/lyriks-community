import type { ActContext, RetrospecAct } from './acts';
import type { PersonRef, RetrospecDocument, RetrospecRun } from './document';
import { openChanges, sameChange, type ChangeVerdict, type RunReport } from './run-report';

/**
 * The history of what was done on Mismatch and by the runs it reports
 * (criterion 64d191d6 of feat-fb747-traceability). It sits on the document and
 * not on a run because cancelling a run removes it, and it only ever grows: a
 * decision taken back reads as one more line, never as a line gone. Each act
 * that took effect adds its lines where acts are applied, so no path can act
 * without leaving one. Pure.
 */

export const HISTORY_ACTIONS = [
	'analysis_launched',
	'scope_chosen',
	'prompt_received',
	'commit_recorded',
	'changes_reported',
	'reading_ended',
	'analysis_closed',
	'change_validated',
	'change_reverted',
	'change_rejected',
	'decision_taken_back',
	'change_reworked',
	'change_withdrawn',
	'writing_opened',
	'change_written',
	'report_closed',
	'run_cancelled',
	'run_validated',
	'code_change_accepted',
	'code_change_rejected',
	'code_change_undone',
	'hand_edit',
	'hand_edit_cancelled',
	'hand_edit_kept',
	'hand_edits_checked'
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
const isHistoryAction = (v: unknown): v is HistoryAction => HISTORY_ACTIONS.includes(v as HistoryAction);

export interface HistoryEntry {
	readonly at: string;
	readonly by: PersonRef;
	readonly action: HistoryAction;
	/** What it bore on, in the words of the product; '' when the line names nothing. */
	readonly subject: string;
	readonly count: number;
	/** What the action said: what must change, the words of a rework, what a run reads. */
	readonly note: string;
}

type Fact = Pick<HistoryEntry, 'action'> & Partial<Pick<HistoryEntry, 'subject' | 'count' | 'note'>>;

const VERDICT_ACTION: Readonly<Record<ChangeVerdict, HistoryAction>> = { validated: 'change_validated', reverted: 'change_reverted', rejected: 'change_rejected' };

function reportFacts(report: RunReport, act: Extract<RetrospecAct, { op: 'report_changes' }>): Fact[] {
	const fresh = act.changes.filter((c) => !report[c.id] || !sameChange(report[c.id], c));
	const reworked = fresh.filter((c) => report[c.id]?.decision?.verdict === 'rejected');
	const others = fresh.length - reworked.length;
	return [...(others > 0 ? [{ action: 'changes_reported' as const, count: others }] : []), ...reworked.map((c) => ({ action: 'change_reworked' as const, subject: c.title, note: c.proposed }))];
}

function decisionFacts(report: RunReport, act: Extract<RetrospecAct, { op: 'decide_change' }>): Fact[] {
	const change = report[act.id];
	if (!change) return [];
	if (!act.verdict) return change.decision ? [{ action: 'decision_taken_back', subject: change.title, note: change.decision.verdict }] : [];
	const note = act.verdict === 'rejected' ? (act.note?.trim() ?? '') : '';
	if (change.decision?.verdict === act.verdict && (change.decision.note ?? '') === note) return [];
	return [{ action: VERDICT_ACTION[act.verdict], subject: change.title, note }];
}

/** The lines an act that took effect adds. Reading acts and the review in Knowledge add none. */
function factsOf(before: RetrospecDocument, after: RetrospecDocument, act: RetrospecAct, run: RetrospecRun | null): Fact[] {
	const report = run?.report ?? {};
	const editTitle = (itemId: string) => {
		const edit = before.specEdits?.[itemId];
		return edit?.after.text || edit?.title || itemId;
	};
	switch (act.op) {
		case 'start':
			return [{ action: 'analysis_launched', note: after.runs.at(-1)?.complementary?.scope ?? 'first' }];
		case 'choose_scope':
			return run?.complementary?.scope === act.scope ? [] : [{ action: 'scope_chosen', note: act.scope }];
		case 'launch':
			return [{ action: 'prompt_received' }];
		case 'record_commit':
			return [{ action: 'commit_recorded', subject: act.sha.trim().slice(0, 7) }];
		case 'report_changes':
			return reportFacts(report, act);
		case 'withdraw_changes':
			return act.ids.map((id) => ({ action: 'change_withdrawn' as const, subject: report[id]?.title ?? id }));
		case 'end_reading':
			return run?.readingDoneAt ? [] : [{ action: 'reading_ended', count: Object.keys(report).length }];
		case 'end_analysis':
			return [{ action: 'analysis_closed' }];
		case 'decide_change':
			return decisionFacts(report, act);
		case 'validate_changes':
			return openChanges(report, act.ids).map((c) => ({ action: 'change_validated' as const, subject: c.title }));
		case 'open_writing':
			return run?.writingOpenedAt ? [] : [{ action: 'writing_opened', count: Object.values(report).filter((c) => c.decision?.verdict === 'validated').length }];
		case 'record_written':
			return act.written.map((w) => ({ action: 'change_written' as const, subject: report[w.change]?.title ?? w.change }));
		case 'cancel':
			return [{ action: run?.holds && run.readingDoneAt ? 'report_closed' : 'run_cancelled' }];
		case 'publish':
			return [{ action: 'run_validated' }];
		case 'keep_drift':
			return [{ action: 'code_change_accepted', subject: act.title ?? act.key }];
		case 'send_back_drift':
			return [{ action: 'code_change_rejected', subject: act.title ?? act.key }];
		case 'undo_drift':
			return [{ action: 'code_change_undone', subject: act.title ?? act.key }];
		case 'edit':
			return act.change && run?.publishedAt ? [{ action: 'hand_edit', subject: act.title }] : [];
		case 'cancel_spec_edit':
			return [{ action: 'hand_edit_cancelled', subject: editTitle(act.itemId) }];
		case 'keep_spec_edit':
			return [{ action: 'hand_edit_kept', subject: editTitle(act.itemId) }];
		case 'check_spec_edits':
			return [{ action: 'hand_edits_checked', count: act.reports.length }];
		default:
			return [];
	}
}

/** The document after an act, with the lines that act adds to the history; an act that changed nothing adds none. */
export function withActionHistory(before: RetrospecDocument, after: RetrospecDocument, act: RetrospecAct, ctx: ActContext): RetrospecDocument {
	if (after === before) return after;
	const facts = factsOf(before, after, act, before.runs.at(-1) ?? null);
	if (facts.length === 0) return after;
	const lines = facts.map((f): HistoryEntry => ({ at: ctx.now, by: ctx.actor, action: f.action, subject: f.subject ?? '', count: f.count ?? 0, note: f.note ?? '' }));
	return { ...after, history: [...(after.history ?? []), ...lines] };
}

/** One line of the history as an administrator reads it. */
export interface HistoryLine {
	readonly at: string;
	/** Who acted: the person, or Lyriks for what their AI did (criterion ccaa0784 of feat-ai-session). */
	readonly who: string;
	/** Whose AI it was, when Lyriks acted. */
	readonly through: string | null;
	readonly what: string;
	readonly note: string | null;
}

const ACTED_BY_THE_AI: ReadonlySet<HistoryAction> = new Set(['prompt_received', 'commit_recorded', 'changes_reported', 'reading_ended', 'change_reworked', 'change_withdrawn', 'change_written', 'hand_edits_checked']);

const VERDICT_READ: Readonly<Record<string, string>> = { validated: 'Validated', reverted: 'Revert requested', rejected: 'Rejected' };
const many = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function launchedWhat(scope: string): string {
	if (scope === 'delta') return 'launched a delta analysis';
	if (scope === 'whole') return 'launched a full analysis';
	if (scope === 'resume') return 'launched a resume analysis';
	return 'started the first Reverse-Specification';
}

function whatOf({ action, subject, count, note }: HistoryEntry): string {
	const named = `“${subject}”`;
	switch (action) {
		case 'analysis_launched':
			return launchedWhat(note);
		case 'scope_chosen':
			return note === 'whole' ? 'chose to read the whole product' : note === 'resume' ? 'chose to resume where the last run stopped' : 'chose to read only what changed';
		case 'prompt_received':
			return 'received the prompt';
		case 'commit_recorded':
			return `read the code at commit ${subject}`;
		case 'changes_reported':
			return `reported ${many(count, 'difference')}`;
		case 'reading_ended':
			return `finished reading, ${many(count, 'difference')} to decide`;
		case 'analysis_closed':
			return 'closed the analysis';
		case 'change_validated':
			return `validated ${named}`;
		case 'change_reverted':
			return `reverted ${named}: the code goes back to the specification`;
		case 'change_rejected':
			return `rejected ${named}`;
		case 'decision_taken_back':
			return `took back the decision on ${named}`;
		case 'change_reworked':
			return `reworked ${named}`;
		case 'change_withdrawn':
			return `withdrew ${named}: it was not a change`;
		case 'writing_opened':
			return `opened the writing of ${many(count, 'validated change')}`;
		case 'change_written':
			return `wrote ${named} into the specification`;
		case 'report_closed':
			return 'closed the report: nothing was written';
		case 'run_cancelled':
			return 'cancelled the Reverse-Specification';
		case 'run_validated':
			return 'validated the Reverse-Specification';
		case 'code_change_accepted':
			return `accepted the code change on ${named} into the specification`;
		case 'code_change_rejected':
			return `rejected the code change on ${named}: the code must follow the specification`;
		case 'code_change_undone':
			return `undid the decision on the code change ${named}`;
		case 'hand_edit':
			return `changed ${named} by hand`;
		case 'hand_edit_cancelled':
			return `cancelled the hand edit of ${named}`;
		case 'hand_edit_kept':
			return `kept the specification on ${named}: the code must follow`;
		case 'hand_edits_checked':
			return `read the code against ${many(count, 'hand edit')}`;
	}
}

function noteOf({ action, note }: HistoryEntry): string | null {
	if (action === 'decision_taken_back') return `It read ${VERDICT_READ[note] ?? note}.`;
	if (action === 'change_rejected' || action === 'change_reworked') return note || null;
	return null;
}

/** The history, newest first: it is appended to in the order acts happen, so two acts of one instant stay in order. */
export function historyLines(doc: RetrospecDocument): HistoryLine[] {
	return (doc.history ?? []).toReversed().map((entry) => {
		const ai = ACTED_BY_THE_AI.has(entry.action);
		return { at: entry.at, who: ai ? 'Lyriks' : entry.by.name, through: ai ? entry.by.name : null, what: whatOf(entry), note: noteOf(entry) };
	});
}

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Read a stored history; a line that does not read whole is left out. */
export function parseHistory(raw: unknown): HistoryEntry[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((value): HistoryEntry[] => {
		const o = (value !== null && typeof value === 'object' ? value : {}) as Raw;
		const by = (o.by !== null && typeof o.by === 'object' ? o.by : {}) as Raw;
		const at = str(o.at);
		if (!at || !str(by.id) || !isHistoryAction(o.action)) return [];
		return [{ at, by: { id: str(by.id), name: str(by.name) || str(by.id) }, action: o.action, subject: str(o.subject), count: typeof o.count === 'number' ? o.count : 0, note: str(o.note) }];
	});
}
