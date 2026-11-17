import { compareNames, sortByName } from '$domain/shared';
import { DB_ENGINES, HOST_KINDS, unrelatedEntities, type ProjectDataDraft } from '$domain/data';
import type { OutlineCore } from './outline';
import { counted, labelOf, list, text } from './labels';

/**
 * The data map of the Specification 360° in words (criterion 0f4c8334): where
 * the data lives (how many tables, in which databases, on which machines),
 * how the tables connect, and for one table where it applies (criterion
 * 3750dbba). Every sentence is built from the data model alone; what the model
 * does not say is said missing, never filled in.
 */

/** "a", "a and b", "a, b and c". */
function inWords(items: readonly string[]): string {
	return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const engineOf = (code: string) => labelOf(DB_ENGINES, code);
/** An engine named in a sentence: "Other" says nothing, so it is left out. */
const namedEngine = (code: string) => (code === 'other' || !code ? '' : engineOf(code));
/** How many tables named in a sentence before it gives their number instead. */
const NAMED_TABLES = 3;

/**
 * The lead of the page: "6 tables in one SQLite database, on Instance
 * server." Only the databases holding tables are counted; null when the model
 * has no table. Pure.
 */
export function dataSummary(data: Pick<ProjectDataDraft, 'entities' | 'databases' | 'hosts'>): string | null {
	const tables = list(data.entities);
	if (tables.length === 0) return null;
	const used = list(data.databases).filter((d) => tables.some((t) => t.databaseId === d.id));
	const loose = tables.filter((t) => !used.some((d) => d.id === t.databaseId)).length;
	const engines = [...new Set(used.map((d) => namedEngine(d.engine)))];
	const known = engines.filter(Boolean);
	const where =
		used.length === 0
			? 'not placed in a database yet'
			: used.length === 1
				? `in one ${known[0] ? `${known[0]} ` : ''}database`
				: engines.length === 1 && known.length === 1
					? `in ${used.length} ${known[0]} databases`
					: `in ${used.length} databases${known.length ? ` (${inWords(known)})` : ''}`;
	const hosts = list(data.hosts).filter((h) => used.some((d) => d.hostId === h.id));
	const on = hosts.length === 1 ? `, on ${text(hosts[0].name) || 'one machine'}` : hosts.length > 1 ? `, on ${hosts.length} machines` : '';
	const rest = used.length > 0 && loose > 0 ? `; ${loose} not in a database yet` : '';
	return `${counted(tables.length, 'table')} ${where}${on}${rest}.`;
}

/** A database the spec describes, for the paragraph under the lead. */
export interface DatabaseNote {
	readonly name: string;
	readonly engine: string;
	readonly description: string;
}

/** What the spec says of each database, those it describes, from A to Z (criterion 4b3d2b4d). Pure. */
export function databaseNotes(data: Pick<ProjectDataDraft, 'databases'>): DatabaseNote[] {
	return sortByName(
		list(data.databases)
			.filter((d) => text(d.description))
			.map((d) => ({ name: text(d.name) || 'Untitled database', engine: engineOf(d.engine), description: text(d.description) }))
	);
}

/** One line of "where the data lives": a machine, or the databases on none. */
export interface DataPlace {
	readonly key: string;
	/** The machine's name; null for the databases on no machine. */
	readonly machine: string | null;
	/** "On-prem · eu-west-3": the machine's kind and region. */
	readonly detail: string;
	/** The engines of its databases, from A to Z. */
	readonly engines: readonly string[];
}

/** Where the data lives, machine by machine from A to Z (criterion 4b3d2b4d), then the databases on no machine. Pure. */
export function dataPlaces(data: Pick<ProjectDataDraft, 'databases' | 'hosts'>): DataPlace[] {
	const databases = list(data.databases);
	const engines = (dbs: typeof databases) => [...new Set(dbs.map((d) => namedEngine(d.engine)).filter(Boolean))].sort(compareNames);
	const machines = sortByName(
		list(data.hosts).map((h) => ({
			key: h.id,
			machine: text(h.name) || 'Unnamed machine',
			detail: [labelOf(HOST_KINDS, h.kind), text(h.region)].filter(Boolean).join(' · '),
			engines: engines(databases.filter((d) => d.hostId === h.id))
		})),
		(m) => m.machine
	);
	const loose = databases.filter((d) => !list(data.hosts).some((h) => h.id === d.hostId));
	return loose.length ? [...machines, { key: '__none__', machine: null, detail: 'on no machine described', engines: engines(loose) }] : machines;
}

/**
 * How the tables connect, the intro of the map: the table the most other
 * tables point at when at least two do, otherwise how many relations join
 * them, then the tables related to none. Pure.
 */
export function dataConnections(data: ProjectDataDraft): string {
	const tables = list(data.entities);
	if (tables.length === 0) return '';
	const name = new Map(tables.map((t) => [t.id, text(t.name) || 'Untitled table']));
	const pointers = new Map<string, Set<string>>();
	let relations = 0;
	for (const f of list(data.fields)) {
		const target = f.relationTargetEntityId;
		if (f.type !== 'relation' || !target || !name.has(target) || !name.has(f.entityId)) continue;
		relations += 1;
		if (target !== f.entityId) pointers.set(target, (pointers.get(target) ?? new Set()).add(f.entityId));
	}
	// The first table of the model wins a tie, so the sentence does not change from one read to the next.
	const [hub, from] = tables.reduce<[string | null, number]>((best, t) => ((pointers.get(t.id)?.size ?? 0) > best[1] ? [t.id, pointers.get(t.id)!.size] : best), [null, 0]);
	const lines: string[] = [];
	if (hub && from >= 2) lines.push(`${name.get(hub)} is the hub: ${from} of the ${tables.length - 1} other tables point at it.`);
	else if (relations > 0) lines.push(`${counted(relations, 'relation')} ${relations === 1 ? 'joins' : 'join'} the tables.`);
	else if (tables.length > 1) lines.push('No table points at another yet.');
	const alone = unrelatedEntities(data).map((t) => name.get(t.id) ?? 'Untitled table');
	if (alone.length > NAMED_TABLES) lines.push(`${alone.length} tables are related to no other table.`);
	else if (alone.length) lines.push(`${inWords(alone)} ${alone.length === 1 ? 'is' : 'are'} related to no other table.`);
	return lines.join(' ');
}

/** A feature whose states carry a table: where the table applies. */
export interface TableUse {
	readonly id: string;
	readonly name: string;
	readonly core: string;
}

/** The features that use a table, in the order of the feature tree. Pure. */
export function tableUses(tableId: string, tablesByFeature: Readonly<Record<string, readonly string[]>>, cores: readonly OutlineCore[]): TableUse[] {
	return cores.flatMap((core) =>
		core.features.filter((f) => tablesByFeature[f.id]?.includes(tableId)).map((f) => ({ id: f.id, name: f.name, core: core.name }))
	);
}
