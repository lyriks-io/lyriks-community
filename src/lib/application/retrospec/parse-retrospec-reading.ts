import { isChangeKind, isCodeVerdict, type ReportedChangeInput, type SpecEditReport, type WrittenChange } from '$domain/retrospec';

/**
 * What a person's AI reports of the retrospecification it runs, read from an
 * untrusted body (criteria c50587fb, 23397c95 of feat-mcp-authoring): that it
 * received the prompt, the commit it read, and what the code says of each hand
 * edit Code drift lists. All are optional; a body with none only reads where
 * the run stands.
 */
export interface RetrospecReading {
	readonly commit: { readonly sha: string; readonly repository: string | null } | null;
	readonly checks: readonly SpecEditReport[];
	/** The AI has the prompt that starts the run (criterion a6f870af). */
	readonly received: boolean;
	/** What a run that holds its changes found (criterion 50b00229). */
	readonly changes: readonly ReportedChangeInput[];
	/** Rejected changes that are not changes at all (criterion eb132bbd). */
	readonly withdrawn: readonly string[];
	/** That run read what it had to read. */
	readonly finished: boolean;
	/** The elements each validated change became, once written (criterion 1aaa8316). */
	readonly written: readonly WrittenChange[];
	/** The phase of the order of work the AI says it reads now (EVO-014, action 83ba020b). */
	readonly phase: string | null;
	/** The features it finished re-reading (EVO-014, action ef746636). */
	readonly read: readonly string[];
}

type Raw = Record<string, unknown>;
const MAX_CHECKS = 500;
const MAX_CHANGES = 2000;
const optional = (v: unknown, max: number): string | null => (v === undefined || v === null ? '' : short(v, max));

function parseChange(x: unknown): ReportedChangeInput | string {
	const c: Raw = x !== null && typeof x === 'object' ? (x as Raw) : {};
	const id = short(c.id, 200)?.trim();
	if (!id) return 'Each change carries the id you give it.';
	if (!isChangeKind(c.kind)) return `The change ${id} is "new", "changed" or "removed".`;
	const anchor = optional(c.anchor, 400);
	const dock = optional(c.dock, 400);
	const title = short(c.title, 1000)?.trim();
	const proposed = optional(c.proposed, 8000);
	const code = optional(c.code, 4000);
	const where = optional(c.where, 500);
	if (anchor === null || dock === null || proposed === null || code === null || where === null) return `The change ${id} carries short texts.`;
	if (!title) return `The change ${id} carries a title.`;
	if (c.kind !== 'new' && !anchor.trim()) return `The change ${id} names the anchor of the element it changes or removes.`;
	if (c.kind === 'new' && !dock.trim()) return `The new element ${id} names the anchor it docks on.`;
	if (c.kind !== 'removed' && !proposed.trim()) return `The change ${id} says what the element would read.`;
	return { id, kind: c.kind, anchor: anchor.trim() || null, dock: dock.trim() || null, title, proposed: proposed.trim(), code: code.trim(), where: where.trim() };
}

function parseWritten(x: unknown): WrittenChange | string {
	const w: Raw = x !== null && typeof x === 'object' ? (x as Raw) : {};
	const change = short(w.change, 200)?.trim();
	if (!change || !Array.isArray(w.elements)) return 'Each entry of written names its change and the elements it became.';
	const elements: { anchor: string; title: string }[] = [];
	for (const e of w.elements as unknown[]) {
		const o: Raw = e !== null && typeof e === 'object' ? (e as Raw) : {};
		const anchor = short(o.anchor, 400)?.trim();
		if (!anchor) return `The elements of ${change} name their anchor.`;
		elements.push({ anchor, title: optional(o.title, 1000)?.trim() ?? '' });
	}
	return { change, elements };
}
const short = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

