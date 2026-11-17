import type { CodeShift, DriftImpact, ElementText, NextRun, ReportCard, ReportCounts, RetrospecScope, RunDelta, SpecEditStatus } from '$domain/retrospec';

/**
 * The Code drift page as the server hands it to the browser: whether the code
 * is followed yet, against which version, and each change made outside Lyriks
 * already worded (its type, the spec beside the code, the restore brief, the
 * impact read from the specification, the decision taken on it).
 */

export interface DriftDecisionView {
	readonly decision: 'kept' | 'sent_back';
	readonly by: string;
	readonly at: string;
	/** The version an acceptance captured, when it is still in the history. */
	readonly version: string | null;
}

export interface DriftChangeView {
	readonly key: string;
	readonly featureId: string;
	readonly featureName: string;
	readonly coreName: string | null;
	/** The Specification 360° anchor of the element it touches. */
	readonly elementId: string;
	readonly elementName: string;
	/** The action the element belongs to, under which a Code drift card on Home hangs it. */
	readonly actionId: string;
	/** "Rule changed", "Action removed". */
	readonly type: string;
	readonly shift: CodeShift;
	readonly title: string;
	/** "src/orders.js:17", or "was src/orders.js:17" once gone. */
	readonly where: string;
	readonly what: string;
	/** What the specification says of it, in its own words. */
	readonly specText: string;
	/** The signature line the code reads now, '' when gone or not recorded. */
	readonly snippet: string;
	readonly prompt: string;
	readonly impact: DriftImpact;
	readonly decision: DriftDecisionView | null;
}

/** A change made in the validated specification by hand, as Code drift lists it (criteria 68b978c4, fea8666f). */
export interface SpecEditView {
	readonly itemId: string;
	/** "Action", "Feature". */
	readonly kind: string;
	readonly title: string;
	readonly featureName: string | null;
	readonly href: string;
	readonly before: ElementText;
	readonly after: ElementText;
	readonly by: string;
	readonly at: string;
	readonly status: SpecEditStatus;
	/** What the code reads of it, once a run read it. */
	readonly check: { readonly code: string; readonly where: string; readonly at: string } | null;
	readonly kept: { readonly by: string; readonly at: string } | null;
	/** The brief that makes the code follow the specification, once it says otherwise. */
	readonly prompt: string | null;
}

/** The report of a later Reverse-Specification not validated yet (criterion f61f8c94). */
export interface RunReportView {
	/** What the run reads. */
	readonly scope: string;
	/** What it changed, once the analysis of a run that writes as it reads is over; null otherwise. */
	readonly delta: RunDelta | null;
	/** What a run that holds its changes found, once its analysis is over; null otherwise. */
	readonly held: HeldReportView | null;
}

/** The changes a person decides, each docked on the specification as it reads today (criterion 42311513). */
export interface HeldReportView {
	readonly cards: readonly ReportCard[];
	readonly counts: ReportCounts;
	/** A person sent what was validated to their AI: the decisions no longer change. */
	readonly writing: boolean;
	readonly writePrompt: string;
	/** Has the person's AI rework what they rejected (criterion eb132bbd). */
	readonly reworkPrompt: string;
}

/** The analysis Mismatch can launch once the last run is validated (criterion c350fed7). */
export interface NextAnalysisView {
	readonly scope: RetrospecScope;
	readonly reads: NextRun;
}

export interface DriftPageData {
	readonly state: 'draft' | 'validated' | 'report';
	readonly productName: string;
	/** The version of the specification the code is compared with. */
	readonly version: string | null;
	readonly lastSyncAt: string | null;
	/** How many code elements the reference follows: none, and nothing can be compared yet. */
	readonly followed: number;
	readonly changes: readonly DriftChangeView[];
	/** The changes made in the specification by hand, oldest first. */
	readonly specEdits: readonly SpecEditView[];
	readonly report: RunReportView | null;
	readonly next: NextAnalysisView | null;
}
