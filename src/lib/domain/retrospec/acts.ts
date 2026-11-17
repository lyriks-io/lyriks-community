import { withActionHistory } from './action-history';
import { recordRevalidation, type RevalidationInput } from './revalidations';
import { openChanges, reportCounts, reportedAgain, type ChangeVerdict, type ReportedChange, type ReportedChangeInput } from './run-report';
import { sectionRevision } from './progress';
import { parseDocsLocation, type DocsLocation } from './docs-location';
import {
	currentRun,
	isRetrospecMode,
	isRetrospecScope,
	lastPublishedRun,
	type CarriedValidation,
	type ItemComment,
	type ItemVerdict,
	type PersonRef,
	type RetrospecDocument,
	type RetrospecMode,
	type RetrospecRun,
	type RetrospecScope
} from './document';
import {
	checkSpecEdits,
	dropSpecEdit,
	keepSpecEdit,
	recordSpecEdit,
	settleSpecEditsAtValidation,
	type SpecEditChange,
	type SpecEditReport
} from './spec-edits';

/**
 * What a person does on a retrospecification, one act at a time. Every act is
 * checked against where the run stands and answers either the document as it
 * now reads or the sentence that says why it was refused. Pure: the caller
 * stores the result under the document's revision.
 */
export type RetrospecAct =
	/**
	 * Begin a run (or a new one once the analysis of the last is over): the baseline
	 * is the specification's revisions now, `fingerprints` what each element reads
	 * now, against which validations are carried when the last validated run
	 * recorded none, and, with `titles`, what a later run's changes are read
	 * against (criterion 03192a6e). `closesRun` is the caller's reading that the analysis of the
	 * last run is over: a run not validated then closes instead of refusing the start.
	 */
	| {
			readonly op: 'start';
			readonly mode: RetrospecMode;
			readonly baseline: Readonly<Record<string, number>>;
			readonly fingerprints?: Readonly<Record<string, string>>;
			readonly titles?: Readonly<Record<string, string>>;
			/** What a later run reads by default (criterion 98612117); the delta when omitted. */
			readonly scope?: RetrospecScope;
			readonly closesRun?: boolean;
	  }
	| { readonly op: 'choose_mode'; readonly mode: RetrospecMode }
	/** A later run reads what changed or the whole product again, until its prompt runs (criterion 98612117). */
	| { readonly op: 'choose_scope'; readonly scope: RetrospecScope }
	/** Where the documentation the run reads is: on this computer or at links, until the prompt runs (criterion b6ad9ca2). */
	| { readonly op: 'choose_docs'; readonly at: DocsLocation }
	/** The run's AI received the prompt, or the person said so on the last step of creating the project. */
	| { readonly op: 'launch' }
	/** The person closes an analysis the AI never ended with its final check. */
	| { readonly op: 'end_analysis' }
	/** The person takes back a run not yet in review, as if it had never started (criterion 0ec7551b). */
	| { readonly op: 'cancel' }
	| { readonly op: 'start_review'; readonly total: number }
	| { readonly op: 'validate'; readonly itemId: string; readonly title: string; readonly tab: string; readonly total?: number }
	| { readonly op: 'withdraw'; readonly itemId: string; readonly total?: number }
	| { readonly op: 'reject'; readonly itemId: string; readonly title: string; readonly tab: string; readonly total?: number }
	| { readonly op: 'set_aside'; readonly itemId: string; readonly title: string; readonly tab: string; readonly total?: number }
	| { readonly op: 'share'; readonly itemId: string; readonly title: string; readonly tab: string; readonly to: PersonRef; readonly total?: number }
	/** Lift a rejection, a set-aside or a share. */
	| { readonly op: 'clear_flag'; readonly itemId: string; readonly total?: number }
	| { readonly op: 'comment'; readonly itemId: string; readonly commentId: string; readonly text: string }
	| { readonly op: 'resolve_comment'; readonly itemId: string; readonly commentId: string }
	/** Publish the run; `baselineId` names the specification baseline captured for it. */
	| {
			readonly op: 'publish';
			readonly baselineId: string | null;
			/** The team to tell the specification is validated. */
			readonly notify?: readonly PersonRef[];
			/** What the code reads for each element now: the reference for the changes made outside Lyriks. */
			readonly code?: Readonly<Record<string, string>>;
			/** What each element reads now: what the next complementary run carries validations against. */
			readonly fingerprints?: Readonly<Record<string, string>>;
	  }
	/** The person asks to be told in the app when the analysis finishes; `cancel_notify` takes it back. */
	| { readonly op: 'ask_notify' }
	| { readonly op: 'cancel_notify' }
	/** Remind a validator an element waits on. */
	| { readonly op: 'remind'; readonly itemId: string; readonly title: string; readonly to: PersonRef }
	/** Add or cancel one additional question reviewer without replacing its defaults. */
	| { readonly op: 'request_validation' | 'cancel_validation_request'; readonly itemId: string; readonly title: string; readonly to: PersonRef }
	/**
	 * The person edited an element: they are its last author, and the others must
	 * look at it again. On a validated specification `change` says what it read
	 * before and now, and the edit is followed instead (criterion 611e98cb).
	 */
	| {
			readonly op: 'edit';
			readonly itemId: string;
			readonly title: string;
			readonly change?: SpecEditChange;
			/** On a draft: what the element read before the write and reads after it, so a validated version is kept. */
			readonly revalidate?: RevalidationInput;
	  }
	/** A hand edit of a validated specification is cancelled; the caller wrote the text before back first. */
	| { readonly op: 'cancel_spec_edit'; readonly itemId: string }
	/** The code contradicts a hand edit and the person keeps the specification: the code must follow. */
	| { readonly op: 'keep_spec_edit'; readonly itemId: string }
	/** The run's AI reports the commit it read (criterion c50587fb). */
	| { readonly op: 'record_commit'; readonly sha: string; readonly repository: string | null }
	/** The run's AI reports what the code says of each hand edit (criterion 23397c95). */
	| { readonly op: 'check_spec_edits'; readonly reports: readonly SpecEditReport[] }
	/** A change made in the code outside Lyriks is kept in the specification (`baselineId`: the version it made). */
	| { readonly op: 'keep_drift'; readonly key: string; readonly code: string; readonly baselineId: string | null; readonly title?: string }
	/** A change made in the code outside Lyriks is sent back: the code must follow the specification. */
	| { readonly op: 'send_back_drift'; readonly key: string; readonly code: string; readonly title?: string }
	/**
	 * The decision on a change made in the code outside Lyriks is taken back: it
	 * reads to review again. A version a keep captured stays in the history, since
	 * a frozen version never changes (criterion 537e1684).
	 */
	| { readonly op: 'undo_drift'; readonly key: string; readonly title?: string }
	/** The AI of a run that holds its changes reports what it found instead of writing it (criterion 50b00229). */
	| { readonly op: 'report_changes'; readonly changes: readonly ReportedChangeInput[] }
	/** That AI read what it had to read: the report is there to decide. */
	| { readonly op: 'end_reading' }
	/** The AI takes off the report a change a person rejected as not being a change at all (criterion eb132bbd). */
	| { readonly op: 'withdraw_changes'; readonly ids: readonly string[] }
	/** A person validates, reverts or rejects a change of the report, or takes the decision back with null (criterion 42311513). A rejection says what must change. */
	| { readonly op: 'decide_change'; readonly id: string; readonly verdict: ChangeVerdict | null; readonly note?: string }
	/**
	 * "Validate all" (criterion 42311513): a person validates, in one act, the
	 * changes they saw still open, however many. Named rather than "every open
	 * change", so a change reported again meanwhile is never validated unseen.
	 */
	| { readonly op: 'validate_changes'; readonly ids: readonly string[] }
	/** A person sends what was validated to their AI (criterion 1aaa8316). */
	| { readonly op: 'open_writing' }
	/** The AI says which elements each validated change became: they read validated by who validated it. */
	| { readonly op: 'record_written'; readonly written: readonly WrittenChange[] }
	/** The AI wrote the behaviour of a feature (recorded once, the first time). */
	| { readonly op: 'behavior_authored'; readonly featureId: string };

