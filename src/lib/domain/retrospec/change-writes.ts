/**
 * What Lyriks writes into the specification once a person validated a change a
 * later run reported (feat-120, point 214): the run's AI prepares the exact
 * writes when it reports the change, a person validates them on Mismatch, and
 * Lyriks writes them itself. No second pass of an AI follows, so nothing but
 * the validated changes can enter the specification.
 *
 * The edits and the operations stay opaque here: they are the vocabulary of
 * patch_section and of apply_behavior_batch, checked by the section's own
 * guards and by the behaviour engine where they are applied. Pure.
 */

/** The sections a validated change may write, by their wire id. */
export const RETROSPEC_WRITE_SECTIONS = ['foundation', 'users', 'features', 'experience', 'rules', 'data', 'architecture', 'glossary'] as const;
export type RetrospecWriteSection = (typeof RETROSPEC_WRITE_SECTIONS)[number];
export const isRetrospecWriteSection = (v: unknown): v is RetrospecWriteSection =>
	typeof v === 'string' && (RETROSPEC_WRITE_SECTIONS as readonly string[]).includes(v);

/** One batch of apply_behavior_batch on one feature. */
export interface BehaviorWrite {
	readonly featureId: string;
	readonly operations: readonly Readonly<Record<string, unknown>>[];
}

/** The edits of patch_section on one section. */
export interface SectionWrite {
	readonly section: RetrospecWriteSection;
	readonly edits: readonly Readonly<Record<string, unknown>>[];
}

export type ChangeWrite = BehaviorWrite | SectionWrite;

export const isBehaviorWrite = (w: ChangeWrite): w is BehaviorWrite => 'featureId' in w;

/** At most this many writes per change, and this many operations or edits per write. */
export const MAX_CHANGE_WRITES = 20;
export const MAX_WRITE_OPERATIONS = 500;

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
const records = (v: unknown): Raw[] | null => (Array.isArray(v) && v.every(isRecord) ? (v as Raw[]) : null);

/**
 * The writes a change carries, or the sentence that refuses them (rules 76c2c60d,
 * 911113ef of feat-145): what each one is is checked here, whether it applies is
 * checked against the specification where it is applied.
 */
export function readChangeWrites(id: string, raw: unknown): { readonly ok: true; readonly writes: ChangeWrite[] } | { readonly ok: false; readonly reason: string } {
	const refuse = (why: string) => ({ ok: false as const, reason: `The change ${id} ${why}` });
	if (!Array.isArray(raw) || raw.length === 0) return refuse('says what to write: writes.');
	if (raw.length > MAX_CHANGE_WRITES) return refuse(`carries at most ${MAX_CHANGE_WRITES} writes.`);
	const writes: ChangeWrite[] = [];
	for (const [index, value] of raw.entries()) {
		const at = `write ${index + 1}`;
		if (!isRecord(value)) return refuse(`has a ${at} that is neither { featureId, operations } nor { section, edits }.`);
		if (typeof value.featureId === 'string' && value.featureId.trim()) {
			const operations = records(value.operations);
			if (!operations || operations.length === 0) return refuse(`has a ${at} on ${value.featureId} without operations.`);
			if (operations.length > MAX_WRITE_OPERATIONS) return refuse(`has a ${at} of more than ${MAX_WRITE_OPERATIONS} operations.`);
			writes.push({ featureId: value.featureId.trim(), operations });
		} else if (value.section !== undefined) {
			if (!isRetrospecWriteSection(value.section)) return refuse(`has a ${at} on "${String(value.section)}": a change writes ${RETROSPEC_WRITE_SECTIONS.join(', ')}.`);
			const edits = records(value.edits);
			if (!edits || edits.length === 0) return refuse(`has a ${at} on ${value.section} without edits.`);
			if (edits.length > MAX_WRITE_OPERATIONS) return refuse(`has a ${at} of more than ${MAX_WRITE_OPERATIONS} edits.`);
			writes.push({ section: value.section, edits });
		} else return refuse(`has a ${at} that is neither { featureId, operations } nor { section, edits }.`);
	}
	return { ok: true, writes };
}

/** Writes read back from a stored report; one that does not read whole leaves the change with none. */
export function parseChangeWrites(raw: unknown): ChangeWrite[] {
	const read = readChangeWrites('', raw);
	return read.ok ? read.writes : [];
}

/** What a write created that a person validates in Knowledge, as the engine or the edit names it. */
export interface CreatedElement {
	readonly kind: string;
	readonly id: string;
}

/** The anchor a created element is validated under, or null when Knowledge validates no such element. */
const SECTION_ANCHORS: Readonly<Record<string, string>> = { features: 'feature', roles: 'role', journeys: 'journey', terms: 'term' };

/** The elements a section write appends under an id it names: the anchors they read validated under. */
export function appendedElements(write: SectionWrite): CreatedElement[] {
	return write.edits.flatMap((edit) => {
		const kind = edit.op === 'append' && typeof edit.collection === 'string' ? SECTION_ANCHORS[edit.collection] : undefined;
		const id = typeof edit.id === 'string' ? edit.id : isRecord(edit.value) && typeof edit.value.id === 'string' ? edit.value.id : '';
		return kind && id ? [{ kind, id }] : [];
	});
}

/**
 * The anchors of the elements a written change became, which read validated by
 * whoever validated the change (criterion 114be880): the element it changed, or
 * the features, roles, journeys, terms and actions it added. A removal leaves none.
 */
export function writtenAnchors(change: { readonly kind: string; readonly anchor: string | null }, created: readonly { readonly featureId: string | null; readonly element: CreatedElement }[]): string[] {
	if (change.kind === 'removed') return [];
	if (change.kind === 'changed') return change.anchor ? [change.anchor] : [];
	const anchors = created.flatMap(({ featureId, element }) => {
		if (element.kind === 'action') return featureId ? [`action:${featureId}:${element.id}`] : [];
		return Object.values(SECTION_ANCHORS).includes(element.kind) ? [`${element.kind}:${element.id}`] : [];
	});
	return [...new Set(anchors)];
}
