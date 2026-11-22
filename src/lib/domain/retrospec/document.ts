import { parseHistory, type HistoryEntry } from './action-history';
import { parseReport, type RunReport } from './run-report';
import { parseSpecEdits, type SpecEdit } from './spec-edits';
import { parseRevalidations, type Revalidation } from './revalidations';
import { parseDocsLocation, type DocsLocation } from './docs-location';

/**
 * The retrospecification of a product, as Lyriks keeps it: the runs a team
 * started (each one a reading of the code by the person's AI, then a review by
 * people) and the comments left on what the AI rebuilt.
 *
 * The specification itself lives in its own sections, written by the AI through
 * the MCP; this document only holds what the retrospec adds on top of them: who
 * started a run and when, the section revisions it started from, and, item by
 * item, who validated, rejected, set aside or shared what. It is stored under an
 * internal section key that the public section vocabulary (and so the MCP) never
 * names.
 *
 * Pure: parsing and shapes only, no IO.
 */

/** The internal section key the document is stored under (never in `SECTIONS`). */
export const RETROSPEC_SECTION = 'retrospec';

/** What the AI reads: the product's repository, its documentation, or both (the code is then the reference). */
export const RETROSPEC_MODES = ['repo', 'docs', 'both'] as const;
export type RetrospecMode = (typeof RETROSPEC_MODES)[number];

export const isRetrospecMode = (value: unknown): value is RetrospecMode =>
	typeof value === 'string' && (RETROSPEC_MODES as readonly string[]).includes(value);

/** A person as an act records them: the id the session gives them, the name the app shows. */
export interface PersonRef {
	readonly id: string;
	readonly name: string;
}

/** One person's validation of an item. */
export interface ItemValidation {
	readonly person: PersonRef;
	readonly at: string;
}

/**
 * What keeps an item from reading validated: rejected (not wanted in the
 * specification), set aside to review later, or shared with someone who should
 * look at it.
 */
export type ItemFlag =
	| { readonly kind: 'rejected' | 'later'; readonly by: PersonRef; readonly at: string }
	| { readonly kind: 'shared'; readonly by: PersonRef; readonly at: string; readonly to: PersonRef };

/**
 * Where an item of a run stands. The title and the tab are copied in at the
 * moment of the act, so a notification, the pending list or the history can
 * name the item without reading the whole specification again.
 */
export interface ItemVerdict {
	readonly title: string;
	readonly tab: string;
	readonly validatedBy: readonly ItemValidation[];
	readonly flag: ItemFlag | null;
}

/** A person asked a colleague to give the validation an element waits on. */
export interface ItemReminder {
	readonly itemId: string;
	readonly title: string;
	readonly by: PersonRef;
	readonly to: PersonRef;
	readonly at: string;
}

/** The last person who edited an element from the Specification 360°, and when. */
export interface ItemEdit {
	readonly title: string;
	readonly by: PersonRef;
	readonly at: string;
}

/**
 * A change of the code that did not go through Lyriks, once a person decided
 * on it: kept in the specification (a baseline captured, the version moves),
 * or sent back for the code to follow the specification. `code` is what the
 * code read when the decision was taken: a later change reads as new.
 */
export interface DriftDecision {
	readonly decision: 'kept' | 'sent_back';
	readonly by: PersonRef;
	readonly at: string;
	readonly code: string;
	readonly baselineId: string | null;
}

/** The commit a run read, as the person's AI reported it (criterion c50587fb of feat-mcp-authoring). */
export interface RunCommit {
	readonly sha: string;
	readonly repository: string | null;
	readonly at: string;
}

/**
 * A run that starts from the specification already gathered and reads only the
 * delta (criterion 8c9bfffe of feat-mcp-authoring): since the commit the last
 * validated run recorded, or, with none, from the evidence the specification
 * already cites. Every run after the first is one (criterion 2dbed801).
 */
export interface RunComplementary {
	/** The last validated run, null when none was validated yet. */
	readonly fromRunId: string | null;
	/** The commit it read, null when it recorded none or the run reads the documentation alone. */
	readonly fromCommit: string | null;
	/** What the AI reads: what changed, the whole product again, or where the last run stopped (EVO-014). */
	readonly scope: RetrospecScope;
	/** Where the run before stopped, when a person closed it before its final check: what a Resume analysis reads (EVO-014). */
	readonly resumable?: RunResume;
}

