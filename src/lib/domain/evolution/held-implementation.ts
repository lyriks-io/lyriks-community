import type { DraftLeaf, EvolutionRequest } from './draft';
import type { FeatureStatus, StatusEntity, StatusRow } from './report-derivation';

/**
 * The code written against a version nobody made official yet
 * (ac-evo-impl-held, ac-evo-req-landing).
 *
 * A request's change becomes official only once it is declared live. Until
 * then the implementation index cannot resolve what the request adds: those
 * elements exist in the request's drafts, not in the specification. The entries
 * that name them are held on the request, read by its report as if they were
 * synced, and resolved by the index once the change lands, under the same ids.
 */

/** One entry of the repository's `.unspa.json` index, as the client sent it. */
export type HeldEntry = Readonly<Record<string, unknown>>;

type Snapshot = Readonly<Record<string, unknown>> | null;

const rows = (v: unknown): Record<string, unknown>[] =>
	Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
const idOf = (row: Record<string, unknown>): string => (typeof row.id === 'string' ? row.id : '');

/**
 * Every index key a draft makes, in the grammar of `.unspa.json`: the elements
 * of the feature its behaviour model would make, and the criteria it carries.
 * These are the keys an entry may name before the change is official.
 */
export function draftIndexKeys(snapshot: Snapshot, draft: Pick<DraftLeaf, 'acceptanceCriteria'>, signedCriterionIds: readonly string[] = []): string[] {
	const keys = new Set<string>();
	for (const surface of rows(snapshot?.surfaces)) {
		keys.add(`surface:${idOf(surface)}`);
		for (const state of rows(surface.stateDefinitions)) if (typeof state.path === 'string') keys.add(`state:${state.path}`);
		for (const inv of rows(surface.invariants)) keys.add(`surface_invariant:${idOf(inv)}`);
		for (const rule of rows(surface.rules)) keys.add(`surface_rule:${idOf(rule)}`);
		for (const action of rows(surface.actions)) {
			keys.add(`action:${idOf(action)}`);
			for (const rule of rows(action.rules)) keys.add(`rule:${idOf(rule)}`);
			for (const inv of rows(action.invariants)) keys.add(`invariant:${idOf(inv)}`);
			for (const t of rows(action.transitions)) keys.add(`transition:${idOf(t)}`);
			for (const event of Array.isArray(action.emittedEvents) ? action.emittedEvents : [])
				if (typeof event === 'string' && event !== '') keys.add(`event:${event}`);
		}
	}
	for (const c of draft.acceptanceCriteria) keys.add(`criterion:ac-leaf-${c.id}`);
	for (const id of signedCriterionIds) keys.add(`criterion:ac-leaf-${id}`);
	return [...keys].filter((k) => !k.endsWith(':'));
}

/**
 * The criteria a draft carries, as rows of the feature it reads as: each under
 * the id its report reads (`ac-leaf-<id>`), so the index keys of a draft name
 * the entries that prove them. The criteria a person signed on it count too.
 */
export function draftCriterionRows(
	draft: Pick<DraftLeaf, 'acceptanceCriteria'>,
	signed: readonly { readonly id: string; readonly text: string }[] = []
): { id: string; title: string }[] {
	const rows = new Map<string, string>();
	for (const c of [...draft.acceptanceCriteria, ...signed]) if (!rows.has(c.id)) rows.set(c.id, c.text);
	return [...rows].map(([id, text]) => ({ id: `ac-leaf-${id}`, title: text }));
}

/** The request with these entries held, the newest one of each key winning. */
export function withHeldEntries(request: EvolutionRequest, entries: Readonly<Record<string, HeldEntry>>): EvolutionRequest {
	if (Object.keys(entries).length === 0) return request;
	return { ...request, heldImplementation: { ...request.heldImplementation, ...entries } };
}

const located = (entry: HeldEntry | undefined) =>
	entry && typeof entry.file === 'string' && entry.file !== ''
		? [{ file: entry.file, ...(typeof entry.line === 'number' ? { line: entry.line } : {}), ...(typeof entry.signature === 'string' ? { snippet: entry.signature } : {}) }]
		: [];

/**
 * What the report reads for a draft while it is not official: the elements its
 * behaviour model makes, crossed with the entries held on the request, shaped
 * like the engine's status so the report reads both the same way. `official`
 * holds the keys the specification already resolves (an amendment's existing
 * elements): those are read from the engine, never twice.
 */
