import type { PersonRef, RetrospecRun } from './document';
import { deltaElement, deltaRow, type DeltaElement, type RunDelta } from './run-delta';
import type { SpecElement } from './spec-validation';

/**
 * What a later run found and holds until a person decides (criteria 42311513,
 * 1aaa8316 of feat-fb747-traceability, 50b00229 of feat-ai-session): its AI
 * reports each difference instead of writing it, a person validates, reverts or
 * rejects it on Mismatch, and only what was validated is then written, by that
 * person's AI. A rejection is not an end: it says what must change, and the AI
 * reports the change again (criterion eb132bbd). Pure: what the specification
 * reads today arrives read.
 */

export const CHANGE_KINDS = ['new', 'changed', 'removed'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export const isChangeKind = (v: unknown): v is ChangeKind => CHANGE_KINDS.includes(v as ChangeKind);

export const CHANGE_VERDICTS = ['validated', 'reverted', 'rejected'] as const;
export type ChangeVerdict = (typeof CHANGE_VERDICTS)[number];
export const isChangeVerdict = (v: unknown): v is ChangeVerdict => CHANGE_VERDICTS.includes(v as ChangeVerdict);

export interface ChangeDecision {
	readonly verdict: ChangeVerdict;
	readonly by: PersonRef;
	readonly at: string;
	/** What must change before it goes into the specification: what a rejection says. */
	readonly note?: string;
}

/** What a person asked of a change they rejected, kept once the AI reported it again. */
export interface ChangeRework {
	readonly note: string;
	readonly by: PersonRef;
	readonly at: string;
}

/** One difference between the product and the specification, as the run's AI reports it. */
export interface ReportedChangeInput {
	/** The AI's own id for it: reporting it again replaces it. */
	readonly id: string;
	readonly kind: ChangeKind;
	/** The element it changes or removes; null for a new one. */
	readonly anchor: string | null;
	/** The element a new one docks on. */
	readonly dock: string | null;
	readonly title: string;
	/** What the element would read. */
	readonly proposed: string;
	/** What the code reads, '' when the run read no code for it. */
	readonly code: string;
	readonly where: string;
}

export interface ReportedChange extends ReportedChangeInput {
	readonly decision: ChangeDecision | null;
	readonly rework?: ChangeRework;
}

export type RunReport = Readonly<Record<string, ReportedChange>>;

/** The AI of this run may not write in the specification yet. */
export function writesHeld(run: RetrospecRun | null | undefined): boolean {
	return !!run?.holds && !run.publishedAt && !run.writingOpenedAt;
}

export interface ReportCounts {
	readonly total: number;
	readonly pending: number;
	readonly validated: number;
	readonly reverted: number;
	readonly rejected: number;
}

/** The changes of the report these ids name that nobody decided yet, each once, in the order named. */
export function openChanges(report: RunReport, ids: readonly string[]): ReportedChange[] {
	return [...new Set(ids)].flatMap((id) => (Object.hasOwn(report, id) && !report[id].decision ? [report[id]] : []));
}

export function reportCounts(report: RunReport | undefined): ReportCounts {
	const changes = Object.values(report ?? {});
	const count = (verdict: ChangeVerdict) => changes.filter((c) => c.decision?.verdict === verdict).length;
	return { total: changes.length, pending: changes.filter((c) => !c.decision).length, validated: count('validated'), reverted: count('reverted'), rejected: count('rejected') };
}

/** A report read again with the same words keeps its decision; other words are another thing to decide. */
export const sameChange = (a: ReportedChangeInput, b: ReportedChangeInput): boolean =>
	a.kind === b.kind && a.anchor === b.anchor && a.dock === b.dock && a.title === b.title && a.proposed === b.proposed && a.code === b.code && a.where === b.where;

/** A change as it reads once reported: the same words keep their decision, a rework keeps what was asked (criterion eb132bbd). */
export function reportedAgain(before: ReportedChange | undefined, change: ReportedChangeInput): ReportedChange {
	if (!before) return { ...change, decision: null };
	if (sameChange(before, change)) return { ...change, decision: before.decision, ...(before.rework ? { rework: before.rework } : {}) };
	const d = before.decision;
	const asked = d?.verdict === 'rejected' ? { note: d.note ?? '', by: d.by, at: d.at } : before.rework;
	return { ...change, decision: null, ...(asked ? { rework: asked } : {}) };
}

/** What a run that holds its changes found, in the words of what another run changed: nothing of it is written yet. */
export function heldDelta(run: RetrospecRun, elements: readonly SpecElement[]): RunDelta {
	const changes = Object.values(run.report ?? {});
	const titles = new Map(elements.map((e) => [e.id, e.title]));
	const position = new Map(elements.map((e, i) => [e.id, i]));
	const rowOf = (c: ReportedChange): DeltaElement => {
		const home = c.anchor ?? c.dock ?? c.id;
		const at = elements[position.get(home) ?? -1];
		return { ...(at ? deltaElement(at, titles, position.get(home) as number) : deltaRow(home, c.title)), title: deltaRow(home, c.title).title };
	};
	const rows = (kind: ChangeKind) => changes.filter((c) => c.kind === kind).map(rowOf);
	return { since: 'start', added: rows('new'), changed: rows('changed'), removed: rows('removed'), total: elements.length, fromCommit: null, toCommit: null };
}

/** What the specification says of an element today. */
export interface ElementReading {
	readonly title: string;
	readonly detail: string | null;
	/** Where it sits: its core feature and its feature, or its page. */
	readonly place: string | null;
}

/** A change as Mismatch shows it, docked on the specification as it reads today (criterion 42311513). */
export interface ReportCard {
	readonly id: string;
	readonly kind: ChangeKind;
	readonly title: string;
	readonly place: string | null;
	/** What the element reads today; null for a new one, or one no longer found. */
	readonly current: string | null;
	/** The element a new one docks on, as it reads today. */
	readonly dockedOn: string | null;
	readonly proposed: string;
	readonly code: string;
	readonly where: string;
	/** The element it opens in Knowledge. */
	readonly anchor: string | null;
	readonly decision: ChangeDecision | null;
	/** What was asked when it was rejected, once the AI reported it again. */
	readonly rework: ChangeRework | null;
	readonly revertBrief: string;
}

const said = (r: ElementReading): string => (r.detail ? `${r.title}: ${r.detail}` : r.title);

/** The brief that brings the code back to the specification (Revert). */
export function revertBrief(change: ReportedChangeInput, current: string | null, product: { readonly name: string; readonly id: string }): string {
	const where = change.where ? ` (${change.where})` : '';
	const code = change.code ? ` The code reads: ${change.code}${where}.` : where ? ` It is at${where}.` : '';
	const gap =
		change.kind === 'new'
			? `The code does something the specification does not hold: ${change.title}.${code} Take it out of the code.`
			: change.kind === 'removed'
				? `The specification still holds: ${current ?? change.title}. The code no longer does it.${code} Put it back in the code.`
				: `The specification says: ${current ?? change.title}.${code} Make the code say what the specification says.`;
	return `With the Lyriks MCP, bring the code of ${product.name} (Lyriks project ${product.id}) back to its specification. ${gap} Do not change the specification.`;
}

/** The changes of a report in the order of the pages, each read beside what the specification says today. */
export function reportCards(report: RunReport, readOf: (anchor: string) => ElementReading | null, pageOrder: readonly string[], product: { readonly name: string; readonly id: string }): ReportCard[] {
	const position = new Map(pageOrder.map((id, i) => [id, i]));
	const rank = (c: ReportedChange) => position.get(c.anchor ?? c.dock ?? '') ?? pageOrder.length;
	return Object.values(report)
		.toSorted((a, b) => rank(a) - rank(b))
		.map((c): ReportCard => {
			const element = c.anchor ? readOf(c.anchor) : null;
			const dock = c.dock ? readOf(c.dock) : null;
			const home = c.anchor ?? c.dock;
			const current = element ? said(element) : null;
			return {
				id: c.id,
				kind: c.kind,
				title: c.title,
				place: element?.place ?? dock?.place ?? (home ? deltaRow(home, '').kind : null),
				current,
				dockedOn: dock ? said(dock) : null,
				proposed: c.proposed,
				code: c.code,
				where: c.where,
				anchor: element ? c.anchor : dock ? c.dock : null,
				decision: c.decision,
				rework: c.rework ?? null,
				revertBrief: revertBrief(c, current, product)
			};
		});
}

/** The prompt that has the person's AI write what was validated (criterion 1aaa8316). */
export function writeValidatedPrompt(validated: number, product: { readonly name: string; readonly id: string }): string {
	return [
		`With the Lyriks MCP, write into the specification of ${product.name} (Lyriks project ${product.id}) the ${validated === 1 ? 'change' : `${validated} changes`} a person validated on Mismatch, following the lyriks-retrospec skill and its section "Complementary run".`,
		'Call report_retrospec_reading with project_id alone to read the report, and write through the section tools each change whose decision is validated and nothing else: no other element moves, and a change reverted stays out.',
		'For each one, call report_retrospec_reading with written: [{ change: its id, elements: [{ anchor, title }] }], naming the elements of the specification it became.',
		'End with the final check: assess_project_completeness, then audit_project_scope, then finish_project once it reports no blocker.'
	].join(' ');
}

/** The prompt that has the person's AI rework what they rejected (criterion eb132bbd). */
export function reworkRejectedPrompt(rejected: number, product: { readonly name: string; readonly id: string }): string {
	return [
		`With the Lyriks MCP, rework the ${rejected === 1 ? 'change' : `${rejected} changes`} a person rejected on Mismatch for ${product.name} (Lyriks project ${product.id}). Write nothing in the specification.`,
		'Call report_retrospec_reading with project_id alone to read the report: each rejected change carries in asked what must change before it goes into the specification.',
		'Read the code again where you need to, then report each one again with report_retrospec_reading (changes), under the same id and worded as the person asked.',
		'If the person says it is not a change at all, call it with withdrawn: [its id] instead. Touch no other change of the report.'
	].join(' ');
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function decisionOf(raw: unknown): ChangeDecision | null {
	const o = obj(raw);
	const by = obj(o.by);
	const at = str(o.at);
	if (!isChangeVerdict(o.verdict) || !str(by.id) || !at) return null;
	return { verdict: o.verdict, by: { id: str(by.id), name: str(by.name) || str(by.id) }, at, ...(str(o.note) ? { note: str(o.note) } : {}) };
}

function reworkOf(raw: unknown): { rework?: ChangeRework } {
	const o = obj(raw);
	const by = obj(o.by);
	return str(by.id) && str(o.at) ? { rework: { note: str(o.note), by: { id: str(by.id), name: str(by.name) || str(by.id) }, at: str(o.at) } } : {};
}

/** Read a stored report; a change that does not read whole is left out. */
export function parseReport(raw: unknown): Record<string, ReportedChange> {
	const out: Record<string, ReportedChange> = {};
	for (const [id, value] of Object.entries(obj(raw))) {
		const o = obj(value);
		if (!isChangeKind(o.kind)) continue;
		out[id] = { id, kind: o.kind, anchor: str(o.anchor) || null, dock: str(o.dock) || null, title: str(o.title), proposed: str(o.proposed), code: str(o.code), where: str(o.where), decision: decisionOf(o.decision), ...reworkOf(o.rework) };
	}
	return out;
}
