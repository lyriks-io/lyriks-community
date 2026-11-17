import type { SpecLanguage } from '$domain/language';
import { actionContextOf, earsOfInvariant, earsOfRule, featureConstants, featureLanguage, featureProperNames } from '$lib/unspa-schema/requirement-sentences';
import type { DataDraft } from './data-drafts';
import type { DraftLeafKind, EvolutionRequest } from './draft';

/**
 * The request drawn as its own graph (ac-evo-graph-local, -status, -folded).
 *
 * Only what the request is about: the cores its features belong to, the
 * touched features and their drafts with everything their behaviour holds, the
 * tables and fields its data changes touch, and the features the impact reaches.
 * Nothing assumes a screen: a surface keeps its own type and an action says who
 * fires it, so a backend-only change reads as one (ac-evo-graph-backend). Each node carries what the request does to
 * it, read by comparing the draft's behaviour with the feature as it stands:
 * nothing here is declared, everything is derived.
 */

export type LocalNodeKind =
	| 'core'
	| 'feature'
	| 'surface'
	| 'state'
	| 'invariant'
	| 'action'
	| 'rule'
	| 'transition'
	| 'event'
	| 'table'
	| 'field';

/** The colour law of the request: grey was there, blue it adds, amber it changes, red it removes. */
export type LocalNodeStatus = 'existing' | 'added' | 'changed' | 'removed' | 'reached';

export interface LocalNode {
	readonly id: string;
	readonly kind: LocalNodeKind;
	readonly label: string;
	readonly status: LocalNodeStatus;
	/** The node it hangs from: a feature under its core, an action under its surface. */
	readonly parentId: string | null;
	/** Shown when the graph opens; the rest unfolds on demand (ac-evo-graph-folded). */
	readonly folded: boolean;
	/** The page a person opens from this node, when it has one (ac-evo-graph-4). */
	readonly featureId: string | null;
	/**
	 * What kind of thing the node is beyond its kind: a surface's type (screen,
	 * workflow, terminal...) or who fires an action (user, system, schedule,
	 * event). Null when the model says nothing.
	 */
	readonly variant: string | null;
	/**
	 * A rule or an invariant as the EARS sentence the behaviour model gives it,
	 * the one the Features page reads under it (ac-evo-graph-ears).
	 */
	readonly statement?: string;
}

export interface LocalGraph {
	readonly nodes: readonly LocalNode[];
	readonly counts: Readonly<Record<LocalNodeStatus, number>>;
}

/** The feature tree as the behaviour engine reads it back, taken structurally. */
type Snapshot = Readonly<Record<string, unknown>> | null;

export interface LocalGraphInput {
	readonly request: Pick<EvolutionRequest, 'leafIds' | 'drafts' | 'impactFindings'> & { readonly dataDrafts?: readonly DataDraft[] };
	readonly cores: readonly { readonly id: string; readonly name: string }[];
	readonly leaves: readonly { readonly id: string; readonly name: string; readonly coreId: string }[];
	/** Each touched feature as it stands, by leaf id. */
	readonly base: Readonly<Record<string, Snapshot>>;
	/** Each draft's feature as its behaviour model would make it, by draft id. */
	readonly drafted: Readonly<Record<string, Snapshot>>;
	/** The data model as it stands, to name the tables and fields a data change touches. */
	readonly data?: {
		readonly entities: readonly { readonly id: string; readonly name: string }[];
		readonly fields: readonly { readonly id: string; readonly name: string }[];
	};
	/** The language the spec is written in, which its sentences read in; else each feature's own. */
	readonly lang?: SpecLanguage;
}

const list = (v: unknown): Record<string, unknown>[] =>
	Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() !== '' ? v : fallback);
const idOf = (row: Record<string, unknown>): string => (typeof row.id === 'string' ? row.id : '');

interface Element {
	readonly id: string;
	readonly kind: LocalNodeKind;
	readonly label: string;
	readonly parentId: string;
	readonly variant: string | null;
	/** What makes two readings of the element the same element unchanged. */
	readonly signature: string;
	readonly statement?: string;
}

const optional = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Who fires an action: what the model says, else an event when it subscribes to one, else a person. */
const actorOf = (action: Record<string, unknown>): string =>
	optional(action.actor) ?? (optional(action.triggeredByEvent) ? 'event' : 'user');

const without = (row: Record<string, unknown>, keys: readonly string[]) =>
	JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k))));

