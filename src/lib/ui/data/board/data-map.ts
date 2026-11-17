import {
	FIELD_TYPES,
	NO_PLACEMENTS,
	rootFieldsOfEntity,
	type DataEntity,
	type MapPlacements,
	type DbEngine,
	type EntityField,
	type EntityOrigin,
	type HostKind,
	type ProjectDataDraft
} from '$domain/data';
import { matchesQuery } from '$ui/design-system/search';
import { ENGINE_HEX, HOST_TYPE_HEX } from '../infra-style';
import { endMarks, relationEnds, type RelationEnd } from './crows-foot';
import { layerLayout, shelf, type LayerLink } from './erd-layout';
import { routePath } from './erd-route';
import { elbowRoutes, type ElbowAsk } from './erd-elbow';

/**
 * The Data map: the data model diagram that is also the infrastructure map.
 * Tables sit inside their database, databases inside the machine they run on.
 * Pure (layout, lens colors, client visibility, filtering) so the canvas only
 * draws, and every reading here is testable without a DOM.
 */

/* ───────────────────────────── client visibility ───────────────────────── */

/**
 * Visibility is binary: VISIBLE when the client experience shows the data
 * (automatic) or someone forced it on; HIDDEN when someone forced it off;
 * ANOMALY when it left the experience WITHOUT a human decision, which breaks
 * "nothing is removed unless a person chose to", so it is flagged.
 */
export type VisibilityStatus = 'visible' | 'hidden' | 'anomaly';

export function visibilityStatus(
	draft: ProjectDataDraft,
	derived: ReadonlySet<string>,
	id: string
): VisibilityStatus {
	const override = draft.visibility?.[id];
	if (override === 'shown') return 'visible';
	if (override === 'hidden') return 'hidden';
	return derived.has(id) ? 'visible' : 'anomaly';
}

export interface Anomaly {
	id: string;
	entityId: string;
	label: string;
}

/** Every table and field that left the client experience silently. */
export function visibilityAnomalies(
	draft: ProjectDataDraft,
	derived: ReadonlySet<string>
): Anomaly[] {
	const out: Anomaly[] = [];
	for (const e of draft.entities) {
		const name = e.name || 'Untitled table';
		if (visibilityStatus(draft, derived, e.id) === 'anomaly')
			out.push({ id: e.id, entityId: e.id, label: name });
		for (const f of draft.fields)
			if (f.entityId === e.id && visibilityStatus(draft, derived, f.id) === 'anomaly')
				out.push({ id: f.id, entityId: e.id, label: `${name} · ${f.name || 'field'}` });
	}
	return out;
}

/* ─────────────────────────────── field keys ─────────────────────────────── */

/** What a field is to its table, one badge per row (PK wins over FK over UK). */
export type FieldKey = 'none' | 'primary' | 'unique' | 'foreign';

export function fieldKeyOf(f: EntityField): FieldKey {
	if (f.isId) return 'primary';
	if (f.type === 'relation') return 'foreign';
	if (f.isUnique) return 'unique';
	return 'none';
}

export const KEY_BADGE: Record<FieldKey, string> = {
	none: '',
	primary: 'PK',
	unique: 'UK',
	foreign: 'FK'
};

/* ─────────────────────────────────── lenses ─────────────────────────────── */

export type Lens = 'database' | 'host' | 'origin' | 'visibility';

/** Which relation lines the map draws. */
export type LinkMode = 'all' | 'focused' | 'off';

export const LENSES: { id: Lens; label: string }[] = [
	{ id: 'database', label: 'Database' },
	{ id: 'host', label: 'Host' },
	{ id: 'origin', label: 'Origin' },
	{ id: 'visibility', label: 'Client visibility' }
];

export const ORIGIN_HEX: Record<EntityOrigin, string> = {
	journey: '#0066ff',
	feature: '#bb46f5',
	manual: '#8a8a92'
};
export const ORIGIN_LABEL: Record<EntityOrigin, string> = {
	journey: 'From a journey',
	feature: 'From a feature',
	manual: 'Added by hand'
};

export const VISIBILITY_HEX: Record<VisibilityStatus, string> = {
	visible: '#1fa98a',
	hidden: '#8a8a92',
	anomaly: '#ffa101'
};
export const VISIBILITY_LABEL: Record<VisibilityStatus, string> = {
	visible: 'Reaches a client',
	hidden: 'Hidden on purpose',
	anomaly: 'Left silently'
};

