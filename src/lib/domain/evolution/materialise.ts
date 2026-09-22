import type { DraftLeaf, EvolutionRequest } from './draft';

/**
 * The features section, taken structurally.
 *
 * Like the knowledge graph in `impact-propagation`, the tree is described here
 * by the shape this module needs rather than imported from its own context: the
 * evolution domain owes nothing to another bounded context, and the caller at
 * the edge is what binds the two.
 */
export interface TreeLeaf {
	readonly id: string;
	name: string;
	coreId: string;
	parentFamilyId: string | null;
	description: string;
	readonly unspaghettitFeatureId: string;
}

export interface TreeLeafMeta {
	status?: 'backlog' | 'in-progress' | 'done';
	objective?: string;
	problem?: string;
	expectedEffect?: string;
	value?: string;
	code?: string;
	acceptanceCriteria?: { readonly id: string; text: string }[];
	dependsOn?: string[];
	sourceIds?: string[];
}

export interface Tree {
	readonly cores: readonly { readonly id: string }[];
	features: TreeLeaf[];
	leafMeta?: Record<string, TreeLeafMeta>;
}

/**
 * The one moment a dossier writes the tree.
 *
 * Everywhere else a draft is held, read through an overlay and thrown away. The
 * crossing into Verify freezes the specification under a number, and that same
 * act writes what the request proposed into the features section: an addition is
 * created, an amendment is patched, a removal is removed, each stamped with the
 * request that carried it (ac-evo-draft-5).
 *
 * Pure, and deliberately so: the caller decides whether the freeze happens, and
 * gets back the section to save plus the leaf ids the request now touches, so
 * the dossier stops pointing at ids that no longer stand for anything.
 */

export interface MaterialiseResult<T extends Tree> {
	readonly features: T;
	readonly request: EvolutionRequest;
	/** One plain line per draft written, for the timeline and the answer. */
	readonly lines: string[];
	/** True when anything at all was written, so the caller knows to save. */
	readonly changed: boolean;
}

/** A readable id derived from the name, unique against what the tree already holds. */
export function featureIdFor(name: string, taken: ReadonlySet<string>): string {
	const slug =
		name
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48) || 'feature';
	let candidate = `feat-${slug}`;
	let n = 2;
	while (taken.has(candidate)) candidate = `feat-${slug}-${n++}`;
	return candidate;
}

/** Where a new leaf hangs when the draft did not say: the first core of the tree. */
const fallbackCore = (features: Tree): string | null => features.cores[0]?.id ?? null;

function criteriaOf(draft: DraftLeaf): { readonly id: string; text: string }[] {
	return draft.acceptanceCriteria.map((c) => ({ id: c.id, text: c.text }));
}

/**
 * What a draft's behaviour rows become once it is real: prose on the leaf, so
 * nothing the author wrote is lost between the dossier and the tree. The rows
 * themselves are for the behaviour tools to author against; this keeps them
 * readable in the meantime rather than dropping them on the floor.
 */
function behaviourNote(draft: DraftLeaf): string {
	if (draft.behaviour.length === 0) return '';
	const byKind = new Map<string, string[]>();
	for (const row of draft.behaviour) {
		const list = byKind.get(row.kind) ?? [];
		list.push(row.detail ? `${row.name} (${row.detail})` : row.name);
		byKind.set(row.kind, list);
	}
	return [...byKind.entries()]
		.map(([kind, names]) => `${kind}: ${names.join(', ')}`)
		.join('; ');
}

export function materialiseDrafts<T extends Tree>(
	features: T,
	request: EvolutionRequest,
	at: string
): MaterialiseResult<T> {
	const pending = request.drafts.filter((d) => d.materialisedAs === null);
	if (pending.length === 0)
		return { features, request, lines: [], changed: false };

	const taken = new Set(features.features.map((f) => f.id));
	const meta: Record<string, TreeLeafMeta> = { ...(features.leafMeta ?? {}) };
	let list: TreeLeaf[] = [...features.features];
	const lines: string[] = [];
	/** Draft id to the real leaf id it became, so dependencies between drafts resolve. */
	const became = new Map<string, string>();
	const written: DraftLeaf[] = [];

	// Additions first: a draft that depends on another draft must find it.
	for (const draft of pending) {
		if (draft.kind !== 'add') continue;
		const id = featureIdFor(draft.name, taken);
		taken.add(id);
		became.set(draft.id, id);
	}

	const resolve = (id: string): string => became.get(id) ?? id;

	for (const draft of pending) {
		if (draft.kind === 'remove') {
			const target = draft.baseLeafId;
			if (!target) continue;
			list = list.filter((f) => f.id !== target);
			delete meta[target];
			became.set(draft.id, target);
			written.push(draft);
			lines.push(`Removed "${draft.name || target}" (${target})`);
			continue;
		}

		const id = draft.kind === 'add' ? (became.get(draft.id) as string) : (draft.baseLeafId as string);
		const existing = list.find((f) => f.id === id);
		const core = draft.coreId ?? existing?.coreId ?? fallbackCore(features);
		if (!core) {
			// A tree with no core cannot hold a leaf. Say so rather than writing an
			// orphan the coherence engine will report a moment later.
			lines.push(`Skipped "${draft.name}": the tree holds no core to hang it under`);
			continue;
		}

		if (draft.kind === 'add') {
			list = [
				...list,
				{
					id,
					name: draft.name,
					coreId: core,
					parentFamilyId: draft.parentFamilyId ?? null,
					description: draft.description,
					unspaghettitFeatureId: id
				}
			];
		} else if (existing) {
			list = list.map((f) =>
				f.id === id
					? {
							...f,
							name: draft.name || f.name,
							description: draft.description || f.description,
							coreId: core,
							parentFamilyId:
								draft.parentFamilyId !== null ? draft.parentFamilyId : f.parentFamilyId
						}
					: f
			);
		}

		const before = meta[id] ?? {};
		const note = behaviourNote(draft);
		meta[id] = {
			...before,
			status: before.status ?? 'backlog',
			objective: draft.objective || before.objective,
			problem: draft.problem || before.problem,
			expectedEffect: draft.expectedEffect || before.expectedEffect,
			value: draft.value || before.value,
			acceptanceCriteria:
				draft.acceptanceCriteria.length > 0 ? criteriaOf(draft) : before.acceptanceCriteria,
			dependsOn: [...new Set([...(before.dependsOn ?? []), ...draft.dependsOn.map(resolve)])],
			sourceIds: [...new Set([...(before.sourceIds ?? []), ...draft.sourceIds])],
			code: note || before.code
		};
		written.push(draft);
		lines.push(
			draft.kind === 'add'
				? `Created "${draft.name}" (${id}) from request ${request.id}`
				: `Amended "${draft.name || id}" (${id}) from request ${request.id}`
		);
	}

	const stamped = new Set(written.map((d) => d.id));
	const nextRequest: EvolutionRequest = {
		...request,
		drafts: request.drafts.map((d) =>
			stamped.has(d.id)
				? { ...d, materialisedAs: became.get(d.id) ?? null, materialisedAt: at }
				: d
		),
		// The dossier stops naming ids that no longer stand for anything: a draft
		// id becomes the leaf it became, and a removed leaf leaves the list.
		leafIds: [
			...new Set(
				request.leafIds
					.map((id) => became.get(id) ?? id)
					.filter((id) => list.some((f) => f.id === id))
			)
		]
	};

	return {
		features: { ...features, features: list, leafMeta: meta },
		request: nextRequest,
		lines,
		changed: written.length > 0
	};
}