/** The elements of the specification a validated change became. */
export interface WrittenChange {
	readonly change: string;
	readonly elements: readonly { readonly anchor: string; readonly title: string }[];
}

export interface ActContext {
	readonly actor: PersonRef;
	readonly now: string;
	/** The actor gives only their assigned personal review and never becomes the implicit lead. */
	readonly reviewOnly?: boolean;
	/** Rechecked against the current document on every optimistic-save rebase. */
	readonly canReview?: (doc: RetrospecDocument, itemId: string) => boolean;
	/** The publication gate is evaluated again if concurrent review changes require a rebase. */
	readonly canPublish?: (doc: RetrospecDocument) => boolean;
}

export type ActOutcome = { readonly ok: true; readonly doc: RetrospecDocument } | { readonly ok: false; readonly reason: string };

/** The longest comment kept: a discussion line, never a document. */
export const COMMENT_MAX_LENGTH = 4000;

const refuse = (reason: string): ActOutcome => ({ ok: false, reason });
const same = (a: PersonRef, b: PersonRef) => a.id.trim().toLowerCase() === b.id.trim().toLowerCase();

/** The specification already holds what an earlier run or the AI gathered: its sources, its scope or its features were written. */
export const gatheredIn = (baseline: Readonly<Record<string, number>>): boolean =>
	(['documents', 'scope', 'features'] as const).some((s) => sectionRevision(baseline, s) > 0);

/**
 * What a later run reads unless the person chooses otherwise (criterion
 * 98612117): the whole product again when the last run was closed by a person
 * before its AI's final check, or when no delta can be read (no commit to
 * start from and no source text stored); what changed otherwise.
 */