/** Neutral hue for a table that is not placed anywhere yet. */
export const UNPLACED_HEX = '#a9a59d';

export interface LensContext {
	draft: ProjectDataDraft;
	derived: ReadonlySet<string>;
}

/** The accent a table carries under a lens. */
export function tableColor(lens: Lens, ctx: LensContext, entity: DataEntity): string {
	const db = entity.databaseId
		? ctx.draft.databases.find((d) => d.id === entity.databaseId)
		: undefined;
	switch (lens) {
		case 'database':
			return db ? ENGINE_HEX[db.engine as DbEngine] : UNPLACED_HEX;
		case 'host': {
			const host = db?.hostId ? ctx.draft.hosts.find((h) => h.id === db.hostId) : undefined;
			return host ? HOST_TYPE_HEX[host.kind as HostKind] : UNPLACED_HEX;
		}
		case 'origin':
			return ORIGIN_HEX[entity.derivedFrom] ?? UNPLACED_HEX;
		case 'visibility':
			return VISIBILITY_HEX[visibilityStatus(ctx.draft, ctx.derived, entity.id)];
	}
}

/* ─────────────────────────────────── filters ────────────────────────────── */

export interface MapFilter {
	query: string;
	/** Host id, `__none__` for tables on no machine, '' for all. */
	hostId: string;
	/** Database id, `__none__` for unplaced tables, '' for all. */
	databaseId: string;
	origin: EntityOrigin | '';
	visibility: VisibilityStatus | '';
}

export const EMPTY_FILTER: MapFilter = {
	query: '',
	hostId: '',
	databaseId: '',
	origin: '',
	visibility: ''
};

export const isFiltering = (f: MapFilter): boolean =>
	Boolean(f.query.trim() || f.hostId || f.databaseId || f.origin || f.visibility);

export interface FilterResult {
	/** Tables that pass every filter. */
	entityIds: Set<string>;
	/** Fields that match the search themselves (highlighted on their row). */
	matchedFieldIds: Set<string>;
}

/**
 * A table passes when it passes the structural filters (machine, database,
 * origin, visibility) AND either it matches the search itself or one of its
 * fields does (by name, type or allowed value, so "uuid" finds every uuid key).
 */
export function filterTables(ctx: LensContext, filter: MapFilter): FilterResult {
	const { draft, derived } = ctx;
	const dbById = new Map(draft.databases.map((d) => [d.id, d] as const));
	const hostName = new Map(draft.hosts.map((h) => [h.id, h.name] as const));
	const entityIds = new Set<string>();
	const matchedFieldIds = new Set<string>();
	const query = filter.query.trim();

	for (const e of draft.entities) {
		const db = e.databaseId ? dbById.get(e.databaseId) : undefined;
		const hostId = db?.hostId ?? '__none__';
		if (filter.hostId && filter.hostId !== hostId) continue;
		if (filter.databaseId && filter.databaseId !== (db?.id ?? '__none__')) continue;
		if (filter.origin && filter.origin !== e.derivedFrom) continue;

		const fields = draft.fields.filter((f) => f.entityId === e.id);
		if (filter.visibility) {
			const own = visibilityStatus(draft, derived, e.id) === filter.visibility;
			const anyField = fields.some(
				(f) => visibilityStatus(draft, derived, f.id) === filter.visibility
			);
			if (!own && !anyField) continue;
		}

		if (!query) {
			entityIds.add(e.id);
			continue;
		}
		const tableHit = matchesQuery(
			query,
			e.name,
			e.description,
			db?.name,
			db ? hostName.get(db.hostId ?? '') : undefined
		);
		let fieldHit = false;
		for (const f of fields) {
			if (matchesQuery(query, f.name, f.type, ...(f.enumValues ?? []))) {
				matchedFieldIds.add(f.id);
				fieldHit = true;
			}
		}
		if (tableHit || fieldHit) entityIds.add(e.id);
	}
	return { entityIds, matchedFieldIds };
}

/* ─────────────────────────────────── layout ─────────────────────────────── */

export const CARD_W = 300;
export const CARD_HEAD_H = 36;
export const COL_HEAD_H = 22;
export const ROW_H = 28;
export const CARD_FOOT_H = 28;
export const DB_HEAD_H = 30;
const DB_PAD = 14;
export const HOST_HEAD_H = 72;
const HOST_PAD = 16;
const GROUP_GAP = 36;
/** A machine is never narrower than its own header (kind, name, provider). */
const HOST_MIN_W = 240;

