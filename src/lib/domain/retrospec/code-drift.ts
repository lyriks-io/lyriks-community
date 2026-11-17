import type { DriftDecision, RetrospecRun } from './document';
import type { HandEdited } from './spec-edits';

/**
 * The code that changed outside Lyriks once the Specification 360° was
 * validated. The validation records what the code read for every element the
 * implementation index located (its file, line and signature line); each later
 * sync of the index is read against it. An element whose code moved, changed
 * or disappeared while its feature's specification did not change was changed
 * outside Lyriks (a hotfix, a direct push): a person keeps it in the
 * specification or sends the code back to it. A change made through Lyriks
 * moves the specification first, so it is never listed. Pure.
 */

/** One element the index located (or not) in the code, as the last sync of its feature read it. */
export interface CodeElementFact {
	readonly actionId: string;
	/** The engine's entity type: action, rule, invariant, transition, event... */
	readonly kind: string;
	readonly id: string;
	readonly name: string;
	readonly file: string | null;
	readonly line: number | null;
	/** The signature line the index recorded there, '' when none. */
	readonly snippet: string;
}

export interface CodeFeatureFacts {
	readonly featureId: string;
	readonly featureName: string;
	/** When the index was last synced for this feature. */
	readonly syncedAt: string | null;
	/** When the feature's specification last changed. */
	readonly specUpdatedAt: string | null;
	readonly elements: readonly CodeElementFact[];
}

/** What happened to an element's code: it reads otherwise, it sits in another file, or it is gone. */
export type CodeShift = 'changed' | 'moved' | 'gone';

export interface CodeChange {
	/** The code element's stable key, what a decision is recorded under. */
	readonly key: string;
	readonly featureId: string;
	readonly featureName: string;
	/** The element of the index the code belongs to: its kind, its own id, its name and the action it hangs under. */
	readonly codeElement: Pick<CodeElementFact, 'kind' | 'id' | 'name' | 'actionId'>;
	readonly shift: CodeShift;
	/** The Specification 360° element it touches (its anchor). */
	readonly elementId: string;
	/** "Rule · No order after 6 pm" */
	readonly elementLabel: string;
	/** What the specification says of it: the element's own words. */
	readonly specText: string;
	/** Where it is in the code now, or where it was when it is gone. */
	readonly where: string;
	readonly what: string;
	/** The signature line the code reads now, '' when it is gone or the index recorded none. */
	readonly snippet: string;
	/** What the code reads now: the value a decision is taken on. */
	readonly code: string;
	/** The decision taken on this very code, if any. */
	readonly decision: DriftDecision | null;
	/** When Lyriks last read the code of its feature: the moment Home dates its line at (criterion 45137624). */
	readonly readAt: string | null;
}

/** A change as a page shows it: with the prompt that hands it to the reader's AI. */
export interface CodeChangeView extends CodeChange {
	readonly prompt: string;
}

const SEP = '\t';

export function codeKey(featureId: string, e: Pick<CodeElementFact, 'actionId' | 'kind' | 'id' | 'name'>): string {
	return `${featureId}|${e.actionId}|${e.kind}:${e.id || e.name}`;
}

/** What the code reads for an element: '' when the index did not locate it. */
export function codeValue(e: Pick<CodeElementFact, 'file' | 'line' | 'snippet'>): string {
	return e.file ? [e.file, e.line ?? '', e.snippet.trim()].join(SEP) : '';
}

function parse(value: string): { file: string; line: number | null; snippet: string } | null {
	if (!value) return null;
	const [file, line, ...rest] = value.split(SEP);
	return { file, line: line ? Number(line) : null, snippet: rest.join(SEP) };
}

/**
 * The same code: the same file and, when both sides recorded it, the same
 * signature line; the line number only decides when a side has no signature
 * (a line moved by an edit elsewhere in the file is not a change).
 */
export function sameCode(a: string, b: string): boolean {
	if (a === b) return true;
	const x = parse(a);
	const y = parse(b);
	if (!x || !y) return !x && !y;
	if (x.file !== y.file) return false;
	if (x.snippet && y.snippet) return x.snippet === y.snippet;
	return x.line === y.line;
}

/** What the code reads for every element the features locate: the reference a validation records. */
export function codeSnapshot(features: readonly CodeFeatureFacts[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of features) for (const e of f.elements) out[codeKey(f.featureId, e)] = codeValue(e);
	return out;
}

/**
 * The code a request's branch reported (ac-evo-branch-not-outside): from the
 * report that bound it to its last one. A sync in that span is the request's
 * code, never the product's, whatever became of the request; once merged, the
 * code it brought is the reference later changes are read against.
 */
export interface BranchCode {
	/** The report that bound the branch. */
	readonly from: string;
	/** Its last report. */
	readonly to: string;
	/** The merge into the deployment branch: when, and what the code read then that the reference did not, by code element key. */
	readonly merged: { readonly at: string; readonly code: Readonly<Record<string, string>> } | null;
}

