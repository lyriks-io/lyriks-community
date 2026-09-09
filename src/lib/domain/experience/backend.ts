/**
 * Step 05 — Simulator "fake backend". A handful of named collections (entities)
 * the prototype can read and write at run time, so navigation feels real: a list
 * shows seeded records, a form submit appends one, and the new row survives every
 * screen change until the run is restarted.
 *
 * Seed data is generated DETERMINISTICALLY from each field's semantic kind (name,
 * email, price, …) — no randomness — so rows are stable across re-renders and
 * authoring stays effortless (declare a shape, get believable rows for free).
 */
import type { Option } from '$domain/shared';

/* ── Field kinds drive the fake-data generator ───────────────────────── */
export type FakeFieldKind =
	| 'fullName'
	| 'firstName'
	| 'email'
	| 'company'
	| 'city'
	| 'country'
	| 'price'
	| 'number'
	| 'date'
	| 'status'
	| 'category'
	| 'sentence'
	| 'boolean'
	| 'id';

export const FAKE_FIELD_KINDS = [
	{ code: 'fullName', label: 'Full name' },
	{ code: 'firstName', label: 'First name' },
	{ code: 'email', label: 'Email' },
	{ code: 'company', label: 'Company' },
	{ code: 'city', label: 'City' },
	{ code: 'country', label: 'Country' },
	{ code: 'price', label: 'Price' },
	{ code: 'number', label: 'Number' },
	{ code: 'date', label: 'Date' },
	{ code: 'status', label: 'Status' },
	{ code: 'category', label: 'Category' },
	{ code: 'sentence', label: 'Sentence' },
	{ code: 'boolean', label: 'Yes / No' },
	{ code: 'id', label: 'ID' }
] as const satisfies readonly Option[];

export interface BackendField {
	readonly id: string;
	name: string;
	kind: FakeFieldKind;
	/** Fixed value pool (declared enum members) — overrides the kind's generator. */
	options?: string[];
}

export interface BackendCollection {
	readonly id: string;
	/** Entity name a list / binding references (e.g. "Expense", "User"). */
	name: string;
	fields: BackendField[];
	/** How many fake rows to seed at run start (0–50). */
	seedCount: number;
	/**
	 * Step-07 entity this collection was imported from (provenance for re-sync and
	 * drift detection). Absent on hand-made collections; the collection stays fully
	 * editable either way (import-once-editable, not a live mirror).
	 */
	sourceEntityId?: string;
	/**
	 * Explicit demo rows (keyed by field name), seeded INSTEAD of generated ones.
	 * Generated values can't correlate across fields (each field picks from its own
	 * pool), so realistic records — a "Free" plan whose price is 0, a failed run
	 * whose error matches its status — need authored rows. Missing fields are
	 * filled from the generator so partial rows still render complete.
	 */
	rows?: Record<string, unknown>[];
}

function newId(): string {
	return crypto.randomUUID();
}

export function createBackendField(overrides: Partial<BackendField> = {}): BackendField {
	return { id: newId(), name: '', kind: 'fullName', ...overrides };
}

export function createBackendCollection(overrides: Partial<BackendCollection> = {}): BackendCollection {
	return {
		id: newId(),
		name: '',
		fields: [createBackendField({ name: 'Name', kind: 'fullName' })],
		seedCount: 5,
		...overrides
	};
}