export interface PlacedTable {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Root fields in display order; row i sits at y + CARD_HEAD_H + COL_HEAD_H + i * ROW_H. */
	fieldIds: string[];
}
export interface PlacedDatabase {
	/** Database id, or `__none__` for the tables placed on no database. */
	id: string;
	name: string;
	engine: DbEngine | null;
	x: number;
	y: number;
	w: number;
	h: number;
	tables: PlacedTable[];
}
/** What the map groups tables by: where they live, or how they entered the model. */
export type GroupBy = 'location' | 'origin';

export interface PlacedHost {
	/** Host id, `__none__` for databases on no machine, or `origin:<origin>` when grouping by origin. */
	id: string;
	/** Set when the map is grouped by origin: the group is that origin, not a machine. */
	origin?: EntityOrigin;
	name: string;
	kind: HostKind | null;
	provider: string;
	region: string;
	x: number;
	y: number;
	w: number;
	h: number;
	databases: PlacedDatabase[];
}
export interface MapLayout {
	hosts: PlacedHost[];
	tables: Map<string, PlacedTable>;
	width: number;
	height: number;
}

export const cardHeight = (rows: number) =>
	CARD_HEAD_H + COL_HEAD_H + Math.max(1, rows) * ROW_H + CARD_FOOT_H;

/** The fields a card shows: every root field, or only its keys (PK, FK, UK). */
function rowsOf(draft: ProjectDataDraft, entityId: string, keysOnly: boolean): string[] {
	return rootFieldsOfEntity(draft, entityId)
		.filter((f) => !keysOnly || fieldKeyOf(f) !== 'none')
		.map((f) => f.id);
}

// About how wide a character of each of the card's fonts is, a little generous: the table name (13px bold), a field
// name (11px mono), its type (10px mono).
const NAME_CHAR_PX = 8;
const FIELD_CHAR_PX = 6.7;
const TYPE_CHAR_PX = 6.1;
// What a card's head holds around the name (padding, icon, field count), and a row around its texts (padding, the key
// column, the gaps, the marks of a list or nested fields, the visibility dot, the type's own padding).
const HEAD_AROUND_PX = 72;
const ROW_AROUND_PX = 112;

// A database's title (11px uppercase, tracked) and a machine's (its kind, then its name at 14px bold, then where it
// runs at 11px): about how wide a character is, and what sits around them (glyphs, gaps, the engine and table count).
const DB_TITLE_CHAR_PX = 8.6;
const DB_TITLE_AROUND_PX = 150;
const HOST_KIND_CHAR_PX = 8;
const HOST_NAME_CHAR_PX = 8.6;
const HOST_PLACE_CHAR_PX = 6.4;
const HOST_TITLE_AROUND_PX = 64;

/** A database box wide enough for its whole title once the map reads at full size. */
function databaseTitleWidth(name: string): number {
	return Math.ceil(DB_TITLE_AROUND_PX + name.length * DB_TITLE_CHAR_PX);
}

/** A machine box wide enough for its whole title (kind, name, where it runs) once the map reads at full size. */
function hostTitleWidth(h: { name: string; kind: HostKind | null; provider: string; region: string; origin?: EntityOrigin }): number {
	const kind = h.origin ? 'Origin' : (h.kind ?? 'Unplaced');
	const place = h.kind ? (h.kind === 'onprem' ? 'Customer site' : `${h.provider || 'No provider'}${h.region ? ' · ' + h.region : ''}`) : '';
	return Math.ceil(HOST_TITLE_AROUND_PX + kind.length * HOST_KIND_CHAR_PX + h.name.length * HOST_NAME_CHAR_PX + place.length * HOST_PLACE_CHAR_PX);
}

/** The type a card shows for a field: the table a foreign key points at, else its type's label. */
export function fieldTypeLabel(draft: ProjectDataDraft, f: EntityField): string {
	if (fieldKeyOf(f) === 'foreign') return `→ ${draft.entities.find((e) => e.id === f.relationTargetEntityId)?.name || 'table'}`;
	return FIELD_TYPES.find((t) => t.code === f.type)?.label ?? f.type;
}

/**
 * A card as wide as its longest line, so every name reads whole at any zoom:
 * the table's name, or a field's name with its type; never below CARD_W.
 */
