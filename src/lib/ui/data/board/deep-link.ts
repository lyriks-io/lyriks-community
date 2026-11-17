import type { ProjectDataDraft } from '$domain/data';
import type { ProjectArchitectureDraft } from '$domain/architecture';
import type { Selection } from './selection';

/** The board's tabs. `map` is the Data map: the data model diagram drawn inside
 * its databases and machines, carrying client visibility as a lens.
 * `requirements` holds the technical requirements (where it must run, security,
 * accessibility). `graph` is the whole-project knowledge graph, folded in here. Behavior is NOT one of
 * them: it lives on Features, next to the overview that reflects it. */
export type BoardView = 'map' | 'stack' | 'requirements' | 'graph';

/** The tab a `?tab=` value opens. The retired Data model and Data inventory
 * tabs are now the Data map, so their old links still land on it. */
export function toBoardView(value: string | null): BoardView | null {
	if (value === 'map' || value === 'model' || value === 'inventory') return 'map';
	if (value === 'stack' || value === 'requirements' || value === 'graph') return value;
	return null;
}

/**
 * Resolve a deep-linked draft object id (`?node=` from the graph explorer or
 * project search) to the tab + inspector that edits it. Pure: the route reads
 * the view to pick the initial tab, the board reads the selection to open the
 * right inspector — one rule, no drift between them.
 */
export function resolveDeepLink(
	data: ProjectDataDraft,
	arch: ProjectArchitectureDraft,
	id: string | null
): { view: BoardView; selection: Selection } {
	if (!id) return { view: 'map', selection: { kind: 'none' } };
	if (data.entities.some((e) => e.id === id)) return { view: 'map', selection: { kind: 'table', id } };
	const field = data.fields.find((f) => f.id === id);
	if (field) return { view: 'map', selection: { kind: 'table', id: field.entityId } };
	if (data.hosts.some((h) => h.id === id)) return { view: 'map', selection: { kind: 'host', id } };
	const db = data.databases.find((d) => d.id === id);
	if (db)
		return { view: 'map', selection: db.hostId ? { kind: 'host', id: db.hostId } : { kind: 'none' } };
	if (data.interfaces.some((i) => i.id === id))
		return { view: 'map', selection: { kind: 'interface', id } };
	const inArch =
		arch.techChoices.some((t) => t.id === id) ||
		arch.constraints.some((c) => c.id === id) ||
		arch.referenceDocs.some((d) => d.id === id);
	if (inArch) return { view: 'stack', selection: { kind: 'none' } };
	return { view: 'map', selection: { kind: 'none' } };
}
