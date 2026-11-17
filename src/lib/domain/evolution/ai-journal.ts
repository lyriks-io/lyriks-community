/**
 * What the AI wrote for the click it is on, kept so that the person can cancel
 * that request and get every value back (ac-evo-live-cancel, "The AI writes
 * for the click it is on"). A write is journaled as the places it changed, each
 * with the value it replaced and the value it left; undoing puts the first back
 * wherever the second still stands, and keeps (and names) whatever someone
 * changed since.
 *
 * Places are paths into plain JSON: object keys, and array elements by their
 * `id` when every element of the array carries one, so an element is found
 * again after others moved. Any other value is replaced whole.
 */

/** The documents a write may reach: the Evolution section, the documents register, the features, the data. */
export type JournalSection = 'evolution' | 'documents' | 'features' | 'data';

/** One step of a path: an object key, or the element of an array carrying this id. */
export type JournalSegment = string | { readonly id: string };

/** One place a write changed. `before`/`after` are absent when the place did not exist then. */
export interface JournalEntry {
	readonly section: JournalSection;
	readonly path: readonly JournalSegment[];
	readonly existedBefore: boolean;
	readonly before?: unknown;
	readonly existsAfter: boolean;
	readonly after?: unknown;
	/** For an array element: where it stood, so a removed one goes back to its place. */
	readonly index?: number;
}

type Plain = Record<string, unknown>;

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | null => (isPlain(v) && typeof v.id === 'string' && v.id !== '' ? v.id : null);
const keyedById = (a: readonly unknown[]) => a.every((v) => idOf(v) !== null);

export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
	if (isPlain(a) && isPlain(b)) {
		const ka = Object.keys(a).filter((k) => a[k] !== undefined);
		const kb = Object.keys(b).filter((k) => b[k] !== undefined);
		return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
	}
	return false;
}

const segKey = (s: JournalSegment) => (typeof s === 'string' ? `.${s}` : `[${s.id}]`);
const pathKey = (section: JournalSection, path: readonly JournalSegment[]) => `${section}:${path.map(segKey).join('')}`;
const isPrefix = (prefix: readonly JournalSegment[], path: readonly JournalSegment[]) =>
	prefix.length < path.length && prefix.every((s, i) => segKey(s) === segKey(path[i]));

/** A place as a reader names it: `stepAnswers.functional_spec.diagram`, `fieldThreads[…].messages[…]`. */
export function placeOf(entry: Pick<JournalEntry, 'path'>): string {
	return entry.path.map((s, i) => (typeof s === 'string' ? `${i === 0 ? '' : '.'}${s}` : `[${s.id.slice(0, 8)}]`)).join('');
}

/**
 * The places a write changed between two states of one document. `skip` leaves
 * out places that are bookkeeping rather than content (the session, the clicks).
 */
export function journalChanges(
	section: JournalSection,
	before: unknown,
	after: unknown,
	skip: (path: readonly JournalSegment[]) => boolean = () => false
): JournalEntry[] {
	const out: JournalEntry[] = [];
	const walk = (b: unknown, a: unknown, path: JournalSegment[]) => {
		if (b === a || skip(path)) return;
		if (isPlain(b) && isPlain(a)) {
			for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
				const inB = b[key] !== undefined;
				const inA = a[key] !== undefined;
				if (inB && inA) walk(b[key], a[key], [...path, key]);
				else if (inB || inA) {
					if (skip([...path, key])) continue;
					out.push({ section, path: [...path, key], existedBefore: inB, existsAfter: inA, ...(inB ? { before: b[key] } : {}), ...(inA ? { after: a[key] } : {}) });
				}
			}
			return;
		}
		if (Array.isArray(b) && Array.isArray(a) && keyedById(b) && keyedById(a)) {
			const inB = new Map(b.map((v, i) => [idOf(v)!, { v, i }]));
			const inA = new Map(a.map((v, i) => [idOf(v)!, { v, i }]));
			for (const [id, { v, i }] of inB)
				if (!inA.has(id)) out.push({ section, path: [...path, { id }], existedBefore: true, before: v, existsAfter: false, index: i });
			for (const [id, { v, i }] of inA) {
				const was = inB.get(id);
				if (was) walk(was.v, v, [...path, { id }]);
				else out.push({ section, path: [...path, { id }], existedBefore: false, existsAfter: true, after: v, index: i });
			}
			return;
		}
		if (deepEqual(b, a)) return;
		out.push({
			section,
			path,
			existedBefore: b !== undefined,
			existsAfter: a !== undefined,
			...(b !== undefined ? { before: b } : {}),
			...(a !== undefined ? { after: a } : {})
		});
	};
	walk(before, after, []);
	return out;
}

type Found = { readonly exists: false } | { readonly exists: true; readonly value: unknown };

/** The value at a path, or that nothing stands there. */
export function valueAt(root: unknown, path: readonly JournalSegment[]): Found {
	let current: unknown = root;
	for (const seg of path) {
		if (typeof seg === 'string') {
			if (!isPlain(current) || current[seg] === undefined) return { exists: false };
			current = current[seg];
		} else {
			if (!Array.isArray(current)) return { exists: false };
			const hit = current.find((v) => idOf(v) === seg.id);
			if (hit === undefined) return { exists: false };
			current = hit;
		}
	}
	return { exists: true, value: current };
}