function cardWidth(draft: ProjectDataDraft, entityId: string, rows: readonly string[]): number {
	const name = draft.entities.find((e) => e.id === entityId)?.name || 'Untitled table';
	let widest = HEAD_AROUND_PX + name.length * NAME_CHAR_PX;
	for (const id of rows) {
		const f = draft.fields.find((x) => x.id === id);
		if (!f) continue;
		widest = Math.max(widest, ROW_AROUND_PX + (f.name || 'field').length * FIELD_CHAR_PX + fieldTypeLabel(draft, f).length * TYPE_CHAR_PX);
	}
	return Math.max(CARD_W, Math.ceil(widest));
}

/**
 * Lay one database out as relational diagramming tools draw a schema
 * (criterion c1f51729): the tables a table points at in a column to its left,
 * placed so its lines run straight across, then the tables related to none
 * (erd-layout.ts).
 */
function placeDatabase(
	draft: ProjectDataDraft,
	db: Omit<PlacedDatabase, 'x' | 'y' | 'w' | 'h' | 'tables'>,
	entityIds: string[],
	keysOnly: boolean,
	placements: MapPlacements
): PlacedDatabase {
	if (entityIds.length === 0)
		return { ...db, x: 0, y: 0, w: Math.max(240, databaseTitleWidth(db.name)), h: DB_HEAD_H + 40, tables: [] };
	const cards = entityIds.map((id) => {
		const rows = rowsOf(draft, id, keysOnly);
		return { id, rows, w: cardWidth(draft, id, rows), h: cardHeight(rows.length) };
	});
	const rowsById = new Map(cards.map((c) => [c.id, c.rows] as const));
	const portY = (id: string, fieldId: string | null) => {
		const i = fieldId ? rowsById.get(id)!.indexOf(fieldId) : -1;
		return i < 0 ? CARD_HEAD_H / 2 : CARD_HEAD_H + COL_HEAD_H + i * ROW_H + ROW_H / 2;
	};
	const pkOf = (id: string) => rowsById.get(id)!.find((fid) => draft.fields.find((f) => f.id === fid)?.isId) ?? null;
	const links: LayerLink[] = [];
	for (const f of draft.fields) {
		const t = f.relationTargetEntityId;
		if (f.type !== 'relation' || !t || !rowsById.has(f.entityId) || !rowsById.has(t)) continue;
		links.push({ child: f.entityId, parent: t, childPort: portY(f.entityId, f.id), parentPort: portY(t, pkOf(t)) });
	}
	const placed = layerLayout(cards, links);
	// A table a person put by hand stands there; the others where the layout places them (criterion 7f5769bb).
	const at = (id: string) => placements.tables[id] ?? placed.pos.get(id)!;
	const tables: PlacedTable[] = cards.map((c) => ({
		id: c.id,
		x: at(c.id).x + DB_PAD,
		y: at(c.id).y + DB_HEAD_H,
		w: c.w,
		h: c.h,
		fieldIds: c.rows
	}));
	// The database grows to hold every table, a moved one included; never narrower than its own header.
	const contentW = Math.max(placed.width, ...cards.map((c) => at(c.id).x + c.w));
	const contentH = Math.max(placed.height, ...cards.map((c) => at(c.id).y + c.h));
	const w = Math.max(240, databaseTitleWidth(db.name), contentW + DB_PAD * 2);
	const h = DB_HEAD_H + contentH + DB_PAD;
	return { ...db, x: 0, y: 0, w, h, tables };
}

export interface LayoutOptions {
	/** Keep empty machines and databases (no filter active) so a fresh one is still there to fill. */
	keepEmpty: boolean;
	keysOnly?: boolean;
	groupBy?: GroupBy;
	/** Where people put tables by hand (criterion 7f5769bb). */
	placements?: MapPlacements;
}

/**
 * Lay the map out: machines flow left to right (wrapping), each holds its
 * databases stacked, each database holds its tables as a free-form ERD. Only
 * `visible` tables are placed; empty groups are kept when `keepEmpty` (no
 * filter active) so a fresh machine or database is still there to fill.
 */
