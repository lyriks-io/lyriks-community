import {
	blockFieldByPath,
	canSaveField,
	canonicalPathsFor,
	type BlockField
} from '$domain/evolution';
import {
	type AcceptanceCriterion,
	type LeafMeta,
	type ProjectFeaturesDraft
} from '$domain/features';

/**
 * Write one field of the evolution dossier into the section that owns it.
 *
 * This is the whole of `field write-through`: the dossier shows a value that
 * belongs elsewhere and writes it straight there, keeping no copy of its own.
 * The refusal a caller gets back is the one the SPECIFICATION wrote, and a
 * refused write leaves no partial state: the section is returned untouched.
 *
 * Only `inline` fields come through here. A field whose home has an editor of
 * its own (the behaviour kernel, the access matrix, the data model) is opened
 * there instead, because a second, poorer editor for it would be a worse answer
 * than a link.
 */

export interface SaveDossierFieldInput {
	readonly fieldPath: string;
	/** The feature this value belongs to; a leaf-scoped field has one per leaf. */
	readonly leafId: string | null;
	readonly value: string;
	/** Rows of the Documents and Sources register this value rests on. */
	readonly sourceIds?: readonly string[];
	/** Whether the caller may write in the owning section. */
	readonly canWriteCanonical: boolean;
}

export type SaveDossierFieldResult =
	| { readonly status: 'accepted'; readonly draft: ProjectFeaturesDraft; readonly path: string }
	| { readonly status: 'refused'; readonly reason: string; readonly detail: string };

const refused = (reason: string, detail: string): SaveDossierFieldResult => ({
	status: 'refused',
	reason,
	detail
});

/** Split a list field's text into one entry per non-empty line. */
const linesOf = (value: string): string[] =>
	value
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

/**
 * Merge the value into the leaf's authoring record. Existing criteria keep their
 * ids where the text is unchanged, so editing one line does not renumber the
 * rest and break every reference to them.
 */
function applyToLeafMeta(
	current: LeafMeta,
	field: BlockField,
	value: string,
	sourceIds: readonly string[] | undefined
): LeafMeta {
	const next: LeafMeta = { ...current };
	if (sourceIds) next.sourceIds = [...new Set(sourceIds)];

	if (field.kind === 'list') {
		const previous = current.acceptanceCriteria ?? [];
		const byText = new Map(previous.map((c) => [c.text, c]));
		next.acceptanceCriteria = linesOf(value).map(
			(text): AcceptanceCriterion => byText.get(text) ?? { id: crypto.randomUUID(), text }
		);
		return next;
	}

	// The last path segment is the LeafMeta key the field writes to.
	const key = field.canonicalPath.split('.').pop() as keyof LeafMeta;
	if (value.trim() === '') delete next[key];
	else (next as Record<string, unknown>)[key] = value;
	return next;
}

/**
 * Apply the write to the features draft, or refuse with the reason the field's
 * own guard gives. The draft is returned rather than saved: persistence is the
 * caller's, so this stays a pure decision.
 */
export function saveDossierField(
	draft: ProjectFeaturesDraft,
	input: SaveDossierFieldInput
): SaveDossierFieldResult {
	const field = blockFieldByPath(input.fieldPath);
	if (!field) {
		return refused(
			'This field does not exist on the page.',
			'Only the fields of the ten known blocks can be written; no other field is addressable.'
		);
	}
	if (field.editor !== 'inline') {
		return refused(
			'This field is edited in the capability that owns it.',
			'Its home has an editor of its own, so the dossier sends the reader there rather than offering a second, poorer one.'
		);
	}

	const homes = canonicalPathsFor(field, input.leafId ? [input.leafId] : []);
	const path = homes[0]?.path ?? null;

	// The same guard the page applies before it ever calls: one rule, one place.
	const allowed = canSaveField({
		canonicalPath: path,
		userCanWriteCanonical: input.canWriteCanonical,
		refusalReason: 'none'
	});
	if (!allowed.ok) return refused(allowed.reason, allowed.detail);
	if (!input.leafId) {
		return refused(
			'This field does not name where it should be written.',
			'A leaf-scoped value needs the feature it belongs to; the impact report names them.'
		);
	}

	const leafMeta = draft.leafMeta ?? {};
	const updated = applyToLeafMeta(leafMeta[input.leafId] ?? {}, field, input.value, input.sourceIds);
	return {
		status: 'accepted',
		path: path as string,
		draft: { ...draft, leafMeta: { ...leafMeta, [input.leafId]: updated } }
	};
}

/** What the dossier reads back for one field of one leaf. */
export function readDossierField(
	draft: ProjectFeaturesDraft,
	fieldPath: string,
	leafId: string
): { value: string; sourceIds: string[] } {
	const field = blockFieldByPath(fieldPath);
	const meta = draft.leafMeta?.[leafId] ?? {};
	if (!field || field.editor !== 'inline') return { value: '', sourceIds: meta.sourceIds ?? [] };
	if (field.kind === 'list') {
		return {
			value: (meta.acceptanceCriteria ?? []).map((c) => c.text).join('\n'),
			sourceIds: meta.sourceIds ?? []
		};
	}
	const key = field.canonicalPath.split('.').pop() as keyof LeafMeta;
	const raw = meta[key];
	return { value: typeof raw === 'string' ? raw : '', sourceIds: meta.sourceIds ?? [] };
}