export function defaultScope(doc: RetrospecDocument, auditTimes: readonly string[], storesText: boolean): RetrospecScope {
	const last = doc.runs.at(-1) ?? null;
	const closedShort = !!last?.analysisEndedAt && !auditTimes.some((at) => at >= last.startedAt);
	const noDelta = !lastPublishedRun(doc)?.commit && !storesText;
	return closedShort || noDelta ? 'whole' : 'delta';
}

/** The commit the next run reads the delta from: the last validated run's, for a run that reads the code. */
const deltaCommit = (doc: RetrospecDocument, mode: RetrospecMode): string | null => {
	const last = lastPublishedRun(doc);
	return last?.commit && mode !== 'docs' ? last.commit.sha : null;
};

/**
 * Why the current run cannot be cancelled, or null when it can (criterion
 * 0ec7551b of feat-ai-session). A later run can be until its review starts: the
 * specification it reads stays in place, and what its AI already wrote stays in
 * it. A first run only before its prompt runs: once its AI reads, there is no
 * specification to go back to, and closing the analysis by hand ends it instead.
 */
export function cancelRefusal(doc: RetrospecDocument): string | null {
	const run = currentRun(doc);
	if (!run || run.implicit) return 'No Reverse-Specification was started from its page: there is nothing to cancel.';
	if (run.publishedAt) return 'This Reverse-Specification is validated: it can no longer be cancelled.';
	if (run.reviewStartedAt) return 'The review of this Reverse-Specification has started: it can no longer be cancelled.';
	if (!run.complementary && run.launchedAt) return 'Your AI already reads this first Reverse-Specification and there is no specification to go back to: mark the analysis as finished instead.';
	return null;
}

/** What a start knows of the specification as the run begins. */
type StartReading = Pick<Extract<RetrospecAct, { readonly op: 'start' }>, 'fingerprints' | 'titles' | 'scope'>;

/**
 * What a run closed before its validation hands on (criterion 0c87480c): what it
 * carried and what its review validated, standing while each element reads as it
 * does now. An element its review rejected carries nothing.
 */
function carriedPastClosedRun(
	carried: Readonly<Record<string, CarriedValidation>>,
	closed: RetrospecRun,
	now: Readonly<Record<string, string>>
): Record<string, CarriedValidation> {
	const next = { ...carried };
	for (const [id, validation] of Object.entries(closed.carried ?? {})) if (now[id] === validation.fingerprint) next[id] = validation;
	for (const [id, verdict] of Object.entries(closed.verdicts)) {
		if (verdict.flag?.kind === 'rejected') delete next[id];
		else if (now[id] && verdict.validatedBy.length > 0) next[id] = { fingerprint: now[id], validatedBy: verdict.validatedBy };
	}
	return next;
}

/**
 * What a new run starts from (criteria 2dbed801, 0c87480c of feat-ai-session).
 * Every run after the first is complementary, whatever it reads: it starts
 * from the specification already gathered, erases nothing and reads the delta,
 * since the commit the last validated run recorded when there is one. Every
 * validation of that run is carried, standing while its element reads as it
 * did then, or as it read when this run started when that run recorded nothing.
 * Only a product with nothing gathered yet starts with a run of the whole product.
 */
function complementaryStart(
	doc: RetrospecDocument,
	mode: RetrospecMode,
	baseline: Readonly<Record<string, number>>,
	{ fingerprints: startFingerprints = {}, titles = {}, scope = 'delta' }: StartReading
): Pick<RetrospecRun, 'complementary' | 'carried' | 'atStart' | 'holds'> {
	const last = lastPublishedRun(doc);
	const previous = doc.runs.at(-1);
	const closed = previous?.closedAt ? previous : null;
	if (!last && !closed && !gatheredIn(baseline)) return {};
	const reference = last?.fingerprints ?? startFingerprints;
	const carried: Record<string, CarriedValidation> = {};
	for (const [id, verdict] of Object.entries(last?.verdicts ?? {})) {
		const fingerprint = reference[id];
		if (fingerprint && verdict.validatedBy.length > 0 && verdict.flag?.kind !== 'rejected') carried[id] = { fingerprint, validatedBy: verdict.validatedBy };
	}
	return {
		holds: true,
		complementary: { fromRunId: last?.id ?? null, fromCommit: deltaCommit(doc, mode), scope },
		carried: closed ? carriedPastClosedRun(carried, closed, startFingerprints) : carried,
		// Elements that could not be read leave no reference: nothing would then read as new by mistake.
		...(Object.keys(startFingerprints).length > 0 ? { atStart: { fingerprints: startFingerprints, titles } } : {})
	};
}