export function layoutMap(
	draft: ProjectDataDraft,
	visible: ReadonlySet<string>,
	{ keepEmpty, keysOnly = false, groupBy = 'location', placements = NO_PLACEMENTS }: LayoutOptions
): MapLayout {
	const dbIds = new Set(draft.databases.map((d) => d.id));
	const dbKey = (e: DataEntity) => (e.databaseId && dbIds.has(e.databaseId) ? e.databaseId : '__none__');
	const dbName = (id: string) =>
		id === '__none__'
			? 'No database yet'
			: draft.databases.find((d) => d.id === id)?.name.trim() || 'Untitled database';
	const dbEngine = (id: string) => draft.databases.find((d) => d.id === id)?.engine ?? null;
	const hostGroups: Omit<PlacedHost, 'x' | 'y' | 'w' | 'h'>[] = [];

	if (groupBy === 'origin') {
		// One group per origin, the tables inside still split by the database they live in.
		for (const origin of ['journey', 'feature', 'manual'] as EntityOrigin[]) {
			const byDb = new Map<string, string[]>();
			for (const e of draft.entities) {
				if (!visible.has(e.id) || e.derivedFrom !== origin) continue;
				const list = byDb.get(dbKey(e)) ?? [];
				list.push(e.id);
				byDb.set(dbKey(e), list);
			}
			if (byDb.size === 0) continue;
			hostGroups.push({
				id: `origin:${origin}`,
				origin,
				name: ORIGIN_LABEL[origin],
				kind: null,
				provider: '',
				region: '',
				databases: [...byDb.entries()].map(([id, ids]) =>
					placeDatabase(draft, { id: `${origin}:${id}`, name: dbName(id), engine: dbEngine(id) }, ids, keysOnly, placements)
				)
			});
		}
	} else {
		const tablesOf = new Map<string, string[]>();
		for (const e of draft.entities) {
			if (!visible.has(e.id)) continue;
			const list = tablesOf.get(dbKey(e)) ?? [];
			list.push(e.id);
			tablesOf.set(dbKey(e), list);
		}
		const hostIds = new Set(draft.hosts.map((h) => h.id));
		const placeDb = (id: string) => placeDatabase(draft, { id, name: dbName(id), engine: dbEngine(id) }, tablesOf.get(id) ?? [], keysOnly, placements);
		for (const h of draft.hosts) {
			const databases = draft.databases
				.filter((d) => d.hostId === h.id)
				.map((d) => placeDb(d.id))
				.filter((d) => keepEmpty || d.tables.length > 0);
			if (!keepEmpty && databases.length === 0) continue;
			hostGroups.push({
				id: h.id,
				name: h.name.trim() || 'Host',
				kind: h.kind,
				provider: h.provider,
				region: h.region,
				databases
			});
		}
		// Databases on no machine, and tables on no database, share one honest group.
		const orphanDbs = draft.databases
			.filter((d) => !d.hostId || !hostIds.has(d.hostId))
			.map((d) => placeDb(d.id))
			.filter((d) => keepEmpty || d.tables.length > 0);
		if (tablesOf.get('__none__')?.length) orphanDbs.push(placeDb('__none__'));
		if (orphanDbs.length) {
			hostGroups.push({
				id: '__none__',
				name: 'Not on a machine',
				kind: null,
				provider: '',
				region: '',
				databases: orphanDbs
			});
		}
	}

	const hosts: PlacedHost[] = [];
	const tables = new Map<string, PlacedTable>();

	// Inside a machine, databases keep their own size and sit side by side,
	// wrapping into a new row: the machine only wraps what it holds.
	const sized = hostGroups.map((g) => {
		const boxes = shelf(g.databases, HOST_PAD);
		const w = Math.max(HOST_MIN_W, hostTitleWidth(g), boxes.width + HOST_PAD * 2);
		const h = g.databases.length ? HOST_HEAD_H + boxes.height + HOST_PAD : HOST_HEAD_H + 50;
		return { g, w, h };
	});
	// Machines are packed the same way across the map, so it stays roughly square.
	const placed = shelf(sized, GROUP_GAP);
	for (const s of sized) {
		const { g, x, y, w, h } = s as typeof s & { x: number; y: number };
		const host: PlacedHost = { ...g, x, y, w, h };
		// Absolute coordinates for everything inside, so the canvas never adds offsets.
		for (const d of host.databases) {
			d.x += x + HOST_PAD;
			d.y += y + HOST_HEAD_H;
			for (const t of d.tables) {
				t.x += d.x;
				t.y += d.y;
				tables.set(t.id, t);
			}
		}
		hosts.push(host);
	}
	return { hosts, tables, width: Math.max(placed.width, 1), height: Math.max(placed.height, 1) };
}

/** The y of a field's row centre on a placed table, or the header centre for an unknown field. */
/** Where a placed table stands inside its database, as a hand placement keeps it (criterion 7f5769bb). */
export function placementOf(layout: MapLayout, tableId: string): { x: number; y: number } | null {
	for (const h of layout.hosts)
		for (const d of h.databases) {
			const t = d.tables.find((x) => x.id === tableId);
			if (t) return { x: t.x - d.x - DB_PAD, y: t.y - d.y - DB_HEAD_H };
		}
	return null;
}

