import { concurrentImpact, crossEvolutions, findRequestByRef, requestKeyOf, requestPagePath, type CrossElementKind, type CrossReading, type CrossWrites, type EvolutionRequest } from '$domain/evolution';
import type { EvolutionView } from './evolution-view.server';

/**
 * One evolution in progress read against another, the way a page and a tool
 * answer show it: by its key, its title, its page and the step it stands at,
 * with the features and tables both touch named the way the product names
 * them, and each rule or field a side writes next to what it reads today.
 */
function namedReading(view: EvolutionView, cross: CrossReading) {
	const requests = view.draft.requests;
	const featureName = (id: string) => view.leaves.find((l) => l.id === id)?.name ?? id;
	const tableName = (id: string) => view.data.entities.find((e) => e.id === id)?.name ?? id;
	const nameOf = (kind: 'feature' | 'table', id: string) => (kind === 'feature' ? featureName(id) : tableName(id));
	// What a rule or a field reads in the spec as it stands: a retirement names
	// nothing else, and a rewording is read against it.
	const current = new Map<string, string>([
		...Object.values(view.features.leafMeta ?? {}).flatMap((meta) => (meta.acceptanceCriteria ?? []).map((c): [string, string] => [`feature:${c.id}`, c.text])),
		...view.data.fields.map((f): [string, string] => [`table:${f.id}`, f.name])
	]);
	const read = (kind: CrossElementKind, writes: CrossWrites | null) =>
		writes && {
			summary: writes.summary,
			items: writes.items.map((item) => {
				const was = current.get(`${kind}:${item.id}`) ?? null;
				return { ...item, text: item.text || was || '', was };
			})
		};
	const other = requests.find((r) => r.id === cross.requestId);
	if (!other) return [];
	return [
		{
			id: other.id,
			key: requestKeyOf(requests, other.id),
			title: other.title,
			stage: other.stage,
			specVersion: other.specVersion,
			href: requestPagePath(view.projectId, other.id),
			verdict: cross.verdict,
			shared: cross.shared.map((s) => ({
				...s,
				name: nameOf(s.kind, s.id),
				hereWrites: read(s.kind, s.hereWrites),
				thereWrites: read(s.kind, s.thereWrites)
			})),
			theirs: cross.theirs.map((t) => ({ kind: t.kind, change: t.change, name: t.name || nameOf(t.kind, t.id) }))
		}
	];
}

/** The other evolutions of the project in progress, read against one request. */
export function crossEvolutionsOf(view: EvolutionView, request: EvolutionRequest) {
	return crossEvolutions(request, view.draft.requests).flatMap((cross) => namedReading(view, cross));
}

/**
 * The report on the evolutions a reader picked, named by the address
 * (criterion f70b2e9f); null when the address names none that exists.
 */
export function concurrentImpactOf(view: EvolutionView, refs: readonly string[]) {
	const requests = view.draft.requests;
	const live = requests.filter((r) => r.status !== 'deleted');
	const picked = [...new Set(refs.flatMap((ref) => {
		const found = findRequestByRef(live, ref);
		return found.kind === 'found' ? [found.request] : [];
	}))];
	if (picked.length === 0) return null;
	const named = (r: EvolutionRequest) => ({ id: r.id, key: requestKeyOf(requests, r.id) ?? r.title, title: r.title, href: requestPagePath(view.projectId, r.id) });
	const impact = concurrentImpact(picked, requests);
	return {
		picked: picked.map(named),
		pairs: impact.pairs.flatMap((pair) => {
			const here = requests.find((r) => r.id === pair.hereId);
			return here ? namedReading(view, pair.reading).map((there) => ({ here: named(here), there })) : [];
		}),
		undrafted: impact.undrafted.map(named)
	};
}

export type ConcurrentImpactReading = NonNullable<ReturnType<typeof concurrentImpactOf>>;
export type CrossEvolutionReading = ReturnType<typeof crossEvolutionsOf>[number];