/**
 * What a later run reads; whatever it reads, it starts from the specification
 * gathered and erases nothing: what changed (Delta analysis), the whole product
 * again (Full analysis), or where the last run stopped (Resume analysis).
 */
export const RETROSPEC_SCOPES = ['delta', 'whole', 'resume'] as const;
export type RetrospecScope = (typeof RETROSPEC_SCOPES)[number];
export const isRetrospecScope = (v: unknown): v is RetrospecScope => typeof v === 'string' && (RETROSPEC_SCOPES as readonly string[]).includes(v);

/**
 * Where a run a person closed before its final check stopped, phase by phase
 * (EVO-014): what it read whole, the phases it stopped in, the ones it never
 * reached, and the commit a Resume analysis reads the code delta from (the
 * one it recorded, else the one it started from).
 */
export interface RunResume {
	readonly fromRunId: string;
	readonly read: readonly string[];
	readonly interrupted: readonly string[];
	readonly left: readonly string[];
	readonly fromCommit: string | null;
}

/**
 * A validation a complementary run carries from the last validated run: it
 * stands while the element reads as it did then (criterion 0c87480c of
 * feat-ai-session), so only what the run changed waits for a person.
 */
export interface CarriedValidation {
	readonly fingerprint: string;
	readonly validatedBy: readonly ItemValidation[];
}

/**
 * A validation a change request gave an element at its landing (EVO-002): the
 * request wrote the element and its code proved every line of it. It counts as
 * every validation the element waits on while the element reads as it landed;
 * a person the element waits on takes it back, and a request never gives it
 * twice, so a withdrawal is kept rather than erased.
 */
export interface RequestValidation {
	readonly requestId: string;
	/** The request as the board names it (EVO-002), kept so Knowledge names it without reading the dossier. */
	readonly requestKey: string;
	/** The people who approved the request. */
	readonly approvedBy: readonly PersonRef[];
	/** When the request landed. */
	readonly at: string;
	/** What the element read as it landed: the validation stands while it reads the same. */
	readonly fingerprint: string;
	/** Set once a person took it back (or requested a change on the element): it no longer counts. */
	readonly withdrawn?: { readonly by: PersonRef; readonly at: string };
}

/**
 * What the specification read when a later run started, by element id: what
 * that run changed is read against it (criterion 03192a6e of feat-ai-session).
 */
export interface RunStartReading {
	readonly fingerprints: Readonly<Record<string, string>>;
	readonly titles: Readonly<Record<string, string>>;
}

export interface ItemComment {
	readonly id: string;
	readonly by: PersonRef;
	readonly at: string;
	readonly text: string;
	readonly resolved: boolean;
}

/** An additional review requested on one question; it survives later runs. */
export interface ItemValidationRequest {
	readonly to: PersonRef;
	readonly by: PersonRef;
	readonly at: string;
	readonly title: string;
}

/**
 * One retrospecification: started, handed to the AI, analysed, reviewed,
 * published. `implicit` marks a run nobody started from this page: the AI
 * already rebuilt the specification (from the kickoff, or before the tab
 * existed) and a person began reviewing it.
 */