/* ── Deterministic fake-data generation ──────────────────────────────── */
const FIRST = ['Ava', 'Liam', 'Noah', 'Mia', 'Emma', 'Lucas', 'Olivia', 'Ethan', 'Sofia', 'Leo', 'Chloe', 'Hugo', 'Zoe', 'Nina', 'Adam'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Simon', 'Garcia', 'Roux', 'Fontaine', 'Mercier', 'Blanc', 'Faure'];
const COMPANY = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Soylent', 'Vandelay', 'Stark', 'Wayne', 'Wonka'];
const CITY = ['Paris', 'Lyon', 'Berlin', 'Madrid', 'Lisbon', 'Milan', 'Vienna', 'Dublin', 'Oslo', 'Porto'];
const COUNTRY = ['France', 'Germany', 'Spain', 'Italy', 'Portugal', 'Ireland', 'Norway', 'Austria'];
const STATUS = ['Active', 'Pending', 'Paid', 'Archived', 'Draft', 'Overdue'];
const CATEGORY = ['Travel', 'Meals', 'Software', 'Office', 'Hardware', 'Marketing'];
const WORDS = ['quarterly', 'client', 'review', 'invoice', 'travel', 'expense', 'team', 'lunch', 'license', 'renewal', 'onboarding', 'report'];

/** Stable small hash of a string → non-negative int (varies values per field). */
function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const pick = <T>(pool: readonly T[], i: number) => pool[((i % pool.length) + pool.length) % pool.length];

/** One deterministic value for a (kind, rowIndex, salt) triple. */
export function fakeValue(kind: FakeFieldKind, row: number, salt: number): string | number | boolean {
	const i = row * 7 + salt;
	switch (kind) {
		case 'fullName':
			return `${pick(FIRST, i)} ${pick(LAST, i * 3 + 1)}`;
		case 'firstName':
			return pick(FIRST, i);
		case 'email':
			return `${pick(FIRST, i)}.${pick(LAST, i * 3 + 1)}@${pick(COMPANY, i)}.com`.toLowerCase();
		case 'company':
			return pick(COMPANY, i);
		case 'city':
			return pick(CITY, i);
		case 'country':
			return pick(COUNTRY, i);
		case 'price':
			return Math.round((((i * 137) % 900) + 100 + ((i * 7) % 100) / 100) * 100) / 100;
		case 'number':
			return (i * 53) % 1000;
		case 'date':
			return `2024-${pad2(((i % 12) + 1))}-${pad2(((i * 5) % 28) + 1)}`;
		case 'status':
			return pick(STATUS, i);
		case 'category':
			return pick(CATEGORY, i);
		case 'sentence':
			return `${pick(WORDS, i)} ${pick(WORDS, i + 1)} ${pick(WORDS, i + 2)}`;
		case 'boolean':
			return i % 2 === 0;
		case 'id':
			return `#${1000 + row}`;
		default:
			return '';
	}
}

/** A field's display key — its name, or the kind as a fallback. */
export function fieldKey(f: BackendField): string {
	return f.name.trim() || f.kind;
}

/** One fully-populated fake record at an absolute row index. */
export function fakeRecord(col: BackendCollection, rowIndex: number): Record<string, unknown> {
	const rec: Record<string, unknown> = {};
	for (const f of col.fields)
		rec[fieldKey(f)] =
			f.options && f.options.length > 0
				? pick(f.options, rowIndex * 7 + hash(fieldKey(f)))
				: fakeValue(f.kind, rowIndex, hash(fieldKey(f)));
	return rec;
}

/** Generate the seeded rows for a collection (deterministic). */
export function generateRows(col: BackendCollection): Record<string, unknown>[] {
	if (col.fields.length === 0) return [];
	// Authored rows win: exactly those records, gap-filled so every field renders.
	if (col.rows && col.rows.length > 0)
		return col.rows.slice(0, 50).map((row, i) => ({ ...fakeRecord(col, i), ...row }));
	const n = Math.max(0, Math.min(50, Math.round(col.seedCount)));
	return Array.from({ length: n }, (_, row) => fakeRecord(col, row));
}

/** Normalized lookup key for a collection name (shared by runtime + bindings). */
export function collectionKey(name: string | undefined | null): string {
	return (name ?? '').trim().toLowerCase();
}

/* ── Default list-row field pick ─────────────────────────────────────── */
/** Field names that read as a human label for a row, regardless of kind. */
const LABELY_NAMES = ['name', 'title', 'label', 'message', 'summary', 'subject', 'displayname', 'fullname', 'email'];
/** Kind preference for a row's display text — human-ish first, `id` dead last. */
const KIND_RANK: Record<FakeFieldKind, number> = {
	fullName: 0,
	firstName: 1,
	email: 2,
	company: 3,
	sentence: 4,
	city: 5,
	country: 6,
	category: 7,
	status: 8,
	date: 9,
	price: 10,
	number: 11,
	boolean: 12,
	id: 13
};

/**
 * Up to two display fields for a compact list row. An entity's first columns are
 * routinely `id` + relation ids, which render as meaningless "#1000" rows — so
 * prefer fields that read as a label (name/title/message…, then human-ish kinds);
 * `id`-kind fields only surface when nothing better exists. The secondary favors
 * a different kind than the primary so a row reads "label + qualifier".
 */
export function primaryFields(col: BackendCollection): BackendField[] {
	if (col.fields.length <= 2) return col.fields.slice(0, 2);
	const score = (f: BackendField, idx: number) =>
		(LABELY_NAMES.includes(fieldKey(f).trim().toLowerCase()) ? -100 : 0) + (KIND_RANK[f.kind] ?? 13) * 10 + idx;
	const ranked = col.fields.map((f, idx) => ({ f, s: score(f, idx) })).sort((a, b) => a.s - b.s);
	const primary = ranked[0].f;
	const secondary = ranked.slice(1).find((r) => r.f.kind !== primary.kind)?.f ?? ranked[1].f;
	return [primary, secondary];
}

/** Find a collection by (case-insensitive) name; '' never matches. */
export function findCollection(
	cols: readonly BackendCollection[],
	name: string | undefined | null
): BackendCollection | null {
	const key = (name ?? '').trim().toLowerCase();
	if (!key) return null;
	return cols.find((c) => c.name.trim().toLowerCase() === key) ?? null;
}

/* ── Anti-corruption coercion ────────────────────────────────────────── */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const KIND_CODES = FAKE_FIELD_KINDS.map((k) => k.code) as readonly string[];

export function coerceBackend(raw: unknown): BackendCollection[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(isObj).map((c) => {
		const fields = Array.isArray(c.fields)
			? c.fields.filter(isObj).map((f) => ({
					id: typeof f.id === 'string' ? f.id : newId(),
					name: typeof f.name === 'string' ? f.name : '',
					kind: (KIND_CODES.includes(f.kind as string) ? f.kind : 'fullName') as FakeFieldKind,
					...(Array.isArray(f.options) && f.options.some((x) => typeof x === 'string')
						? { options: (f.options as unknown[]).filter((x): x is string => typeof x === 'string') }
						: {})
				}))
			: [];
		const seed = typeof c.seedCount === 'number' && Number.isFinite(c.seedCount) ? c.seedCount : 5;
		const rows = Array.isArray(c.rows)
			? c.rows.filter(isObj).slice(0, 50)
			: undefined;
		return {
			id: typeof c.id === 'string' ? c.id : newId(),
			name: typeof c.name === 'string' ? c.name : '',
			fields,
			seedCount: Math.max(0, Math.min(50, Math.round(seed))),
			...(typeof c.sourceEntityId === 'string' && c.sourceEntityId
				? { sourceEntityId: c.sourceEntityId }
				: {}),
			...(rows && rows.length > 0 ? { rows } : {})
		};
	});
}