export function heldStatusOf(
	snapshot: Snapshot,
	held: Readonly<Record<string, HeldEntry>>,
	criteria: readonly { readonly id: string; readonly text: string }[],
	official: ReadonlySet<string> = new Set()
): FeatureStatus {
	const surfaces: StatusRow[] = [];
	const actions: StatusRow[] = [];
	const entity = (entityType: string, entityId: string, entityName: string, indexKey: string): { expected: StatusEntity; found: StatusEntity | null } => {
		const expected = { entityType, entityId, entityName };
		const where = located(held[indexKey]);
		return { expected, found: where.length > 0 ? { ...expected, locations: where } : null };
	};
	for (const surface of rows(snapshot?.surfaces)) {
		const sid = idOf(surface);
		const name = typeof surface.name === 'string' ? surface.name : sid;
		const own = [
			...(official.has(`surface:${sid}`) ? [] : [entity('surface', sid, name, `surface:${sid}`)]),
			...rows(surface.stateDefinitions)
				.filter((s) => !official.has(`state:${s.path}`))
				.map((s) => entity('state', idOf(s), String(s.path ?? idOf(s)), `state:${s.path}`)),
			...rows(surface.invariants)
				.filter((i) => !official.has(`surface_invariant:${idOf(i)}`))
				.map((i) => entity('surface_invariant', idOf(i), String(i.name ?? idOf(i)), `surface_invariant:${idOf(i)}`))
		];
		if (own.length > 0)
			surfaces.push({ surfaceId: sid, surfaceName: name, expectedEntities: own.map((e) => e.expected), foundEntities: own.flatMap((e) => (e.found ? [e.found] : [])) });
		for (const action of rows(surface.actions)) {
			const aid = idOf(action);
			const actionName = typeof action.name === 'string' ? action.name : aid;
			const mine = [
				...(official.has(`action:${aid}`) ? [] : [entity('action', aid, actionName, `action:${aid}`)]),
				...rows(action.rules)
					.filter((r) => !official.has(`rule:${idOf(r)}`))
					.map((r) => entity('rule', idOf(r), String(r.description ?? idOf(r)), `rule:${idOf(r)}`)),
				...rows(action.transitions)
					.filter((t) => !official.has(`transition:${idOf(t)}`))
					.map((t) => entity('transition', idOf(t), String(t.description ?? idOf(t)), `transition:${idOf(t)}`)),
				...(Array.isArray(action.emittedEvents) ? action.emittedEvents : [])
					.filter((e): e is string => typeof e === 'string' && !official.has(`event:${e}`))
					.map((e) => entity('event', e, e, `event:${e}`))
			];
			if (mine.length === 0) continue;
			const verifiedAt = held[`action:${aid}`]?.verifiedAt;
			actions.push({
				actionId: aid,
				actionName,
				surfaceId: sid,
				surfaceName: name,
				expectedEntities: mine.map((e) => e.expected),
				foundEntities: mine.flatMap((e) => (e.found ? [e.found] : [])),
				...(typeof verifiedAt === 'string' && verifiedAt !== '' ? { auditMeta: { verifiedAt } } : {})
			});
		}
	}
	const criterionState = (id: string): string => {
		const entry = held[`criterion:ac-leaf-${id}`];
		if (!entry) return 'none';
		const result = (entry.verification as { lastResult?: { passed?: unknown } } | undefined)?.lastResult;
		return result?.passed === true ? 'verified' : result?.passed === false ? 'failing' : 'unverified';
	};
	return {
		surfaces,
		actions,
		criteria: criteria
			.filter((c) => !official.has(`criterion:ac-leaf-${c.id}`))
			.map((c) => ({ criterionId: `ac-leaf-${c.id}`, title: c.text, state: criterionState(c.id) }))
	};
}

/**
 * Two engine statuses read as one: the official rows of a feature and the held
 * rows of its draft. A rule the request adds to an action that is already
 * official is proved like that action: by every one of its scenarios passing
 * against the code, which the engine stamps on the action itself.
 */
export function mergedStatus(official: FeatureStatus | null, held: FeatureStatus): FeatureStatus {
	const proofOf = new Map((official?.actions ?? []).map((row) => [row.actionId, row.auditMeta]));
	return {
		actions: [
			...(official?.actions ?? []),
			...(held.actions ?? []).map((row) => (row.auditMeta || !proofOf.get(row.actionId) ? row : { ...row, auditMeta: proofOf.get(row.actionId) }))
		],
		surfaces: [...(official?.surfaces ?? []), ...(held.surfaces ?? [])],
		criteria: [...(official?.criteria ?? []), ...(held.criteria ?? [])]
	};
}

/**
 * Whether the change is official: it was declared live (or closed) and its
 * drafts were written into the specification (ac-evo-req-landing). Before that,
 * built and approved included, nothing a request holds is part of the
 * specification. A request whose drafts were all written under the earlier
 * rule, when accepting the Build made it official, still reads as official.
 */
export function isLanded(request: Pick<EvolutionRequest, 'status' | 'deployment' | 'drafts'>): boolean {
	if (request.status === 'closed' || request.deployment !== null) return true;
	return request.drafts.length > 0 && request.drafts.every((d) => d.materialisedAt !== null);
}

/**
 * The draft that still stands for a touched feature: one the change has not
 * written into the specification yet. Null once the change landed, and for a
 * request frozen before landing waited for the Build, whose drafts were
 * already written at their freeze: both read the feature itself.
 */
export function pendingDraftFor(request: EvolutionRequest, leafId: string): DraftLeaf | null {
	if (isLanded(request)) return null;
	return request.drafts.find((d) => (d.id === leafId || d.baseLeafId === leafId) && d.materialisedAs === null) ?? null;
}