export interface RetrospecRun {
	readonly id: string;
	readonly mode: RetrospecMode;
	readonly implicit: boolean;
	readonly startedAt: string;
	readonly startedBy: PersonRef;
	/** Explicit null when a read-only reviewer started an implicit run without becoming its lead. */
	readonly validationLead?: PersonRef | null;
	/** The revision of each section of the specification when the run started; what moved since is the AI's work. */
	readonly baseline: Readonly<Record<string, number>>;
	/** The run's AI said it received the prompt, or the person said so on the last step of creating the project. */
	readonly launchedAt: string | null;
	/** A person closed the analysis themselves, the AI never having run its final check. */
	readonly analysisEndedAt: string | null;
	readonly analysisEndedBy: PersonRef | null;
	readonly reviewStartedAt: string | null;
	/** How many items the review counted the last time a person acted on it, so a status reads "N / M" without reading the specification. */
	readonly itemTotal: number;
	readonly publishedAt: string | null;
	readonly publishedBy: PersonRef | null;
	/** The baseline of the specification captured when the run was published. */
	readonly baselineId: string | null;
	readonly verdicts: Readonly<Record<string, ItemVerdict>>;
	/** The people who asked to be told in the app when the analysis finishes. */
	readonly notifyWhenReady?: readonly PersonRef[];
	/** Reminders sent to the validators an element waits on, oldest first. */
	readonly reminders?: readonly ItemReminder[];
	/** Who edited each element last, by element id. */
	readonly edits?: Readonly<Record<string, ItemEdit>>;
	/** The team told when the run was published (the specification validated). */
	readonly publishNotified?: readonly PersonRef[];
	/**
	 * What the code read for each element when the run was published, by code
	 * element key: the reference the changes made outside Lyriks are read against.
	 */
	readonly codeAtValidation?: Readonly<Record<string, string>>;
	/** The decisions taken on the code changes made outside Lyriks, by code element key. */
	readonly drift?: Readonly<Record<string, DriftDecision>>;
	/** The commit the run read, once its AI reported it. */
	readonly commit?: RunCommit;
	/** Set when the run reads only the delta since the last validated run. */
	readonly complementary?: RunComplementary;
	/** What each element read when the run was published, by element id: what a later run's carried validation is checked against. */
	readonly fingerprints?: Readonly<Record<string, string>>;
	/** The validations a complementary run carried from the last validated run, by element id. */
	readonly carried?: Readonly<Record<string, CarriedValidation>>;
	/** The validations change requests gave at their landing, by element id (EVO-002), taken back ones included. */
	readonly throughRequests?: Readonly<Record<string, RequestValidation>>;
	/** What the specification read when this later run started. */
	readonly atStart?: RunStartReading;
	/** This later run writes nothing until a person validated it on Mismatch (criterion 50b00229 of feat-ai-session). */
	readonly holds?: boolean;
	/** What its AI found, by the AI's own id for each change. */
	readonly report?: RunReport;
	/** Its AI said it read what it had to read. */
	readonly readingDoneAt?: string;
	/** A person sent what was validated to their AI: the report no longer changes and the AI may write. */
	readonly writingOpenedAt?: string;
	/** Where the documentation it reads is, once the person said it (criterion b6ad9ca2); on this computer until then. */
	readonly docsAt?: DocsLocation;
	/** The phase of the order of work its AI last said it reads (EVO-014): what a run that writes nothing as it reads is followed by. */
	readonly phaseReported?: string;
	/** The features its AI said it finished re-reading, each once (EVO-014). */
	readonly featuresRead?: readonly string[];
	/** The next run started before this one was validated: this one closed and stays in the history (criterion 2dbed801). */
	readonly closedAt?: string | null;
	readonly closedBy?: PersonRef | null;
}

/** A run without what only the server reads: the code read at its validation, the specification read at its start, its report. */
export function withoutServerReadings(run: RetrospecRun): RetrospecRun {
	const { codeAtValidation: _code, atStart: _start, report: _report, ...read } = run;
	return read;
}

export interface RetrospecDocument {
	readonly version: 1;
	/** Oldest first; the last one is the current run. */
	readonly runs: readonly RetrospecRun[];
	/** Kept across runs: a discussion outlives the run it started in. */
	readonly comments: Readonly<Record<string, readonly ItemComment[]>>;
	/** Additional reviewers per question; jobs and the validation lead remain defaults. */
	readonly validationRequests?: Readonly<Record<string, readonly ItemValidationRequest[]>>;
	/**
	 * When the AI first wrote the behaviour (surfaces, actions, rules) of each
	 * feature, by feature id: what tells a feature tree from features that do
	 * something, since the behaviour lives in the engine, not in a section.
	 */
	readonly behaviorAuthored?: Readonly<Record<string, string>>;
	/** The changes made by hand in the validated specification, by element anchor: kept across runs until settled. */
	readonly specEdits?: Readonly<Record<string, SpecEdit>>;
	/**
	 * The elements of a draft changed after people validated them, by element anchor: the version they validated and
	 * the one proposed, and who is asked to validate again (criterion e6029af6).
	 */
	readonly revalidations?: Readonly<Record<string, Revalidation>>;
	/** What was done on Mismatch and by the runs it reports, oldest first: it only ever grows (criterion 64d191d6). */
	readonly history?: readonly HistoryEntry[];
}

