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
 * A row of the features section keyed by a draft id rather than a feature id.
 *
 * It is where a value signed on a draft waits for the freeze: the dossier writes
 * every field through to its canonical section (ac-evo-wt-2), and for a feature
 * that does not exist yet that section has nowhere else to put it. The row is
 * removed here, the moment the draft becomes a leaf, and by `pruneDraftMeta`
 * when the request that carried it is deleted.
 */
export const DRAFT_META_PREFIX = 'draft:';

/** Rows left behind by drafts that can no longer be signed. */
export function pruneDraftMeta<T extends Tree>(
	features: T,
	draftIds: readonly string[]
): { features: T; changed: boolean } {
	const meta = { ...(features.leafMeta ?? {}) };
	let changed = false;
	for (const id of draftIds) {
		if (id in meta) {
			delete meta[id];
			changed = true;
		}
	}
	return changed ? { features: { ...features, leafMeta: meta }, changed } : { features, changed };
}

/**
 * Acceptance criteria signed on a draft are ADDED to the ones the feature
 * already carries, never substituted for them: an amendment that says one more
 * thing must not silently drop the lines nobody questioned. An identical text is
 * kept once, in the order it was first met.
 *
 * Identical is read generously, ignoring case, the amount of space between words
 * and the punctuation a sentence ends on, because the same line retyped by hand
 * differs from the first one by exactly those three things and by nothing that
 * changes its meaning.
 */
const criterionKey = (text: string) =>
	text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/[.!;:,]+$/, '');

/**
 * How many of the second list the first already states word for word.
 *
 * Printed on the freeze, because the identifier that survives a repeat is the one
 * the FEATURE gave it, and nothing used to say so: whoever had noted the draft's
 * identifiers and anchored an index on them found them attached to nothing, and
 * concluded that the freeze renumbers criteria. It does not.
 */
function repeatedCriteria(
	before: readonly { readonly id: string; text: string }[] | undefined,
	fromDraft: readonly { readonly id: string; text: string }[]
): number {
	const held = new Set((before ?? []).map((criterion) => criterionKey(criterion.text)));
	return fromDraft.filter((criterion) => held.has(criterionKey(criterion.text))).length;
}

function mergeCriteria(
	...lists: (readonly { readonly id: string; text: string }[] | undefined)[]
): { readonly id: string; text: string }[] {
	const out: { readonly id: string; text: string }[] = [];
	const seen = new Set<string>();
	for (const list of lists) {
		for (const criterion of list ?? []) {
			const key = criterionKey(criterion.text);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push(criterion);
		}
	}
	return out;
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

/**
 * The base description with an amendment's patches and appended text applied.
 * A passage that no longer occurs (the feature moved since the draft was
 * checked) is left alone rather than guessed at.
 */
export function editedDescription(base: string, draft: Pick<DraftLeaf, 'descriptionPatch' | 'descriptionAppend'>): string {
	let out = base;
	for (const p of draft.descriptionPatch ?? []) if (out.includes(p.find)) out = out.replace(p.find, p.replace);
	const append = draft.descriptionAppend?.trim();
	return append ? (out.trim() ? `${out.trimEnd()}\n\n${append}` : append) : out;
}

/** The feature's criteria less what the amendment retires, with its rewordings, ids kept. */
function delta(
	criteria: readonly { readonly id: string; text: string }[] | undefined,
	draft: Pick<DraftLeaf, 'retireCriteria' | 'changeCriteria'>
): { readonly id: string; text: string }[] {
	const retired = new Set(draft.retireCriteria ?? []);
	const reworded = new Map((draft.changeCriteria ?? []).map((c) => [c.id, c.text]));
	return (criteria ?? [])
		.filter((c) => !retired.has(c.id))
		.map((c) => (reworded.has(c.id) ? { id: c.id, text: reworded.get(c.id) as string } : c));
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
			delete meta[draft.id];
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
							description: draft.description || editedDescription(f.description, draft),
							coreId: core,
							parentFamilyId:
								draft.parentFamilyId !== null ? draft.parentFamilyId : f.parentFamilyId
						}
					: f
			);
		}

		const before = meta[id] ?? {};
		// What a person signed on the draft. It arrives here rather than on the
		// draft object whenever it came through a proposal, which is the ordinary
		// road: the freeze writes what was SIGNED, not only what was typed.
		//
		// And the signed value WINS over the one typed on the draft. A signature is
		// a person's act; the draft's text is a client's opening move. The other way
		// round, a person signed a value and the feature carried something else,
		// with nothing on screen to say which of the two had been kept.
		const signed = meta[draft.id] ?? {};
		const note = behaviourNote(draft);
		meta[id] = {
			...before,
			status: before.status ?? 'backlog',
			objective: signed.objective || draft.objective || before.objective,
			problem: signed.problem || draft.problem || before.problem,
			expectedEffect: signed.expectedEffect || draft.expectedEffect || before.expectedEffect,
			value: signed.value || draft.value || before.value,
			// Same rule for the list: a signed list REPLACES the typed one rather than
			// joining it, or the two say the same thing twice in different words. The
			// merge stays for what the EXISTING feature already carried, which an
			// amendment must never silently drop.
			acceptanceCriteria: mergeCriteria(
				delta(before.acceptanceCriteria, draft),
				signed.acceptanceCriteria?.length ? signed.acceptanceCriteria : criteriaOf(draft)
			),
			dependsOn: [...new Set([...(before.dependsOn ?? []), ...draft.dependsOn.map(resolve)])],
			sourceIds: [...new Set([...(before.sourceIds ?? []), ...draft.sourceIds])],
			code: note || before.code
		};
		delete meta[draft.id];
		written.push(draft);
		const repeated = repeatedCriteria(
			before.acceptanceCriteria,
			signed.acceptanceCriteria?.length ? signed.acceptanceCriteria : criteriaOf(draft)
		);
		// Said only when it happened, so the ordinary line stays one sentence.
		const kept =
			repeated === 0
				? ''
				: `, ${repeated} acceptance ${repeated === 1 ? 'criterion' : 'criteria'} it already carried kept the id the feature gave it`;
		const retired = draft.retireCriteria?.length ?? 0;
		const reworded = draft.changeCriteria?.length ?? 0;
		const edits =
			retired + reworded === 0
				? ''
				: `, ${[retired ? `${retired} criteria retired` : '', reworded ? `${reworded} reworded` : ''].filter(Boolean).join(' and ')}`;
		lines.push(
			draft.kind === 'add'
				? `Created "${draft.name}" (${id}) from request ${request.id}${kept}`
				: `Amended "${draft.name || id}" (${id}) from request ${request.id}${edits}${kept}`
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
