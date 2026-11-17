import type { AppServices } from '$composition/container.server';
import type { BehavioralIndexPayload, EnginePayload } from '$application/ports';
import { draftIndexKeys, isLanded, withHeldEntries, type HeldEntry } from '$domain/evolution';
import { mapLimit } from '$lib/shared/map-limit';
import { draftFeature } from './evolution-graph.server';

/** How many times a hold refused on the dossier's revision is read again and retried. */
const HOLD_SAVE_ATTEMPTS = 5;

/**
 * The index entries the specification cannot resolve yet because they name
 * what an Evolution request adds (ac-evo-impl-held). The engine reports them as
 * orphans, or resolves them through another feature when a state path or an
 * event name is shared; here they are held on the request they belong to, read
 * by its report, and resolved by the next sync once the change lands, under the
 * same ids. An orphan that belongs to no request stays an orphan.
 */
export async function holdDraftEntries(
	services: AppServices,
	projectId: string,
	index: BehavioralIndexPayload,
	answer: EnginePayload
): Promise<EnginePayload> {
	const orphans = answer.orphans as { total?: number; entries?: { key?: unknown }[] } | undefined;
	const orphanKeys = (orphans?.entries ?? []).map((e) => e.key).filter((k): k is string => typeof k === 'string');
	const [evolution, revision] = await Promise.all([
		services.loadEvolutionDraft.execute(projectId),
		services.sectionDocuments.currentRevision(projectId, 'evolution')
	]);
	if (!evolution) return answer;
	const orphaned = new Set(orphanKeys);
	const entries = index as Readonly<Record<string, HeldEntry>>;
	const pending = (request: (typeof evolution.requests)[number]) => request.status === 'open' && !isLanded(request) && request.drafts.length > 0;
	// A state path or an event name another feature declares already resolves in
	// the engine, so it never comes back an orphan; it is still what the draft
	// adds, and its report reads it from the request. Only such keys warrant
	// computing the drafts when nothing came back an orphan.
	const shared = Object.keys(index).some((k) => k.startsWith('state:') || k.startsWith('event:'));
	if (orphanKeys.length === 0 && !shared && !evolution.requests.some((r) => Object.keys(r.heldImplementation ?? {}).length > 0)) return answer;
	const features = await services.loadFeaturesDraft.execute(projectId);
	/** The keys each pending request's drafts add: what the feature they stand for does not hold. */
	const ownKeys = new Map<string, Set<string>>();
	await mapLimit(
		evolution.requests.filter(pending),
		2,
		async (request) => {
			const keys = new Set<string>();
			for (const draft of request.drafts) {
				if (draft.kind === 'remove' || draft.materialisedAs !== null) continue;
				const [snapshot, base] = await Promise.all([
					draftFeature(services, evolution, draft.id),
					draft.baseLeafId ? services.readBehaviorFeature.execute(projectId, draft.baseLeafId).catch(() => null) : Promise.resolve(null)
				]);
				const signed = (features.leafMeta?.[draft.id]?.acceptanceCriteria ?? []).map((c) => c.id);
				const official = new Set(
					draftIndexKeys((base?.feature as Record<string, unknown> | undefined) ?? null, {
						acceptanceCriteria: (draft.baseLeafId ? features.leafMeta?.[draft.baseLeafId]?.acceptanceCriteria : undefined) ?? []
					})
				);
				for (const key of draftIndexKeys(snapshot, draft, signed)) if (orphaned.has(key) || !official.has(key)) keys.add(key);
			}
			ownKeys.set(request.id, keys);
		}
	);
	/** What the requests of `current` read once this index is held on them: the drafts did not move, only the dossier around them. */
	const hold = (current: NonNullable<typeof evolution>) => {
		const heldBy: { requestId: string; title: string; keys: string[] }[] = [];
		const requests = current.requests.map((request) => {
			const own = ownKeys.get(request.id) ?? new Set<string>();
			// What a request held and the index now resolves is released once nothing it still adds names it: the change landed.
			const kept = Object.fromEntries(Object.entries(request.heldImplementation ?? {}).filter(([k]) => own.has(k) || !(k in index) || orphaned.has(k)));
			const mine = Object.keys(entries).filter((k) => own.has(k));
			if (mine.length > 0) heldBy.push({ requestId: request.id, title: request.title, keys: mine });
			const next = withHeldEntries({ ...request, heldImplementation: kept }, Object.fromEntries(mine.map((k) => [k, entries[k]])));
			const changed = JSON.stringify(next.heldImplementation ?? {}) !== JSON.stringify(request.heldImplementation ?? {});
			return changed ? next : request;
		});
		return { heldBy, requests, changed: requests.some((r, i) => r !== current.requests[i]) };
	};
	// The dossier moves under the sync (the automatic readings, a live session): a save
	// refused on its revision is read again and held again, never dropped in silence.
	let current = evolution;
	let currentRevision = revision;
	let { heldBy, requests, changed } = hold(current);
	for (let attempt = 0; changed; attempt++) {
		const saved = await services.saveEvolutionDraft.execute({ ...current, requests }, { expectedRevision: currentRevision, origin: null });
		if (saved) break;
		if (attempt >= HOLD_SAVE_ATTEMPTS - 1) throw new Error('The index entries of an Evolution request could not be held: the request kept changing during the sync. Sync again.');
		const [reloaded, reloadedRevision] = await Promise.all([
			services.loadEvolutionDraft.execute(projectId),
			services.sectionDocuments.currentRevision(projectId, 'evolution')
		]);
		if (!reloaded) break;
		current = reloaded;
		currentRevision = reloadedRevision;
		({ heldBy, requests, changed } = hold(current));
	}
	if (heldBy.length === 0) return answer;
	const held = new Set(heldBy.flatMap((h) => h.keys));
	const remaining = (orphans?.entries ?? []).filter((e) => typeof e.key !== 'string' || !held.has(e.key));
	const failures = typeof answer.failures === 'number' ? answer.failures : 0;
	return {
		...answer,
		ok: remaining.length === 0 && failures === 0,
		orphans: { ...orphans, total: remaining.length, entries: remaining },
		heldForEvolution: heldBy,
		semantics: {
			...((answer.semantics as Record<string, unknown> | undefined) ?? {}),
			heldForEvolution:
				'Entries naming what an open Evolution request adds: the specification holds them only once the change is declared live, so they are kept on that request, read by its implementation report, and resolved by your next sync after the change lands, under the same ids. Not orphans.'
		}
	};
}