/** Every element a feature snapshot holds, under the feature node `featureNode`. */
function elementsOf(feature: Snapshot, featureNode: string, lang?: SpecLanguage): Element[] {
	const out: Element[] = [];
	const constants = featureConstants(feature);
	const properNames = featureProperNames(feature);
	const language = lang ?? featureLanguage(feature);
	for (const surface of list(feature?.surfaces)) {
		const sid = `surface:${idOf(surface)}`;
		out.push({
			id: sid,
			kind: 'surface',
			label: text(surface.name, idOf(surface)),
			parentId: featureNode,
			variant: optional(surface.type),
			signature: JSON.stringify([surface.name, surface.type, surface.description])
		});
		for (const state of list(surface.stateDefinitions))
			out.push({ id: `state:${idOf(state)}`, kind: 'state', label: text(state.path, idOf(state)), parentId: sid, variant: null, signature: JSON.stringify(state) });
		for (const inv of list(surface.invariants))
			out.push({
				id: `invariant:${idOf(inv)}`,
				kind: 'invariant',
				label: text(inv.name, idOf(inv)),
				parentId: sid,
				variant: null,
				signature: JSON.stringify(inv),
				statement: earsOfInvariant(inv, constants, language)
			});
		for (const action of list(surface.actions)) {
			const aid = `action:${idOf(action)}`;
			out.push({
				id: aid,
				kind: 'action',
				label: text(action.name, idOf(action)),
				parentId: sid,
				variant: actorOf(action),
				// An action changes when what it does changes, not when a scenario does.
				signature: without(action, ['scenarios'])
			});
			const context = actionContextOf(action, properNames);
			for (const rule of list(action.rules))
				out.push({
					id: `rule:${idOf(rule)}`,
					kind: 'rule',
					label: text(rule.description, idOf(rule)),
					parentId: aid,
					variant: null,
					signature: JSON.stringify(rule),
					statement: earsOfRule(rule, context, constants, language)
				});
			for (const t of list(action.transitions))
				out.push({ id: `transition:${idOf(t)}`, kind: 'transition', label: text(t.description ?? t.name, idOf(t)), parentId: aid, variant: null, signature: JSON.stringify(t) });
			for (const event of Array.isArray(action.emittedEvents) ? action.emittedEvents : [])
				if (typeof event === 'string' && event !== '')
					out.push({ id: `event:${featureNode}:${event}`, kind: 'event', label: event, parentId: aid, variant: null, signature: event });
		}
	}
	return out.filter((e) => !e.id.endsWith(':'));
}

/** What a draft does to each element, read by comparing it with the feature it stands for. */
function compared(kind: DraftLeafKind, before: Element[], after: Element[]): (Element & { status: LocalNodeStatus })[] {
	if (kind === 'add') return after.map((e) => ({ ...e, status: 'added' }));
	if (kind === 'remove') return before.map((e) => ({ ...e, status: 'removed' }));
	const old = new Map(before.map((e) => [e.id, e]));
	const kept = new Set(after.map((e) => e.id));
	return [
		...after.map((e) => {
			const was = old.get(e.id);
			return { ...e, status: (!was ? 'added' : was.signature !== e.signature ? 'changed' : 'existing') as LocalNodeStatus };
		}),
		...before.filter((e) => !kept.has(e.id)).map((e) => ({ ...e, status: 'removed' as const }))
	];
}

const FOLDED_KINDS: readonly LocalNodeKind[] = ['state', 'invariant', 'rule', 'transition', 'event', 'field'];

const DATA_STATUS: Record<DataDraft['kind'], LocalNodeStatus> = { add: 'added', amend: 'changed', remove: 'removed' };

/** The tables and fields a request's data changes touch, coloured like the rest. */
function dataNodes(drafts: readonly DataDraft[], data: NonNullable<LocalGraphInput['data']>): LocalNode[] {
	const tableName = (id: string | null) => data.entities.find((e) => e.id === id)?.name ?? id ?? '';
	const fieldName = (id: string) => data.fields.find((f) => f.id === id)?.name ?? id;
	const node = (id: string, kind: LocalNodeKind, label: string, status: LocalNodeStatus, parentId: string | null): LocalNode => ({
		id,
		kind,
		label,
		status,
		parentId,
		folded: FOLDED_KINDS.includes(kind),
		featureId: null,
		variant: null
	});
	return drafts.flatMap((draft) => {
		const table = `table:${draft.entityId ?? draft.id}`;
		return [
			node(table, 'table', draft.kind === 'add' ? draft.name : draft.name || tableName(draft.entityId), DATA_STATUS[draft.kind], null),
			...draft.addFields.map((f) => node(`field:${table}:${f.id}`, 'field', f.name, draft.kind === 'remove' ? 'removed' : 'added', table)),
			...draft.changeFields.map((c) => node(`field:${table}:${c.fieldId}`, 'field', c.name ?? fieldName(c.fieldId), 'changed', table)),
			...draft.removeFields.map((id) => node(`field:${table}:${id}`, 'field', fieldName(id), 'removed', table))
		];
	});
}