export function rowCenterY(t: PlacedTable, fieldId: string | null): number {
	const i = fieldId ? t.fieldIds.indexOf(fieldId) : -1;
	if (i < 0) return t.y + CARD_HEAD_H / 2;
	return t.y + CARD_HEAD_H + COL_HEAD_H + i * ROW_H + ROW_H / 2;
}

/** The distance between two lanes of ends meeting one row, and the most the lanes of a row may span. */
const LANE_GAP = 14;
const LANE_SPAN = 20;

export interface RelationEdge {
	id: string;
	fromEntityId: string;
	toEntityId: string;
	/** The key row it lands on, null when the table it points at has none (its header then). */
	toFieldId: string | null;
	/** The line, at right angles around the cards (criterion c1f51729). */
	d: string;
	/** The crow's foot marks at both of its ends (criterion 584cb5f6), as strokes. */
	marks: string;
	/** The rings of those marks (a zero), drawn hollow over the line. */
	rings: { x: number; y: number }[];
}

/**
 * One edge per relation field whose two tables are placed: it leaves its
 * field's own row and lands on the target's primary-key row (its header when
 * it has none), horizontally at both ends, so reading a line tells you WHICH
 * column points at WHICH key; in between it turns twice at most, at right
 * angles, as relational diagramming tools draw it (erd-elbow.ts). Lines landing
 * on one key share a trunk.
 */
export function relationEdges(draft: ProjectDataDraft, layout: MapLayout): RelationEdge[] {
	const fieldById = new Map(draft.fields.map((f) => [f.id, f] as const));
	const pkRow = (t: PlacedTable) => t.fieldIds.find((id) => fieldById.get(id)?.isId) ?? null;
	const relations: { f: EntityField; a: PlacedTable; b: PlacedTable; ay: number; by: number; ends: ReturnType<typeof relationEnds> }[] = [];
	for (const f of draft.fields) {
		if (f.type !== 'relation' || !f.relationTargetEntityId) continue;
		const a = layout.tables.get(f.entityId);
		const b = layout.tables.get(f.relationTargetEntityId);
		if (!a || !b) continue;
		const ay = rowCenterY(a, a.fieldIds.includes(f.id) ? f.id : null);
		const by = rowCenterY(b, pkRow(b));
		if (a === b && ay === by) continue;
		relations.push({ f, a, b, ay, by, ends: relationEnds(f) });
	}

	// Ends of different kinds meeting one row each get a lane of their own, so their marks never pile up.
	const kindsAt = new Map<string, Set<string>>();
	const at = (t: PlacedTable, y: number) => `${t.id}@${y}`;
	const kindOf = (e: RelationEnd) => `${e.min}${e.many ? 'n' : '1'}`;
	for (const r of relations) {
		for (const [where, end] of [
			[at(r.a, r.ay), r.ends.from],
			[at(r.b, r.by), r.ends.to]
		] as const) {
			const kinds = kindsAt.get(where) ?? new Set<string>();
			kinds.add(kindOf(end));
			kindsAt.set(where, kinds);
		}
	}
	const lane = (t: PlacedTable, y: number, end: RelationEnd) => {
		const kinds = [...kindsAt.get(at(t, y))!].sort();
		if (kinds.length < 2) return y;
		const gap = Math.min(LANE_GAP, LANE_SPAN / (kinds.length - 1));
		return y + (kinds.indexOf(kindOf(end)) - (kinds.length - 1) / 2) * gap;
	};

	const asks: ElbowAsk[] = relations.map(({ f, a, b, ay, by, ends }) => ({
		id: f.id,
		bundle: at(b, by),
		from: { box: a, y: lane(a, ay, ends.from) },
		to: { box: b, y: lane(b, by, ends.to) }
	}));
	const routes = elbowRoutes(asks);
	return relations.map(({ f, ends }) => {
		const route = routes.get(f.id)!;
		const marks = [endMarks(route.from, ends.from), endMarks(route.to, ends.to)];
		return {
			id: f.id,
			fromEntityId: f.entityId,
			toEntityId: f.relationTargetEntityId!,
			toFieldId: pkRow(layout.tables.get(f.relationTargetEntityId!)!),
			d: routePath(route.points),
			marks: marks.map((m) => m.d).join(' '),
			rings: marks.flatMap((m) => (m.ring ? [m.ring] : []))
		};
	});
}
