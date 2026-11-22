import type { PersonRef } from './document';

/**
 * The changes a person makes by hand in a validated Specification 360°
 * (criteria 611e98cb, 68b978c4, 956cb2ac of feat-fb747-traceability). The
 * specification stays validated: each change is followed instead. An element
 * the code implements (a feature whose actions the index locates, or one of
 * those actions) gets a line on Code drift, read against the code by the next
 * retrospecification and decided only then (criterion fea8666f); an element
 * no reading of the code can confirm only carries a mark until the next run
 * is validated. One record per element, whatever the number of saves: it
 * keeps what the element read before the first of them. Pure.
 */

/** What an element reads, as the Specification 360° edits it. */
export interface ElementText {
	readonly text: string;
	readonly desc: string;
}

/** What the code says of an edit: what the specification now says, or otherwise. */
export type CodeVerdict = 'same' | 'other';

export const isCodeVerdict = (v: unknown): v is CodeVerdict => v === 'same' || v === 'other';

/** A retrospecification read the code against the edit as it reads now. */
export interface SpecEditCheck {
	readonly runId: string;
	readonly at: string;
	readonly verdict: CodeVerdict;
	/** What the code reads, in the run's words. */
	readonly code: string;
	/** Where it reads it: "src/orders.ts:42". */
	readonly where: string;
}

export interface SpecEdit {
	/** The Specification 360° anchor of the element. */
	readonly itemId: string;
	readonly title: string;
	/** The feature the element belongs to, for an element the code implements. */
	readonly featureId: string | null;
	/** The code implements it: a line on Code drift; otherwise a mark only. */
	readonly implemented: boolean;
	/** What it read before the first edit. */
	readonly before: ElementText;
	readonly after: ElementText;
	readonly firstAt: string;
	/** Who changed it last, and when. */
	readonly by: PersonRef;
	readonly at: string;
	readonly check: SpecEditCheck | null;
	/** A person kept the specification: the code must follow it. */
	readonly kept: { readonly by: PersonRef; readonly at: string } | null;
}

export type SpecEditStatus = 'unchecked' | 'confirmed' | 'differs' | 'kept';

/** A hand edit as the code drift change of an element it is. */
export interface SpecEditChange {
	readonly itemId: string;
	readonly title: string;
	readonly featureId: string | null;
	readonly implemented: boolean;
	readonly before: ElementText;
	readonly after: ElementText;
}

export interface SpecEditReport {
	readonly itemId: string;
	readonly verdict: CodeVerdict;
	readonly code: string;
	readonly where: string;
}

export type SpecEdits = Readonly<Record<string, SpecEdit>>;

/** Where a line stands: a code that says it closes it, whether it was kept or not. */
export function specEditStatus(e: Pick<SpecEdit, 'check' | 'kept'>): SpecEditStatus {
	if (e.check?.verdict === 'same') return 'confirmed';
	if (e.kept) return 'kept';
	return e.check ? 'differs' : 'unchecked';
}

const sameText = (a: ElementText, b: ElementText) => a.text.trim() === b.text.trim() && a.desc.trim() === b.desc.trim();

/**
 * Record a hand edit: the first one of an element opens its record with what
 * it read before; a later one keeps that and moves the rest. Whatever the code
 * said before was said of another text, so the check and the decision go. An
 * element written back to what it read before the first edit has nothing left
 * to follow.
 */
export function recordSpecEdit(edits: SpecEdits, change: SpecEditChange, by: PersonRef, at: string): Record<string, SpecEdit> {
	const prior = edits[change.itemId];
	const before = prior?.before ?? change.before;
	const rest = Object.fromEntries(Object.entries(edits).filter(([id]) => id !== change.itemId));
	if (change.implemented && sameText(before, change.after)) return rest;
	return {
		...rest,
		[change.itemId]: {
			itemId: change.itemId,
			title: change.title || prior?.title || change.itemId,
			featureId: change.featureId ?? prior?.featureId ?? null,
			implemented: change.implemented,
			before,
			after: change.after,
			firstAt: prior?.firstAt ?? at,
			by,
			at,
			check: null,
			kept: null
		}
	};
}

export type SpecEditOutcome = { readonly ok: true; readonly edits: Record<string, SpecEdit> } | { readonly ok: false; readonly reason: string };

/** The lines on Code drift: the edits the code implements. */
const lineOf = (edits: SpecEdits, itemId: string): SpecEdit | null => (edits[itemId]?.implemented ? edits[itemId] : null);

/** Cancel the edit: the line goes; the caller writes the text before back first. */
export function dropSpecEdit(edits: SpecEdits, itemId: string): SpecEditOutcome {
	if (!lineOf(edits, itemId)) return { ok: false, reason: 'There is no hand edit to cancel on this element.' };
	return { ok: true, edits: Object.fromEntries(Object.entries(edits).filter(([id]) => id !== itemId)) };
}

/** Keep the specification: only once the code was read against the edit and says otherwise. */
export function keepSpecEdit(edits: SpecEdits, itemId: string, by: PersonRef, at: string): SpecEditOutcome {
	const line = lineOf(edits, itemId);
	if (!line) return { ok: false, reason: 'There is no hand edit on this element.' };
	if (specEditStatus(line) !== 'differs') return { ok: false, reason: 'Decide once the code was read against the edit.' };
	return { ok: true, edits: { ...edits, [itemId]: { ...line, kept: { by, at } } } };
}

/**
 * What a run read of the code against each edit. An element with no line is
 * named back, never invented; the edit and the decision stay as they are.
 */