/** What the request adds, changes or removes, as opposed to what was there or what it only reaches. */
export const isChange = (node: Pick<LocalNode, 'status'>): boolean =>
	node.status === 'added' || node.status === 'changed' || node.status === 'removed';

/**
 * The changes alone (302d93bf): every node the request adds, changes or removes,
 * and only the nodes that hold one (its core, feature, surface, action), so a
 * reader can place it. Nothing the request leaves untouched beside them.
 */
export function changesWithHolders(nodes: readonly LocalNode[]): LocalNode[] {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const keep = new Set<string>();
	for (const node of nodes) {
		if (!isChange(node)) continue;
		let at: LocalNode | undefined = node;
		while (at && !keep.has(at.id)) {
			keep.add(at.id);
			at = at.parentId ? byId.get(at.parentId) : undefined;
		}
	}
	return nodes.filter((n) => keep.has(n.id));
}

export function localGraphOf(input: LocalGraphInput): LocalGraph {
	const { request } = input;
	const nodes = new Map<string, LocalNode>();
	const coreOf = (coreId: string) => {
		if (!coreId) return null;
		const id = `core:${coreId}`;
		if (!nodes.has(id))
			nodes.set(id, {
				id,
				kind: 'core',
				label: input.cores.find((c) => c.id === coreId)?.name ?? coreId,
				status: 'existing',
				parentId: null,
				folded: false,
				featureId: null,
				variant: null
			});
		return id;
	};
	const put = (e: Element & { status: LocalNodeStatus }) =>
		nodes.set(e.id, {
			id: e.id,
			kind: e.kind,
			label: e.label,
			status: e.status,
			parentId: e.parentId,
			folded: FOLDED_KINDS.includes(e.kind),
			featureId: null,
			variant: e.variant,
			...(e.statement ? { statement: e.statement } : {})
		});

	const standIns = new Set(request.drafts.map((d) => d.baseLeafId).filter((id): id is string => !!id));
	// The features the request touches, each read once: an amendment and the leaf it stands for are one.
	for (const draft of request.drafts) {
		const leaf = draft.baseLeafId ? input.leaves.find((l) => l.id === draft.baseLeafId) : undefined;
		const featureNode = `feature:${draft.baseLeafId ?? draft.id}`;
		nodes.set(featureNode, {
			id: featureNode,
			kind: 'feature',
			label: draft.name || leaf?.name || draft.baseLeafId || draft.id,
			status: draft.kind === 'add' ? 'added' : draft.kind === 'remove' ? 'removed' : 'changed',
			parentId: coreOf(draft.coreId || leaf?.coreId || ''),
			folded: false,
			featureId: draft.baseLeafId,
			variant: null
		});
		const before = draft.baseLeafId ? elementsOf(input.base[draft.baseLeafId] ?? null, featureNode, input.lang) : [];
		const after = elementsOf(input.drafted[draft.id] ?? input.base[draft.baseLeafId ?? ''] ?? null, featureNode, input.lang);
		for (const e of compared(draft.kind, before, after)) put(e);
	}
	for (const leafId of request.leafIds) {
		if (standIns.has(leafId) || request.drafts.some((d) => d.id === leafId)) continue;
		const leaf = input.leaves.find((l) => l.id === leafId);
		const featureNode = `feature:${leafId}`;
		nodes.set(featureNode, { id: featureNode, kind: 'feature', label: leaf?.name ?? leafId, status: 'existing', parentId: coreOf(leaf?.coreId ?? ''), folded: false, featureId: leafId, variant: null });
		for (const e of elementsOf(input.base[leafId] ?? null, featureNode, input.lang)) put({ ...e, status: 'existing' });
	}
	// What the impact reaches beyond the touched features, drawn without its insides.
	for (const finding of request.impactFindings) {
		if (finding.section !== 'leaves' || !finding.nodeId) continue;
		const leafId = finding.nodeId.replace(/^feature:/, '');
		const featureNode = `feature:${leafId}`;
		if (nodes.has(featureNode)) continue;
		const leaf = input.leaves.find((l) => l.id === leafId);
		if (!leaf) continue;
		nodes.set(featureNode, { id: featureNode, kind: 'feature', label: leaf.name, status: 'reached', parentId: coreOf(leaf.coreId), folded: false, featureId: leafId, variant: null });
	}
	for (const node of dataNodes(request.dataDrafts ?? [], input.data ?? { entities: [], fields: [] })) nodes.set(node.id, node);

	const all = [...nodes.values()];
	const counts: Record<LocalNodeStatus, number> = { existing: 0, added: 0, changed: 0, removed: 0, reached: 0 };
	for (const node of all) counts[node.status] += 1;
	return { nodes: all, counts };
}