function newRun(
	doc: RetrospecDocument,
	mode: RetrospecMode,
	baseline: Readonly<Record<string, number>>,
	ctx: ActContext,
	implicit: boolean,
	start: StartReading = {}
): RetrospecRun {
	return {
		...(implicit ? {} : complementaryStart(doc, mode, baseline, start)),
		id: `run-${doc.runs.length + 1}`,
		mode,
		implicit,
		startedAt: ctx.now,
		startedBy: ctx.actor,
		...(implicit && ctx.reviewOnly ? { validationLead: null } : {}),
		baseline: { ...baseline },
		launchedAt: null,
		analysisEndedAt: null,
		analysisEndedBy: null,
		reviewStartedAt: null,
		itemTotal: 0,
		publishedAt: null,
		publishedBy: null,
		baselineId: null,
		verdicts: {}
	};
}

function withRun(doc: RetrospecDocument, run: RetrospecRun): RetrospecDocument {
	const runs = doc.runs.length > 0 && doc.runs[doc.runs.length - 1].id === run.id ? [...doc.runs.slice(0, -1), run] : [...doc.runs, run];
	return { ...doc, runs };
}

/**
 * The run a review acts on. A specification the AI rebuilt without a run
 * started here (from the kickoff, or before this tab existed) gets one the
 * moment a person reviews it, starting from nothing: all of it is the AI's work.
 */
function reviewedRun(doc: RetrospecDocument, ctx: ActContext): RetrospecRun {
	const run = currentRun(doc);
	if (run) return run;
	return newRun(doc, 'repo', {}, ctx, true);
}

const totalOf = (total: number | undefined, fallback: number) =>
	typeof total === 'number' && Number.isFinite(total) && total >= 0 ? Math.round(total) : fallback;

function setVerdict(run: RetrospecRun, itemId: string, next: ItemVerdict | null, total: number | undefined): RetrospecRun {
	const verdicts = { ...run.verdicts };
	if (next && (next.validatedBy.length > 0 || next.flag)) verdicts[itemId] = next;
	else delete verdicts[itemId];
	return { ...run, verdicts, itemTotal: totalOf(total, run.itemTotal) };
}

function emptyVerdict(title: string, tab: string): ItemVerdict {
	return { title, tab, validatedBy: [], flag: null };
}

/** An act on the document; what took effect also goes to the history of actions (criterion 64d191d6). */
export function applyRetrospecAct(doc: RetrospecDocument, act: RetrospecAct, ctx: ActContext): ActOutcome {
	const outcome = actOn(doc, act, ctx);
	return outcome.ok ? { ok: true, doc: withActionHistory(doc, outcome.doc, act, ctx) } : outcome;
}