export function checkSpecEdits(edits: SpecEdits, reports: readonly SpecEditReport[], runId: string, at: string): { edits: Record<string, SpecEdit>; unknown: string[] } {
	const out: Record<string, SpecEdit> = { ...edits };
	const unknown: string[] = [];
	for (const r of reports) {
		const line = lineOf(out, r.itemId);
		if (!line) {
			unknown.push(r.itemId);
			continue;
		}
		out[r.itemId] = { ...line, check: { runId, at, verdict: r.verdict, code: r.code.trim(), where: r.where.trim() } };
	}
	return { edits: out, unknown };
}

/**
 * What a validated run leaves: the lines the code confirmed close, and the
 * marks go (the run is now the last retrospecification); a line still
 * unchecked, contradicted or kept stays.
 */
export function settleSpecEditsAtValidation(edits: SpecEdits): Record<string, SpecEdit> {
	return Object.fromEntries(Object.entries(edits).filter(([, e]) => e.implemented && specEditStatus(e) !== 'confirmed'));
}

/** The lines on Code drift, oldest first. */
export function specEditLines(edits: SpecEdits | undefined): SpecEdit[] {
	return Object.values(edits ?? {})
		.filter((e) => e.implemented)
		.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

/** Lines still waiting for a reading of the code or a decision: what counts to review. */
export const specEditsToReview = (edits: SpecEdits | undefined) => specEditLines(edits).filter((e) => ['unchecked', 'differs'].includes(specEditStatus(e))).length;

/** Lines kept, the code yet to follow. */
export const specEditsKept = (edits: SpecEdits | undefined) => specEditLines(edits).filter((e) => specEditStatus(e) === 'kept').length;

/** What Code drift reads of the hand edits: when each feature was last edited by hand, and the actions edited. */
export interface HandEdited {
	/** The last hand edit of each feature, by feature id. */
	readonly lastAt: ReadonlyMap<string, string>;
	/** The actions edited by hand, as "<featureId>|<actionId>": their code is the next run's to read. */
	readonly actions: ReadonlySet<string>;
}

export function handEdited(edits: SpecEdits | undefined): HandEdited {
	const lastAt = new Map<string, string>();
	const actions = new Set<string>();
	for (const e of Object.values(edits ?? {})) {
		if (!e.implemented || !e.featureId) continue;
		const at = lastAt.get(e.featureId);
		if (!at || e.at > at) lastAt.set(e.featureId, e.at);
		const [kind, , actionId] = e.itemId.split(':');
		if (kind === 'action' && actionId) actions.add(`${e.featureId}|${actionId}`);
	}
	return { lastAt, actions };
}

const said = (t: ElementText) => [t.text.trim(), t.desc.trim()].filter(Boolean).join(': ') || '(empty)';

/**
 * What a person hands their AI once they keep the specification against the
 * code (criterion fea8666f): the element, what it read before and reads now,
 * what the code reads and where, and the index to sync once the code follows,
 * which is what lets the next retrospecification close the line.
 */
export function followSpecPrompt(edit: SpecEdit, featureName: string | null, product: { readonly name: string; readonly id: string }): string {
	const [kind, featureId] = edit.itemId.split(':');
	const what = kind === 'action' ? `the action “${edit.after.text}”` : `the feature “${edit.after.text}”`;
	return [
		`Make the code of ${product.name} (Lyriks project ${product.id}) follow its Specification 360° for ${what}${featureName && kind === 'action' ? ` (feature ${featureName})` : ''}: the specification was changed by hand and the code does not say it yet.`,
		'',
		`Before: ${said(edit.before)}`,
		`Now: ${said(edit.after)}`,
		edit.check ? `What the code reads now: ${edit.check.code || 'not said'}${edit.check.where ? ` (${edit.check.where})` : ''}.` : '',
		'',
		`The specification is the reference. Read it with get_behavior_feature("${featureId}") through the Lyriks MCP.`,
		'',
		'Tasks:',
		'1. If you are connected to a tracker (Jira, Linear, GitHub Issues...), open a ticket there for this gap.',
		'2. Change only the code this element needs; keep the rest as it is.',
		'3. Add or update the tests so that they check what the specification now says.',
		'4. Do not modify the specification.',
		'5. Update the implementation index of the repository and sync it with sync_implementation_index.',
		'6. Report the files you changed.'
	]
		.filter((line, i, all) => line !== '' || all[i - 1] !== '')
		.join('\n');
}

// ── Parsing (the stored JSON is untrusted) ────────────────────────────────

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function textOf(v: unknown): ElementText {
	const o = obj(v);
	return { text: str(o.text), desc: str(o.desc) };
}

function personOf(v: unknown): PersonRef | null {
	const o = obj(v);
	const id = str(o.id).trim();
	return id ? { id, name: str(o.name).trim() || id } : null;
}

function checkOf(v: unknown): SpecEditCheck | null {
	const o = obj(v);
	if (!isCodeVerdict(o.verdict) || !str(o.at)) return null;
	return { runId: str(o.runId), at: str(o.at), verdict: o.verdict, code: str(o.code), where: str(o.where) };
}

export function parseSpecEdits(raw: unknown): Record<string, SpecEdit> {
	const out: Record<string, SpecEdit> = {};
	for (const [itemId, v] of Object.entries(obj(raw))) {
		const o = obj(v);
		const by = personOf(o.by);
		const at = str(o.at);
		if (!by || !at) continue;
		const keptBy = personOf(obj(o.kept).by);
		const keptAt = str(obj(o.kept).at);
		out[itemId] = {
			itemId,
			title: str(o.title),
			featureId: str(o.featureId) || null,
			implemented: o.implemented === true,
			before: textOf(o.before),
			after: textOf(o.after),
			firstAt: str(o.firstAt) || at,
			by,
			at,
			check: checkOf(o.check),
			kept: keptBy && keptAt ? { by: keptBy, at: keptAt } : null
		};
	}
	return out;
}