/** How long before its git report the index sync of the same run may have landed: the tool syncs, then reports. */
export const SYNC_BEFORE_REPORT_MS = 5 * 60_000;

/** The first sync a branch can own: the one of the run whose report bound it. */
function branchStart(b: Pick<BranchCode, 'from' | 'to'>): string {
	const t = Date.parse(b.from || b.to);
	return Number.isNaN(t) ? b.from || b.to : new Date(t - SYNC_BEFORE_REPORT_MS).toISOString();
}

/** Whether a sync came from a request's branch: within the span of its reports. */
export function syncedOnBranch(syncedAt: string, branches: readonly BranchCode[]): boolean {
	return branches.some((b) => !!b.to && syncedAt >= branchStart(b) && syncedAt <= b.to);
}

/** What the code is read against: what it read at the validation, then what each merge since brought, in their order. */
export function codeReference(validated: RetrospecRun, branches: readonly BranchCode[]): Record<string, string> {
	const since = validated.publishedAt ?? '';
	const merges = branches.flatMap((b) => (b.merged && b.merged.at > since ? [b.merged] : [])).sort((a, b) => a.at.localeCompare(b.at));
	return Object.assign({}, validated.codeAtValidation ?? {}, ...merges.map((m) => m.code));
}

/**
 * What a branch brings at its merge: every element synced since the branch
 * began that reads otherwise than the reference. A sync after its last report
 * counts too, since the merge is only recorded once git says the deployment
 * branch holds the validated commit.
 */
export function codeBroughtBy(branch: Pick<BranchCode, 'from' | 'to'>, reference: Readonly<Record<string, string>>, features: readonly CodeFeatureFacts[]): Record<string, string> {
	const start = branchStart(branch);
	const out: Record<string, string> = {};
	for (const f of features) {
		if (!f.syncedAt || f.syncedAt < start) continue;
		for (const e of f.elements) {
			const key = codeKey(f.featureId, e);
			const now = codeValue(e);
			if (!sameCode(reference[key] ?? '', now)) out[key] = now;
		}
	}
	return out;
}

/**
 * The code sits in another file and reads the same signature line there: a
 * relocation (a refactor moved the file), nothing the product does changed,
 * so nobody is asked to decide on it (criterion 2667bc55).
 */
function relocatedOnly(before: { file: string; snippet: string }, after: { file: string; snippet: string }): boolean {
	return after.file !== before.file && !!after.snippet && after.snippet === before.snippet;
}

const place = (c: { file: string; line: number | null }) => (c.line !== null ? `${c.file}:${c.line}` : c.file);
const KIND_LABEL: Readonly<Record<string, string>> = { action: 'Action', rule: 'Rule', invariant: 'Invariant', transition: 'Transition', event: 'Event', state: 'State' };

function elementOf(featureId: string, featureName: string, e: CodeElementFact): { id: string; label: string } {
	const label = `${KIND_LABEL[e.kind] ?? 'Feature'} · ${e.name}`;
	if (e.kind === 'action' && e.id) return { id: `action:${featureId}:${e.id}`, label };
	if (e.kind === 'rule' && e.id) return { id: `rule:${featureId}:${e.id}`, label };
	return { id: `feature:${featureId}`, label: KIND_LABEL[e.kind] ? label : `Feature · ${featureName}` };
}

const SHIFT_WORD: Readonly<Record<CodeShift, string>> = { changed: 'changed', moved: 'moved', gone: 'removed' };
const GUARD_KINDS = new Set(['rule', 'invariant']);

/**
 * How a change heads its card (criterion 4903ceb0): its type, read from the
 * element it touches and from what became of its code ("Rule changed",
 * "Action removed"), and its title. A rule is named by the action it guards
 * when the spec tells it (its own name is often a whole sentence), anything
 * else by its own name. Only what the index tells: an element the spec has
 * and the code never had is not a change of the code, so no type says "added".
 */
export function codeChangeHead(change: Pick<CodeChange, 'codeElement' | 'shift'>, actionName: string | null = null): { readonly type: string; readonly title: string } {
	const { kind, name } = change.codeElement;
	const type = `${KIND_LABEL[kind] ?? 'Element'} ${SHIFT_WORD[change.shift]}`;
	const subject = GUARD_KINDS.has(kind) && actionName ? `${/^[aeiou]/.test(kind) ? 'An' : 'A'} ${kind} of “${actionName}”` : null;
	if (change.shift === 'gone') return { type, title: subject ? `${subject} is no longer in the code` : `“${name}” is no longer in the code` };
	if (change.shift === 'moved') return { type, title: subject ? `${subject} moved to another file` : `“${name}” moved to another file` };
	return { type, title: subject ? `${subject} changed in the code` : `The code of “${name}” changed` };
}