function actOn(doc: RetrospecDocument, act: RetrospecAct, ctx: ActContext): ActOutcome {
	const run = currentRun(doc);
	switch (act.op) {
		case 'report_changes': {
			if (!run?.holds || run.publishedAt) return refuse('No Reverse-Specification holds its changes on this project.');
			if (run.writingOpenedAt) return refuse('The report is decided: what was validated is being written.');
			const report: Record<string, ReportedChange> = { ...run.report };
			for (const change of act.changes) report[change.id] = reportedAgain(report[change.id], change);
			return { ok: true, doc: withRun(doc, { ...run, report }) };
		}
		case 'withdraw_changes': {
			if (!run?.holds || run.publishedAt) return refuse('No Reverse-Specification holds its changes on this project.');
			if (run.writingOpenedAt) return refuse('The report is decided: what was validated is being written.');
			const report: Record<string, ReportedChange> = { ...run.report };
			for (const id of act.ids) {
				if (report[id]?.decision?.verdict !== 'rejected') return refuse(`The change ${id} is not rejected: only a rejected change can be withdrawn.`);
				delete report[id];
			}
			return { ok: true, doc: withRun(doc, { ...run, report }) };
		}
		case 'end_reading': {
			if (!run?.holds || run.publishedAt) return refuse('No Reverse-Specification holds its changes on this project.');
			return { ok: true, doc: withRun(doc, { ...run, readingDoneAt: run.readingDoneAt ?? ctx.now }) };
		}
		case 'decide_change': {
			const change = run?.report?.[act.id];
			if (!run || !change) return refuse('This change is not on the report.');
			if (run.writingOpenedAt) return refuse('What was validated is being written: the decisions no longer change.');
			const note = act.note?.trim() ?? '';
			if (act.verdict === 'rejected' && !note) return refuse('Say what must change before it goes into the specification.');
			if (note.length > COMMENT_MAX_LENGTH) return refuse(`What must change is at most ${COMMENT_MAX_LENGTH} characters.`);
			const decision = act.verdict ? { verdict: act.verdict, by: ctx.actor, at: ctx.now, ...(act.verdict === 'rejected' ? { note } : {}) } : null;
			return { ok: true, doc: withRun(doc, { ...run, report: { ...run.report, [act.id]: { ...change, decision } } }) };
		}
		case 'validate_changes': {
			if (!run?.report) return refuse('No Reverse-Specification holds its changes on this project.');
			if (run.writingOpenedAt) return refuse('What was validated is being written: the decisions no longer change.');
			// A change someone decided meanwhile keeps that decision; one gone from the report is skipped.
			const open = openChanges(run.report, act.ids);
			if (open.length === 0) return { ok: true, doc };
			const decision = { verdict: 'validated' as const, by: ctx.actor, at: ctx.now };
			const report: Record<string, ReportedChange> = { ...run.report };
			for (const change of open) report[change.id] = { ...change, decision };
			return { ok: true, doc: withRun(doc, { ...run, report }) };
		}
		case 'open_writing': {
			if (!run?.holds || run.publishedAt) return refuse('No Reverse-Specification holds its changes on this project.');
			const counts = reportCounts(run.report);
			if (counts.pending > 0) return refuse('Decide every change of the report first.');
			if (counts.validated === 0) return refuse('No change was validated: there is nothing to write.');
			if (counts.rejected > 0) return refuse('A change is rejected: your AI reworks it first, or take the rejection back.');
			return { ok: true, doc: withRun(doc, { ...run, writingOpenedAt: run.writingOpenedAt ?? ctx.now }) };
		}
		case 'record_written': {
			if (!run?.writingOpenedAt) return refuse('Nothing was sent to be written yet.');
			const verdicts = { ...run.verdicts };
			for (const { change: id, elements } of act.written) {
				const decision = run.report?.[id]?.decision;
				if (decision?.verdict !== 'validated') return refuse(`The change ${id} was not validated: it is not written.`);
				for (const { anchor, title } of elements) verdicts[anchor] = { title, tab: 'spec360', validatedBy: [{ person: decision.by, at: decision.at }], flag: null };
			}
			return { ok: true, doc: withRun(doc, { ...run, verdicts }) };
		}
		case 'behavior_authored': {
			const featureId = act.featureId.trim();
			if (!featureId) return refuse('Name the feature whose behaviour was written.');
			if (doc.behaviorAuthored?.[featureId]) return { ok: true, doc };
			return { ok: true, doc: { ...doc, behaviorAuthored: { ...doc.behaviorAuthored, [featureId]: ctx.now } } };
		}
		case 'start': {
			if (!isRetrospecMode(act.mode)) return refuse('Choose where the Reverse-Specification starts from: your repo or your documentation.');
			// Its analysis over, a run not validated closes and stays in the history (criterion 2dbed801).
			if (run && !run.publishedAt && act.closesRun) {
				const closed = withRun(doc, { ...run, closedAt: ctx.now, closedBy: ctx.actor });
				return { ok: true, doc: withRun(closed, newRun(closed, act.mode, act.baseline, ctx, false, act)) };
			}
			// A run nobody handed to the AI yet starts over; one under way is never dropped.
			if (run && !run.publishedAt && (run.launchedAt || run.reviewStartedAt || Object.keys(run.verdicts).length > 0)) {
				return refuse('A Reverse-Specification is already under way on this project: finish it before starting another.');
			}
			if (run && !run.publishedAt) {
				const rest: RetrospecDocument = { ...doc, runs: doc.runs.slice(0, -1) };
				return { ok: true, doc: { ...rest, runs: [...rest.runs, newRun(rest, act.mode, act.baseline, ctx, false, act)] } };
			}
			return { ok: true, doc: withRun(doc, newRun(doc, act.mode, act.baseline, ctx, false, act)) };
		}
		case 'choose_mode': {
			if (!run || run.launchedAt || run.publishedAt) return refuse('The starting point can only change before the prompt runs.');
			if (!isRetrospecMode(act.mode)) return refuse('Choose your repo or your documentation.');
			// What it reads changes only the commit its delta starts from: a run from the documentation reads none.
			const before: RetrospecDocument = { ...doc, runs: doc.runs.slice(0, -1) };
			const complementary = run.complementary ? { complementary: { ...run.complementary, fromCommit: deltaCommit(before, act.mode) } } : {};
			return { ok: true, doc: withRun(doc, { ...run, mode: act.mode, ...complementary }) };
		}
		case 'choose_docs': {
			if (!run || run.launchedAt || run.publishedAt) return refuse('Where the documentation is can only change before the prompt runs.');
			if (run.mode === 'repo') return refuse('Tick Documentation first.');
			return { ok: true, doc: withRun(doc, { ...run, docsAt: parseDocsLocation(act.at) }) };
		}
		case 'choose_scope': {
			if (!run || run.launchedAt || run.publishedAt) return refuse('What the run reads can only change before the prompt runs.');
			if (!run.complementary) return refuse('A first Reverse-Specification reads the whole product: there is nothing gathered to start from yet.');
			if (!isRetrospecScope(act.scope)) return refuse('Choose what changed or the whole product.');
			return { ok: true, doc: withRun(doc, { ...run, complementary: { ...run.complementary, scope: act.scope } }) };
		}
		case 'launch': {
			if (!run || run.publishedAt) return refuse('Start a Reverse-Specification first.');
			if (run.launchedAt) return { ok: true, doc };
			return { ok: true, doc: withRun(doc, { ...run, launchedAt: ctx.now }) };
		}
		case 'cancel': {
			const refusal = cancelRefusal(doc);
			if (refusal) return refuse(refusal);
			// As if it had never started: the run it closed is the current one again (criterion 0ec7551b).
			const runs = doc.runs.slice(0, -1);
			const before = runs.at(-1);
			return { ok: true, doc: { ...doc, runs: before?.closedAt ? [...runs.slice(0, -1), { ...before, closedAt: null, closedBy: null }] : runs } };
		}
		case 'end_analysis': {
			const target = reviewedRun(doc, ctx);
			if (target.publishedAt) return refuse('This Reverse-Specification is already published.');
			if (target.analysisEndedAt) return { ok: true, doc };
			return { ok: true, doc: withRun(doc, { ...target, analysisEndedAt: ctx.now, analysisEndedBy: ctx.actor }) };
		}
		case 'start_review': {
			const target = reviewedRun(doc, ctx);
			if (target.reviewStartedAt) return { ok: true, doc: withRun(doc, { ...target, itemTotal: totalOf(act.total, target.itemTotal) }) };
			return { ok: true, doc: withRun(doc, { ...target, reviewStartedAt: ctx.now, itemTotal: totalOf(act.total, target.itemTotal) }) };
		}
		case 'validate': {
			if (ctx.reviewOnly && ctx.canReview && !ctx.canReview(doc, act.itemId)) return refuse('This question does not require your validation.');
			const target = started(reviewedRun(doc, ctx), ctx);
			if (target.publishedAt) return refuse('The specification is already validated.');
			const before = target.verdicts[act.itemId] ?? emptyVerdict(act.title, act.tab);
			if (before.flag?.kind === 'rejected') return refuse('Restore this item before validating it.');
			if (before.validatedBy.some((v) => same(v.person, ctx.actor))) return { ok: true, doc };
			// A validation settles what was set aside or shared: someone looked at it.
			const next: ItemVerdict = { title: act.title || before.title, tab: act.tab || before.tab, validatedBy: [...before.validatedBy, { person: ctx.actor, at: ctx.now }], flag: null };
			return { ok: true, doc: withRun(doc, setVerdict(target, act.itemId, next, act.total)) };
		}
		case 'withdraw': {
			if (ctx.reviewOnly && ctx.canReview && !ctx.canReview(doc, act.itemId)) return refuse('This question does not require your validation.');
			const target = reviewedRun(doc, ctx);
			if (target.publishedAt) return refuse('The specification is already validated.');
			const before = target.verdicts[act.itemId];
			if (!before || !before.validatedBy.some((v) => same(v.person, ctx.actor))) return { ok: true, doc };
			const next: ItemVerdict = { ...before, validatedBy: before.validatedBy.filter((v) => !same(v.person, ctx.actor)) };
			return { ok: true, doc: withRun(doc, setVerdict(target, act.itemId, next, act.total)) };
		}
		case 'reject':
		case 'set_aside': {
			const target = started(reviewedRun(doc, ctx), ctx);
			const before = target.verdicts[act.itemId] ?? emptyVerdict(act.title, act.tab);
			const kind = act.op === 'reject' ? 'rejected' : 'later';
			// A rejected item is not validated by anyone: the two never stand together.
			const next: ItemVerdict = {
				title: act.title || before.title,
				tab: act.tab || before.tab,
				validatedBy: kind === 'rejected' ? [] : before.validatedBy,
				flag: { kind, by: ctx.actor, at: ctx.now }
			};
			return { ok: true, doc: withRun(doc, setVerdict(target, act.itemId, next, act.total)) };
		}
		case 'share': {
			if (!act.to?.id?.trim()) return refuse('Choose who to share it with.');
			if (same(act.to, ctx.actor)) return refuse('Share it with someone else: you are already looking at it.');
			const target = started(reviewedRun(doc, ctx), ctx);
			const before = target.verdicts[act.itemId] ?? emptyVerdict(act.title, act.tab);
			if (before.flag?.kind === 'rejected') return refuse('Restore this item before sharing it.');
			const next: ItemVerdict = { title: act.title || before.title, tab: act.tab || before.tab, validatedBy: before.validatedBy, flag: { kind: 'shared', by: ctx.actor, at: ctx.now, to: act.to } };
			return { ok: true, doc: withRun(doc, setVerdict(target, act.itemId, next, act.total)) };
		}
		case 'clear_flag': {
			const target = reviewedRun(doc, ctx);
			const before = target.verdicts[act.itemId];
			if (!before?.flag) return { ok: true, doc };
			return { ok: true, doc: withRun(doc, setVerdict(target, act.itemId, { ...before, flag: null }, act.total)) };
		}
		case 'comment': {
			const text = act.text.trim();
			if (!text) return refuse('Write the comment first.');
			if (text.length > COMMENT_MAX_LENGTH) return refuse(`A comment holds at most ${COMMENT_MAX_LENGTH} characters.`);
			if (!act.commentId.trim()) return refuse('The comment has no id.');
			const list = doc.comments[act.itemId] ?? [];
			if (list.some((c) => c.id === act.commentId)) return { ok: true, doc };
			const added: ItemComment = { id: act.commentId, by: ctx.actor, at: ctx.now, text, resolved: false };
			return { ok: true, doc: { ...doc, comments: { ...doc.comments, [act.itemId]: [...list, added] } } };
		}
		case 'resolve_comment': {
			const list = doc.comments[act.itemId] ?? [];
			if (!list.some((c) => c.id === act.commentId)) return refuse('This comment no longer exists.');
			return {
				ok: true,
				doc: { ...doc, comments: { ...doc.comments, [act.itemId]: list.map((c) => (c.id === act.commentId ? { ...c, resolved: true } : c)) } }
			};
		}
		case 'publish': {
			if (!run || !run.reviewStartedAt) return refuse('Review the specification before publishing it.');
			if (run.publishedAt) return refuse('This Reverse-Specification is already published.');
			if (ctx.canPublish && !ctx.canPublish(doc)) return refuse('Validate every element before validating the specification definitively.');
			const notified = (act.notify ?? []).filter((p) => !same(p, ctx.actor));
			const published = withRun(doc, {
				...run,
				publishedAt: ctx.now,
				publishedBy: ctx.actor,
				baselineId: act.baselineId,
				publishNotified: notified,
				codeAtValidation: { ...(act.code ?? {}) },
				...(act.fingerprints ? { fingerprints: { ...act.fingerprints } } : {})
			});
			// The run is the last retrospecification now: the edits the code confirmed close, the marks go.
			const specEdits = settleSpecEditsAtValidation(doc.specEdits ?? {});
			return { ok: true, doc: withSpecEdits(published, specEdits) };
		}
		case 'ask_notify':
		case 'cancel_notify': {
			if (!run || run.publishedAt) return refuse('Start a Reverse-Specification first.');
			const others = (run.notifyWhenReady ?? []).filter((p) => !same(p, ctx.actor));
			const notifyWhenReady = act.op === 'ask_notify' ? [...others, ctx.actor] : others;
			return { ok: true, doc: withRun(doc, { ...run, notifyWhenReady }) };
		}
		case 'remind': {
			if (!act.to?.id?.trim()) return refuse('Choose who to remind.');
			if (same(act.to, ctx.actor)) return refuse('Validate it yourself: the reminder is for someone else.');
			const target = reviewedRun(doc, ctx);
			if (target.publishedAt) return refuse('The specification is already validated.');
			const reminders = [...(target.reminders ?? []), { itemId: act.itemId, title: act.title, by: ctx.actor, to: act.to, at: ctx.now }];
			return { ok: true, doc: withRun(doc, { ...target, reminders }) };
		}
		case 'request_validation':
		case 'cancel_validation_request': {
			if (!act.to.id.trim()) return refuse('Choose who should validate this question.');
			const target = reviewedRun(doc, ctx);
			if (target.publishedAt) return refuse('The specification is already validated.');
			const previous = doc.validationRequests?.[act.itemId] ?? [];
			const exists = previous.some((request) => same(request.to, act.to));
			if (exists === (act.op === 'request_validation')) return { ok: true, doc };
			const next = act.op === 'request_validation'
				? [...previous, { to: act.to, by: ctx.actor, at: ctx.now, title: act.title }]
				: previous.filter((request) => !same(request.to, act.to));
			const validationRequests = { ...doc.validationRequests };
			if (next.length > 0) validationRequests[act.itemId] = next;
			else delete validationRequests[act.itemId];
			return { ok: true, doc: { ...withRun(doc, target), validationRequests } };
		}
		case 'edit': {
			const target = reviewedRun(doc, ctx);
			if (target.publishedAt) {
				// A validated specification stays validated: the edit is followed, never sent back to validation.
				if (!act.change) return refuse('Say what the element read before and what it reads now.');
				return { ok: true, doc: withSpecEdits(doc, recordSpecEdit(doc.specEdits ?? {}, act.change, ctx.actor, ctx.now)) };
			}
			const before = target.verdicts[act.itemId];
			// What was validated was the element before the change: every validation goes, the editor's own included,
			// the people who gave them are asked again and the validated version is kept (criterion e6029af6).
			// A validation carried from an earlier run stood on the same text: its people are asked again too.
			const carried = target.carried?.[act.itemId]?.validatedBy ?? [];
			const validators = [...(before?.validatedBy ?? []), ...carried].map((v) => v.person).filter((p, i, all) => all.findIndex((q) => same(q, p)) === i);
			const kept = before ? { ...before, validatedBy: [] } : null;
			const edits = { ...(target.edits ?? {}), [act.itemId]: { title: act.title, by: ctx.actor, at: ctx.now } };
			const change = act.revalidate ?? { change: 'edited', before: { text: before?.title ?? act.title, desc: '' }, after: { text: act.title, desc: '' } };
			const revalidations = recordRevalidation(doc.revalidations ?? {}, act.itemId, act.title || before?.title || '', change, validators, ctx.actor, ctx.now);
			const next = withRun(doc, setVerdict({ ...target, edits }, act.itemId, kept, undefined));
			return { ok: true, doc: Object.keys(revalidations).length > 0 ? { ...next, revalidations } : next };
		}
		case 'keep_drift':
		case 'send_back_drift': {
			const validated = lastPublishedRun(doc);
			if (!validated || validated !== run) return refuse('Only a validated specification follows the changes made in the code.');
			if (!act.key.trim()) return refuse('Name the change.');
			const decision = {
				decision: act.op === 'keep_drift' ? ('kept' as const) : ('sent_back' as const),
				by: ctx.actor,
				at: ctx.now,
				code: act.code,
				baselineId: act.op === 'keep_drift' ? act.baselineId : null
			};
			return { ok: true, doc: withRun(doc, { ...validated, drift: { ...(validated.drift ?? {}), [act.key]: decision } }) };
		}
		case 'cancel_spec_edit': {
			const outcome = dropSpecEdit(doc.specEdits ?? {}, act.itemId);
			return outcome.ok ? { ok: true, doc: withSpecEdits(doc, outcome.edits) } : refuse(outcome.reason);
		}
		case 'keep_spec_edit': {
			const outcome = keepSpecEdit(doc.specEdits ?? {}, act.itemId, ctx.actor, ctx.now);
			return outcome.ok ? { ok: true, doc: withSpecEdits(doc, outcome.edits) } : refuse(outcome.reason);
		}
		case 'record_commit': {
			if (!run || run.publishedAt) return refuse('No Reverse-Specification is under way: launch one before reporting the commit it reads.');
			if (run.mode === 'docs') return refuse('This Reverse-Specification reads the documentation alone: it records no commit.');
			const sha = act.sha.trim();
			if (!/^[0-9a-f]{7,64}$/i.test(sha)) return refuse('Report the commit as git names it (its full or short hash).');
			const repository = act.repository?.trim() || null;
			if (run.commit?.sha === sha && run.commit.repository === repository) return { ok: true, doc };
			return { ok: true, doc: withRun(doc, { ...run, commit: { sha, repository, at: ctx.now } }) };
		}
		case 'check_spec_edits': {
			if (!run || run.publishedAt) return refuse('No Reverse-Specification is under way: the code is read against the hand edits during a run.');
			const { edits, unknown } = checkSpecEdits(doc.specEdits ?? {}, act.reports, run.id, ctx.now);
			if (unknown.length > 0) return refuse(`No hand edit waits on ${unknown.join(', ')}.`);
			return { ok: true, doc: withSpecEdits(doc, edits) };
		}
		case 'undo_drift': {
			const validated = lastPublishedRun(doc);
			if (!validated || validated !== run) return refuse('Only a validated specification follows the changes made in the code.');
			if (!validated.drift?.[act.key]) return refuse('This change has no decision to take back.');
			const drift = Object.fromEntries(Object.entries(validated.drift).filter(([key]) => key !== act.key));
			return { ok: true, doc: withRun(doc, { ...validated, drift }) };
		}
	}
}

