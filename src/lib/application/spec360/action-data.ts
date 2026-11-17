import { parseExistence, type ProjectDataDraft } from '$domain/data';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { compareNames } from '$domain/shared';
import { summarizeAction } from '../specification/summarize-action';

/**
 * The data an action reads and writes (criterion d0e0e1a5): each field of the
 * data model carried by a state the action needs or its rules test (read), or
 * that its effects, its rules or a parameter bound to it change (written),
 * under its table; a field both read and written reads as written. The state
 * that says a record of a table exists counts too: written, the action creates
 * or removes a record; read, it reads them. The states it uses that no field
 * carries and that stand for no table's existence are named apart, so the
 * reader sees what the data model does not hold. Pure.
 */
export interface ActionDataTable {
	readonly tableId: string;
	readonly table: string;
	readonly reads: readonly string[];
	readonly writes: readonly string[];
	/** Through the table's existence state: the action creates or removes a record, or reads them. */
	readonly records: 'written' | 'read' | null;
}

export interface ActionData {
	readonly tables: readonly ActionDataTable[];
	/** State paths the action reads or writes that carry no field of the data model. */
	readonly untracked: readonly string[];
}

/** The state paths an action reads and writes, or null when the feature holds no such action. */
export function statesTouched(snapshot: UnspaFeatureSnapshot | null, actionId: string): { reads: string[]; writes: string[] } | null {
	const summary = summarizeAction(snapshot, actionId);
	if (!summary) return null;
	const writes = new Set(summary.writes);
	for (const surface of list(rec(snapshot?.feature).surfaces)) {
		const action = list(rec(surface).actions).find((a) => rec(a).id === actionId);
		if (!action) continue;
		for (const rule of list(rec(action).rules)) {
			const effect = rec(rec(rule).effect);
			if (WRITING.has(String(effect.type)) && typeof effect.path === 'string' && effect.path) writes.add(effect.path);
		}
		for (const parameter of list(rec(action).parameters)) {
			const bound = rec(parameter).bindToStatePath;
			if (typeof bound === 'string' && bound) writes.add(bound);
		}
	}
	return { reads: summary.reads.filter((p) => !writes.has(p)), writes: [...writes] };
}

/** Folds what an action touches onto the data model through the links field to state. */
export function actionData(
	touched: { readonly reads: readonly string[]; readonly writes: readonly string[] },
	data: Pick<ProjectDataDraft, 'entities' | 'fields' | 'rules'>,
	links: ReadonlyMap<string, string>
): ActionData {
	const fieldOf = fieldOfState(data, links);
	const fields = new Map(data.fields.map((f) => [f.id, f] as const));
	const tableNames = new Map(data.entities.map((e) => [e.id, e.name] as const));
	const existenceOf = new Map<string, string>();
	for (const [tableId, text] of Object.entries(data.rules?.existence ?? {})) {
		const path = parseExistence(text)?.path;
		if (path) existenceOf.set(path, tableId);
	}
	const byTable = new Map<string, { reads: Set<string>; writes: Set<string>; records: 'written' | 'read' | null }>();
	const tableOf = (id: string) => {
		let table = byTable.get(id);
		if (!table) byTable.set(id, (table = { reads: new Set(), writes: new Set(), records: null }));
		return table;
	};
	const untracked = new Set<string>();
	const place = (path: string, side: 'reads' | 'writes') => {
		const field = fields.get(fieldOf.get(path) ?? '');
		if (field) return void tableOf(field.entityId)[side].add(field.name);
		const existing = existenceOf.get(path);
		if (!existing) return void untracked.add(path);
		const table = tableOf(existing);
		if (side === 'writes' || !table.records) table.records = side === 'writes' ? 'written' : 'read';
	};
	for (const path of touched.writes) place(path, 'writes');
	for (const path of touched.reads) if (!touched.writes.includes(path)) place(path, 'reads');
	const sorted = (names: Set<string>) => [...names].sort(compareNames);
	return {
		tables: [...byTable]
			.map(([tableId, t]) => ({ tableId, table: tableNames.get(tableId) ?? tableId, reads: sorted(t.reads), writes: sorted(t.writes), records: t.records }))
			.sort((a, b) => compareNames(a.table, b.table)),
		untracked: [...untracked].sort(compareNames)
	};
}

/** What each action of a feature reads and writes, by action id (criterion d0e0e1a5); none without its behavior model. */
export function actionsData(
	snapshot: UnspaFeatureSnapshot | null,
	data: Pick<ProjectDataDraft, 'entities' | 'fields' | 'rules'>,
	links: ReadonlyMap<string, string>
): Record<string, ActionData> {
	const out: Record<string, ActionData> = {};
	for (const surface of list(rec(snapshot?.feature).surfaces)) {
		for (const action of list(rec(surface).actions)) {
			const id = String(rec(action).id);
			const touched = statesTouched(snapshot, id);
			if (touched) out[id] = actionData(touched, data, links);
		}
	}
	return out;
}

/** The tables a feature's actions read or write, by id: what its page draws beside the tables its own states carry. */
export function tablesTouched(
	snapshot: UnspaFeatureSnapshot | null,
	data: Pick<ProjectDataDraft, 'entities' | 'fields' | 'rules'>,
	links: ReadonlyMap<string, string>
): string[] {
	const tables = new Set<string>();
	for (const surface of list(rec(snapshot?.feature).surfaces)) {
		for (const action of list(rec(surface).actions)) {
			const touched = statesTouched(snapshot, String(rec(action).id));
			if (touched) for (const t of actionData(touched, data, links).tables) tables.add(t.tableId);
		}
	}
	return [...tables];
}

/** The fields a feature's actions read or write, by id: what its page highlights on its data map (criterion c72a7e79). */
export function fieldsTouched(
	snapshot: UnspaFeatureSnapshot | null,
	data: Pick<ProjectDataDraft, 'fields' | 'rules'>,
	links: ReadonlyMap<string, string>
): string[] {
	const fieldOf = fieldOfState(data, links);
	const known = new Set(data.fields.map((f) => f.id));
	const used = new Set<string>();
	for (const surface of list(rec(snapshot?.feature).surfaces)) {
		for (const action of list(rec(surface).actions)) {
			const touched = statesTouched(snapshot, String(rec(action).id));
			for (const path of [...(touched?.reads ?? []), ...(touched?.writes ?? [])]) {
				const field = fieldOf.get(path);
				if (field && known.has(field)) used.add(field);
			}
		}
	}
	return [...used];
}

/** The field each state carries: the first carrier of each field, and its further ones (criterion 3238573b). */
function fieldOfState(data: Pick<ProjectDataDraft, 'rules'>, links: ReadonlyMap<string, string>): Map<string, string> {
	return new Map([
		...[...links].map(([fieldId, path]) => [path, fieldId] as const),
		...Object.entries(data.rules?.alsoCarriedBy ?? {}).flatMap(([fieldId, paths]) => paths.map((path) => [path, fieldId] as const))
	]);
}

const WRITING = new Set(['set_state', 'append_to_list', 'remove_from_list', 'update_list_item']);
type Raw = Record<string, unknown>;
const rec = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