/** A copy of root with the value at path set (or removed when `value` is absent); null when the parent is gone. */
function withValueAt(root: unknown, path: readonly JournalSegment[], next: Found, index?: number): unknown | null {
	if (path.length === 0) return next.exists ? next.value : null;
	const [seg, ...rest] = path;
	if (typeof seg === 'string') {
		if (!isPlain(root)) return null;
		if (rest.length === 0) {
			const copy: Plain = { ...root };
			if (next.exists) copy[seg] = next.value;
			else delete copy[seg];
			return copy;
		}
		if (root[seg] === undefined) return null;
		const child = withValueAt(root[seg], rest, next, index);
		return child === null ? null : { ...root, [seg]: child };
	}
	if (!Array.isArray(root)) return null;
	const at = root.findIndex((v) => idOf(v) === seg.id);
	if (rest.length === 0) {
		if (!next.exists) return at < 0 ? root : root.filter((_, i) => i !== at);
		if (at >= 0) return root.map((v, i) => (i === at ? next.value : v));
		const copy = [...root];
		copy.splice(Math.min(index ?? copy.length, copy.length), 0, next.value);
		return copy;
	}
	if (at < 0) return null;
	const child = withValueAt(root[at], rest, next, index);
	return child === null ? null : root.map((v, i) => (i === at ? child : v));
}

/**
 * Fold a new write into the journal of the click: a place written again keeps
 * the value the AI first replaced and takes the value it now leaves; a place
 * inside one already journaled refreshes that one; a place around ones already
 * journaled takes them in, with what they replaced put back into its `before`.
 * A place the AI brought back to what it was drops out.
 */
export function mergeJournal(
	journal: readonly JournalEntry[],
	changes: readonly JournalEntry[],
	afterRoots: Partial<Record<JournalSection, unknown>>
): JournalEntry[] {
	let out = [...journal];
	for (const change of changes) {
		const key = pathKey(change.section, change.path);
		const same = out.findIndex((e) => pathKey(e.section, e.path) === key);
		if (same >= 0) {
			const first = out[same];
			out[same] = { ...first, existsAfter: change.existsAfter, ...(change.existsAfter ? { after: change.after } : { after: undefined }) };
			continue;
		}
		const ancestor = out.findIndex((e) => e.section === change.section && isPrefix(e.path, change.path));
		if (ancestor >= 0) {
			const outer = out[ancestor];
			const now = valueAt(afterRoots[change.section], outer.path);
			out[ancestor] = { ...outer, existsAfter: now.exists, after: now.exists ? now.value : undefined };
			continue;
		}
		const inner = out.filter((e) => e.section === change.section && isPrefix(change.path, e.path));
		let before = change.before;
		for (const e of inner) {
			if (!change.existedBefore) break;
			const relative = e.path.slice(change.path.length);
			const restored = withValueAt(before, relative, e.existedBefore ? { exists: true, value: e.before } : { exists: false }, e.index);
			if (restored !== null) before = restored;
		}
		out = out.filter((e) => !inner.includes(e));
		out.push({ ...change, ...(change.existedBefore ? { before } : {}) });
	}
	return out
		.map((e) => ({ ...e, ...(e.existsAfter ? {} : { after: undefined }) }))
		.filter((e) => !(e.existedBefore === e.existsAfter && (!e.existedBefore || deepEqual(e.before, e.after))))
		.map(stripUndefined);
}

function stripUndefined(e: JournalEntry): JournalEntry {
	const copy = { ...e } as Record<string, unknown>;
	for (const k of Object.keys(copy)) if (copy[k] === undefined) delete copy[k];
	return copy as unknown as JournalEntry;
}

export interface Undone {
	/** Each document with every place the AI changed put back, where it still held what the AI left. */
	readonly roots: Partial<Record<JournalSection, unknown>>;
	readonly undone: readonly JournalEntry[];
	/** The places someone changed since the AI wrote them: they keep that change. */
	readonly kept: readonly JournalEntry[];
}

/** Undo a journal, newest place first, over the documents as they stand now. */
export function undoJournal(roots: Partial<Record<JournalSection, unknown>>, journal: readonly JournalEntry[]): Undone {
	const out: Partial<Record<JournalSection, unknown>> = { ...roots };
	const undone: JournalEntry[] = [];
	const kept: JournalEntry[] = [];
	for (const entry of [...journal].reverse()) {
		if (!(entry.section in out)) {
			kept.push(entry);
			continue;
		}
		const now = valueAt(out[entry.section], entry.path);
		const untouched = now.exists === entry.existsAfter && (!now.exists || deepEqual(now.value, entry.after));
		if (!untouched) {
			kept.push(entry);
			continue;
		}
		const restored = withValueAt(out[entry.section], entry.path, entry.existedBefore ? { exists: true, value: entry.before } : { exists: false }, entry.index);
		if (restored === null) kept.push(entry);
		else {
			out[entry.section] = restored;
			undone.push(entry);
		}
	}
	return { roots: out, undone, kept };
}