export function emptyRetrospecDocument(): RetrospecDocument {
	return { version: 1, runs: [], comments: {} };
}

/** The run a page shows and acts on: the latest one. */
export function currentRun(doc: RetrospecDocument): RetrospecRun | null {
	return doc.runs.length > 0 ? doc.runs[doc.runs.length - 1] : null;
}

/** The last run that was published, whatever runs came after it. */
export function lastPublishedRun(doc: RetrospecDocument): RetrospecRun | null {
	for (let i = doc.runs.length - 1; i >= 0; i--) if (doc.runs[i].publishedAt) return doc.runs[i];
	return null;
}

// ── Parsing (anti-corruption: the stored JSON is untrusted) ──────────────────

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function person(v: unknown): PersonRef | null {
	const o = obj(v);
	const id = str(o.id).trim();
	if (!id) return null;
	return { id, name: str(o.name).trim() || id };
}

function flag(v: unknown): ItemFlag | null {
	const o = obj(v);
	const by = person(o.by);
	const at = str(o.at);
	if (!by || !at) return null;
	if (o.kind === 'rejected' || o.kind === 'later') return { kind: o.kind, by, at };
	if (o.kind === 'shared') {
		const to = person(o.to);
		return to ? { kind: 'shared', by, at, to } : null;
	}
	return null;
}

function verdict(v: unknown): ItemVerdict | null {
	const o = obj(v);
	const validatedBy = arr(o.validatedBy).flatMap((x): ItemValidation[] => {
		const e = obj(x);
		const p = person(e.person);
		const at = str(e.at);
		return p && at ? [{ person: p, at }] : [];
	});
	const f = flag(o.flag);
	if (validatedBy.length === 0 && !f) return null;
	return { title: str(o.title), tab: str(o.tab), validatedBy, flag: f };
}

function people(v: unknown): PersonRef[] {
	const out: PersonRef[] = [];
	for (const x of arr(v)) {
		const p = person(x);
		if (p && !out.some((q) => q.id.toLowerCase() === p.id.toLowerCase())) out.push(p);
	}
	return out;
}

function reminder(v: unknown): ItemReminder | null {
	const o = obj(v);
	const by = person(o.by);
	const to = person(o.to);
	const itemId = str(o.itemId);
	const at = str(o.at);
	return by && to && itemId && at ? { itemId, title: str(o.title), by, to, at } : null;
}

function edits(v: unknown): Record<string, ItemEdit> {
	const out: Record<string, ItemEdit> = {};
	for (const [id, raw] of Object.entries(obj(v))) {
		const o = obj(raw);
		const by = person(o.by);
		const at = str(o.at);
		if (by && at) out[id] = { title: str(o.title), by, at };
	}
	return out;
}

function strings(v: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, value] of Object.entries(obj(v))) if (typeof value === 'string') out[k] = value;
	return out;
}

function driftDecisions(v: unknown): Record<string, DriftDecision> {
	const out: Record<string, DriftDecision> = {};
	for (const [key, raw] of Object.entries(obj(v))) {
		const o = obj(raw);
		const by = person(o.by);
		const at = str(o.at);
		if (!by || !at || (o.decision !== 'kept' && o.decision !== 'sent_back')) continue;
		out[key] = { decision: o.decision, by, at, code: str(o.code), baselineId: strOrNull(o.baselineId) };
	}
	return out;
}

function revisions(v: unknown): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [key, value] of Object.entries(obj(v))) {
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = value;
	}
	return out;
}