/** How long after a hand edit is recorded its feature's specification may still read as moved by it. */
export const HAND_EDIT_SETTLE_MS = 60_000;

/** The feature's specification last moved through a hand edit Code drift follows on its own (criterion 68b978c4). */
function movedByHand(f: CodeFeatureFacts, hand: HandEdited | undefined): boolean {
	const at = hand?.lastAt.get(f.featureId);
	if (!at || !f.specUpdatedAt) return false;
	return Date.parse(f.specUpdatedAt) <= Date.parse(at) + HAND_EDIT_SETTLE_MS;
}

/**
 * The changes made in the code outside Lyriks since the run was published, in
 * the features' order. A sync from a request's branch is that request's code,
 * and a merged branch's code is part of the reference (ac-evo-branch-not-outside).
 * A hand edit never hides the code of the feature's other elements; the code of
 * an action edited by hand is the next retrospecification's to read against it.
 */
export function codeChangesSince(validated: RetrospecRun, features: readonly CodeFeatureFacts[], branches: readonly BranchCode[] = [], hand?: HandEdited): CodeChange[] {
	const since = validated.publishedAt;
	if (!since) return [];
	const reference = codeReference(validated, branches);
	const out: CodeChange[] = [];
	for (const f of features) {
		// The specification moved since: the change went through Lyriks (an evolution, an AI client), unless by hand.
		if (f.specUpdatedAt && f.specUpdatedAt > since && !movedByHand(f, hand)) continue;
		if (!f.syncedAt || f.syncedAt <= since) continue;
		// Synced from a request's branch: the request's code, not the product's.
		if (syncedOnBranch(f.syncedAt, branches)) continue;
		for (const e of f.elements) {
			if (hand?.actions.has(`${f.featureId}|${e.actionId}`)) continue;
			const key = codeKey(f.featureId, e);
			const before = parse(reference[key] ?? '');
			// Only code that was there when the team validated can have changed under it.
			if (!before) continue;
			const now = codeValue(e);
			if (sameCode(reference[key], now)) continue;
			const after = parse(now);
			if (after && relocatedOnly(before, after)) continue;
			const element = elementOf(f.featureId, f.featureName, e);
			// Another file with another signature line is a change; another file read without one may be no more than a move.
			const moved = !!after && after.file !== before.file && !(after.snippet && before.snippet);
			const shift: CodeShift = !after ? 'gone' : moved ? 'moved' : 'changed';
			const what = !after
				? `“${e.name}” is no longer found in the code.`
				: moved
					? `“${e.name}” moved from ${before.file} to ${after.file}.`
					: after.snippet
						? `The code of “${e.name}” changed: it now reads “${after.snippet}”.`
						: `The code of “${e.name}” changed.`;
			const decision = validated.drift?.[key];
			out.push({
				key,
				featureId: f.featureId,
				featureName: f.featureName,
				codeElement: { kind: e.kind, id: e.id, name: e.name, actionId: e.actionId },
				shift,
				elementId: element.id,
				elementLabel: element.label,
				specText: e.name,
				where: after ? place(after) : `was ${place(before)}`,
				what,
				snippet: after?.snippet ?? '',
				code: now,
				decision: decision && sameCode(decision.code, now) ? decision : null,
				readAt: f.syncedAt
			});
		}
	}
	return out;
}

/**
 * What a person hands their AI to restore the behaviour the specification
 * describes: the element, where the code is, what the specification says and
 * what the code reads now, the ticket to open through the tracker the AI is
 * connected to (Lyriks calls no tracker), and the index to sync once the code
 * reads as the specification again, which is what takes the change off the list.
 */
export function sendBackPrompt(change: CodeChange, product: { readonly name: string; readonly id: string }): string {
	return [
		`Restore the previous behaviour of “${change.codeElement.name}” in ${product.name} (Lyriks project ${product.id}) so that the code matches its Specification 360° again: it changed outside Lyriks after the specification was validated.`,
		'',
		`Where: ${change.where}.`,
		`What changed: ${change.what}`,
		'',
		`The specification is the reference. ${change.elementLabel} (feature ${change.featureName}) says: “${change.specText}”${/[.!?]$/.test(change.specText.trim()) ? '' : '.'} Read it with get_behavior_feature("${change.featureId}") through the Lyriks MCP.`,
		`What the code reads now (to revert): ${change.snippet ? change.snippet : 'nothing, the element is gone from the code'}.`,
		'',
		'Tasks:',
		'1. If you are connected to a tracker (Jira, Linear, GitHub Issues...), open a ticket there for this gap, naming the element, the code place and what the specification says.',
		'2. Revert only this change; keep the rest of the code as it is.',
		'3. Add or update the tests so that they check what the specification says.',
		'4. Do not modify the specification.',
		'5. Update the implementation index of the repository and sync it with sync_implementation_index.',
		'6. Report the files you changed.'
	].join('\n');
}