export function parseRetrospecReading(body: unknown): { ok: true; reading: RetrospecReading } | { ok: false; reason: string } {
	const o: Raw = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Raw) : {};
	let commit: RetrospecReading['commit'] = null;
	if (o.commit !== undefined && o.commit !== null) {
		const c: Raw = typeof o.commit === 'object' ? (o.commit as Raw) : { sha: o.commit };
		const sha = short(c.sha, 64)?.trim();
		if (!sha) return { ok: false, reason: 'commit.sha is the commit the run read, as git names it.' };
		const repository = c.repository === undefined || c.repository === null ? null : short(c.repository, 500);
		if (repository === null && c.repository !== undefined && c.repository !== null) return { ok: false, reason: 'commit.repository is a short text.' };
		commit = { sha, repository: repository?.trim() || null };
	}
	const raw = o.checks === undefined ? [] : o.checks;
	if (!Array.isArray(raw) || raw.length > MAX_CHECKS) return { ok: false, reason: `checks is a list of at most ${MAX_CHECKS} readings.` };
	const checks: SpecEditReport[] = [];
	for (const x of raw) {
		const c: Raw = x !== null && typeof x === 'object' ? (x as Raw) : {};
		const itemId = short(c.anchor, 400)?.trim();
		if (!itemId) return { ok: false, reason: 'Each check names the anchor of the edit it reads.' };
		if (!isCodeVerdict(c.says)) return { ok: false, reason: `The check of ${itemId} says "same" or "other".` };
		const code = c.code === undefined ? '' : short(c.code, 4000);
		const where = c.where === undefined ? '' : short(c.where, 500);
		if (code === null || where === null) return { ok: false, reason: `The check of ${itemId} carries a short code reading and place.` };
		checks.push({ itemId, verdict: c.says, code, where });
	}
	const rawChanges = o.changes === undefined ? [] : o.changes;
	if (!Array.isArray(rawChanges) || rawChanges.length > MAX_CHANGES) return { ok: false, reason: `changes is a list of at most ${MAX_CHANGES} differences.` };
	const changes: ReportedChangeInput[] = [];
	for (const x of rawChanges) {
		const change = parseChange(x);
		if (typeof change === 'string') return { ok: false, reason: change };
		changes.push(change);
	}
	const rawWritten = o.written === undefined ? [] : o.written;
	if (!Array.isArray(rawWritten) || rawWritten.length > MAX_CHANGES) return { ok: false, reason: `written is a list of at most ${MAX_CHANGES} changes.` };
	const written: WrittenChange[] = [];
	for (const x of rawWritten) {
		const entry = parseWritten(x);
		if (typeof entry === 'string') return { ok: false, reason: entry };
		written.push(entry);
	}
	const rawWithdrawn = o.withdrawn === undefined ? [] : o.withdrawn;
	if (!Array.isArray(rawWithdrawn) || rawWithdrawn.length > MAX_CHANGES) return { ok: false, reason: `withdrawn is a list of at most ${MAX_CHANGES} change ids.` };
	const withdrawn: string[] = [];
	for (const x of rawWithdrawn) {
		const id = short(x, 200)?.trim();
		if (!id) return { ok: false, reason: 'withdrawn names the id of each change.' };
		withdrawn.push(id);
	}
	// The phase is checked against the order of work by the act, which names the eight phases (rule 2d4bc8ba).
	const phase = o.phase === undefined || o.phase === null ? null : short(o.phase, 40)?.trim() || '';
	if (phase === '') return { ok: false, reason: 'phase names the phase of the order of work you read now.' };
	const rawRead = o.read === undefined ? [] : o.read;
	if (!Array.isArray(rawRead) || rawRead.length > MAX_CHANGES) return { ok: false, reason: `read is a list of at most ${MAX_CHANGES} feature ids.` };
	const read: string[] = [];
	for (const x of rawRead) {
		const id = short(x, 200)?.trim();
		if (!id) return { ok: false, reason: 'Name the feature you re-read by its id.' };
		read.push(id);
	}
	return { ok: true, reading: { commit, checks, received: o.received === true, changes, withdrawn, finished: o.finished === true, written, phase, read } };
}