function run(v: unknown): RetrospecRun | null {
	const o = obj(v);
	const id = str(o.id);
	const startedAt = str(o.startedAt);
	const startedBy = person(o.startedBy);
	if (!id || !startedAt || !startedBy) return null;
	const verdicts: Record<string, ItemVerdict> = {};
	for (const [itemId, raw] of Object.entries(obj(o.verdicts))) {
		const parsed = verdict(raw);
		if (parsed) verdicts[itemId] = parsed;
	}
	const total = typeof o.itemTotal === 'number' && Number.isFinite(o.itemTotal) ? Math.max(0, Math.round(o.itemTotal)) : 0;
	return {
		id,
		mode: isRetrospecMode(o.mode) ? o.mode : 'repo',
		implicit: o.implicit === true,
		startedAt,
		startedBy,
		baseline: revisions(o.baseline),
		launchedAt: strOrNull(o.launchedAt),
		analysisEndedAt: strOrNull(o.analysisEndedAt),
		analysisEndedBy: person(o.analysisEndedBy),
		reviewStartedAt: strOrNull(o.reviewStartedAt),
		itemTotal: total,
		publishedAt: strOrNull(o.publishedAt),
		publishedBy: person(o.publishedBy),
		baselineId: strOrNull(o.baselineId),
		verdicts,
		...('validationLead' in o ? { validationLead: person(o.validationLead) } : {}),
		// The Specification 360° fields exist only once an act wrote them: a run reads back as it was saved.
		...('notifyWhenReady' in o ? { notifyWhenReady: people(o.notifyWhenReady) } : {}),
		...('reminders' in o ? { reminders: arr(o.reminders).flatMap((r) => (reminder(r) ? [reminder(r)!] : [])) } : {}),
		...('edits' in o ? { edits: edits(o.edits) } : {}),
		...('publishNotified' in o ? { publishNotified: people(o.publishNotified) } : {}),
		...('codeAtValidation' in o ? { codeAtValidation: strings(o.codeAtValidation) } : {}),
		...('drift' in o ? { drift: driftDecisions(o.drift) } : {}),
		...commitOf(o.commit),
		...complementaryOf(o.complementary),
		...('fingerprints' in o ? { fingerprints: strings(o.fingerprints) } : {}),
		...('carried' in o ? { carried: carriedOf(o.carried) } : {}),
		...('throughRequests' in o ? { throughRequests: requestValidationsOf(o.throughRequests) } : {}),
		...('atStart' in o ? { atStart: { fingerprints: strings(obj(o.atStart).fingerprints), titles: strings(obj(o.atStart).titles) } } : {}),
		...('holds' in o && o.holds === true ? { holds: true } : {}),
		...('report' in o ? { report: parseReport(o.report) } : {}),
		...(strOrNull(o.readingDoneAt) ? { readingDoneAt: strOrNull(o.readingDoneAt) as string } : {}),
		...(strOrNull(o.writingOpenedAt) ? { writingOpenedAt: strOrNull(o.writingOpenedAt) as string } : {}),
		...('docsAt' in o ? { docsAt: parseDocsLocation(o.docsAt) } : {}),
		...(strOrNull(o.phaseReported) ? { phaseReported: strOrNull(o.phaseReported) as string } : {}),
		...('featuresRead' in o ? { featuresRead: [...new Set(arr(o.featuresRead).map(str).filter(Boolean))] } : {}),
		...('closedAt' in o ? { closedAt: strOrNull(o.closedAt), closedBy: person(o.closedBy) } : {})
	};
}

function commitOf(v: unknown): { commit?: RunCommit } {
	const o = obj(v);
	const sha = str(o.sha).trim();
	const at = str(o.at);
	return sha && at ? { commit: { sha, repository: strOrNull(o.repository), at } } : {};
}

function complementaryOf(v: unknown): { complementary?: RunComplementary } {
	if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
	const o = obj(v);
	const resumable = resumeOf(o.resumable);
	const scope: RetrospecScope = isRetrospecScope(o.scope) && (o.scope !== 'resume' || resumable) ? o.scope : 'delta';
	return { complementary: { fromRunId: strOrNull(o.fromRunId), fromCommit: strOrNull(o.fromCommit), scope, ...(resumable ? { resumable } : {}) } };
}

function resumeOf(v: unknown): RunResume | null {
	if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
	const o = obj(v);
	const fromRunId = str(o.fromRunId).trim();
	if (!fromRunId) return null;
	const keys = (x: unknown) => arr(x).map(str).filter(Boolean);
	return { fromRunId, read: keys(o.read), interrupted: keys(o.interrupted), left: keys(o.left), fromCommit: strOrNull(o.fromCommit) };
}

