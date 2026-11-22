import { mintUuid } from '$domain/shared';
import {
	behaviourCriterionLines,
	blockFieldByPath,
	landedCriteria,
	canSaveField,
	canonicalPathsFor,
	type BlockField,
	type EvolutionRequest
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
			(text): AcceptanceCriterion => byText.get(text) ?? { id: mintUuid(), text }
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

/**
 * What a field of a touched feature holds for a request: the value held on the
 * request's amendment while the change is not official, otherwise the value the
 * feature holds (ac-evo-req-landing). A value given on a feature that exists
 * waits on the amendment and reaches the feature only when the change lands.
 */
export function readTouchedField(
	draft: ProjectFeaturesDraft,
	request: { readonly drafts: readonly { readonly id: string; readonly kind: string; readonly baseLeafId: string | null; readonly materialisedAs: string | null }[] },
	fieldPath: string,
	leafId: string
): { value: string; sourceIds: string[] } {
	const holding = request.drafts.find((d) => d.baseLeafId === leafId && d.kind !== 'add' && d.materialisedAs === null);
	if (holding) {
		const held = readDossierField(draft, fieldPath, holding.id);
		if (held.value.trim() !== '') return held;
	}
	return readDossierField(draft, fieldPath, leafId);
}

/**
 * What the request's draft carries for one field of a touched feature: a value
 * carried by a draft counts as filled (d6560483), before anything is written in
 * the section.
 */
export function draftCarriedValue(request: Pick<EvolutionRequest, 'drafts'>, leafId: string, fieldPath: string): string {
	// An amendment stands for the feature it amends: the freeze writes its values
	// there, so a field the draft fills is filled on that feature too. Read only
	// on the draft's own id, the base feature kept asking for values the draft
	// already carried, and the author proposed them a second time to be counted.
	const draft = carryingDraft(request, leafId);
	if (!draft) return '';
	const key = blockFieldByPath(fieldPath)?.canonicalPath.split('.').pop();
	// A Given/When/Then criterion the behaviour model adds, rewords or retires is an acceptance change too (criterion 52c53f0c).
	if (key === 'acceptanceCriteria') return [...draft.acceptanceCriteria.map((c) => c.text), ...behaviourCriterionLines(draft.behaviourModel)].join('\n');
	const raw = key ? (draft as unknown as Record<string, unknown>)[key] : undefined;
	return typeof raw === 'string' ? raw : '';
}

const carryingDraft = (request: Pick<EvolutionRequest, 'drafts'>, leafId: string) =>
	request.drafts.find((d) => d.id === leafId) ??
	request.drafts.find((d) => d.kind === 'amend' && d.baseLeafId === leafId && d.materialisedAs === null);

/**
 * What a field of a touched feature holds now, as its card shows it, and what
 * validating or refusing it stands behind (d6560483): the value the landing of
 * the request's draft would write (criterion c0a6eef3). A text signed on the
 * draft, else typed on it, stands before the feature's own; the Acceptance
 * criteria read the feature's text criteria with the draft's rewordings and
 * retirements applied and its added ones, then the behaviour criteria it changes
 * (criterion 52c53f0c). So any later change of the draft outdates a validation.
 */
export function readHeldField(
	draft: ProjectFeaturesDraft,
	request: Pick<EvolutionRequest, 'drafts'>,
	fieldPath: string,
	leafId: string
): { value: string; sourceIds: string[] } {
	const written = readTouchedField(draft, request, fieldPath, leafId);
	const carrying = carryingDraft(request, leafId);
	if (!carrying) return written;
	const meta = (id: string | null) => (id ? draft.leafMeta?.[id] : undefined);
	if (blockFieldByPath(fieldPath)?.canonicalPath.split('.').pop() === 'acceptanceCriteria') {
		const landed = landedCriteria(meta(carrying.baseLeafId)?.acceptanceCriteria, carrying, meta(carrying.id)?.acceptanceCriteria);
		return { ...written, value: [...landed.map((c) => c.text), ...behaviourCriterionLines(carrying.behaviourModel)].join('\n') };
	}
	const signed = readDossierField(draft, fieldPath, carrying.id).value;
	const typed = draftCarriedValue(request, leafId, fieldPath);
	const own = carrying.baseLeafId ? readDossierField(draft, fieldPath, carrying.baseLeafId).value : '';
	return { ...written, value: [signed, typed, own].find((v) => v.trim() !== '') ?? '' };
}