function withSpecEdits(doc: RetrospecDocument, specEdits: RetrospecDocument['specEdits']): RetrospecDocument {
	const { specEdits: _old, ...rest } = doc;
	return specEdits && Object.keys(specEdits).length > 0 ? { ...rest, specEdits } : rest;
}

/** Acting on an item is reviewing: the review starts with the first act if it had not. */
function started(run: RetrospecRun, ctx: ActContext): RetrospecRun {
	return run.reviewStartedAt ? run : { ...run, reviewStartedAt: ctx.now };
}

/** Apply acts in order; the first refusal stops the batch and nothing of it is kept. */
export function applyRetrospecActs(doc: RetrospecDocument, acts: readonly RetrospecAct[], ctx: ActContext): ActOutcome {
	let current = doc;
	for (const act of acts) {
		const outcome = applyRetrospecAct(current, act, ctx);
		if (!outcome.ok) return outcome;
		current = outcome.doc;
	}
	return { ok: true, doc: current };
}

/**
 * A run started from its page that no AI said it has the prompt of yet, its
 * analysis not over. Anything else (no run, a run the AI rebuilt, one already
 * read) has nothing to move on: an old copy of a prompt records nothing and its
 * AI goes on (criterion a6f870af).
 */
export function waitsForItsPrompt(doc: RetrospecDocument): boolean {
	const run = currentRun(doc);
	return !!run && !run.implicit && !run.launchedAt && !run.analysisEndedAt && !run.reviewStartedAt && !run.publishedAt;
}