function carriedOf(v: unknown): Record<string, CarriedValidation> {
	const out: Record<string, CarriedValidation> = {};
	for (const [id, raw] of Object.entries(obj(v))) {
		const o = obj(raw);
		const fingerprint = str(o.fingerprint);
		const validatedBy = arr(o.validatedBy).flatMap((x): ItemValidation[] => {
			const p = person(obj(x).person);
			const at = str(obj(x).at);
			return p && at ? [{ person: p, at }] : [];
		});
		if (fingerprint && validatedBy.length > 0) out[id] = { fingerprint, validatedBy };
	}
	return out;
}

function requestValidationsOf(v: unknown): Record<string, RequestValidation> {
	const out: Record<string, RequestValidation> = {};
	for (const [id, raw] of Object.entries(obj(v))) {
		const o = obj(raw);
		const requestId = str(o.requestId).trim();
		const at = str(o.at);
		const fingerprint = str(o.fingerprint);
		if (!requestId || !at) continue;
		const withdrawnBy = person(obj(o.withdrawn).by);
		const withdrawnAt = str(obj(o.withdrawn).at);
		out[id] = {
			requestId,
			requestKey: str(o.requestKey).trim() || requestId,
			approvedBy: people(o.approvedBy),
			at,
			fingerprint,
			...(withdrawnBy && withdrawnAt ? { withdrawn: { by: withdrawnBy, at: withdrawnAt } } : {})
		};
	}
	return out;
}

function comment(v: unknown): ItemComment | null {
	const o = obj(v);
	const id = str(o.id);
	const by = person(o.by);
	const at = str(o.at);
	const text = str(o.text).trim();
	if (!id || !by || !at || !text) return null;
	return { id, by, at, text, resolved: o.resolved === true };
}

/** Read a stored document; anything unreadable reads as absent, never as a crash. */
export function parseRetrospecDocument(raw: unknown): RetrospecDocument {
	const o = obj(raw);
	const comments: Record<string, ItemComment[]> = {};
	const validationRequests: Record<string, ItemValidationRequest[]> = {};
	for (const [itemId, list] of Object.entries(obj(o.validationRequests))) {
		const requests: ItemValidationRequest[] = [];
		for (const raw of arr(list)) {
			const request = obj(raw);
			const to = person(request.to);
			const by = person(request.by);
			const at = str(request.at);
			if (to && by && at && !requests.some((existing) => existing.to.id.toLowerCase() === to.id.toLowerCase())) {
				requests.push({ to, by, at, title: str(request.title) });
			}
		}
		if (requests.length > 0) validationRequests[itemId] = requests;
	}
	for (const [itemId, list] of Object.entries(obj(o.comments))) {
		const parsed = arr(list).flatMap((c) => {
			const x = comment(c);
			return x ? [x] : [];
		});
		if (parsed.length > 0) comments[itemId] = parsed;
	}
	return {
		version: 1,
		runs: arr(o.runs).flatMap((r) => {
			const x = run(r);
			return x ? [x] : [];
		}),
		comments,
		...(Object.keys(validationRequests).length > 0 ? { validationRequests } : {}),
		...behaviorAuthoredOf(o.behaviorAuthored),
		...specEditsOf(o.specEdits),
		...revalidationsOf(o.revalidations),
		...historyOf(o.history)
	};
}

function historyOf(raw: unknown): { history?: HistoryEntry[] } {
	const history = parseHistory(raw);
	return history.length > 0 ? { history } : {};
}

function revalidationsOf(raw: unknown): { revalidations?: Record<string, Revalidation> } {
	const records = parseRevalidations(raw);
	return Object.keys(records).length > 0 ? { revalidations: records } : {};
}

function specEditsOf(raw: unknown): { specEdits?: Record<string, SpecEdit> } {
	const edits = parseSpecEdits(raw);
	return Object.keys(edits).length > 0 ? { specEdits: edits } : {};
}

function behaviorAuthoredOf(raw: unknown): { behaviorAuthored?: Record<string, string> } {
	const entries = Object.entries(obj(raw)).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0);
	return entries.length > 0 ? { behaviorAuthored: Object.fromEntries(entries) } : {};
}
