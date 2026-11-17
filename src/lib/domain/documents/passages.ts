import type { ProjectDocumentsDraft } from './draft';

/**
 * The passages an element rests on (criterion f09da92d of feat-source-register):
 * a place in the text Unspag stores for a source of the register (criterion
 * 81dffe4f), its exact words, and in one sentence what the element took from
 * them. The register keeps the place and the words, never the stored text
 * itself. Pure.
 */

/** The text Unspag stores for a register source, named by reference: its stored id and hash, never its bytes. */
export interface StoredText {
	readonly id: string;
	readonly hash: string;
}

export interface SourcePassage {
	readonly id: string;
	/** The register source it quotes. */
	readonly sourceId: string;
	/** The element it supports, as the Specification 360° anchors it ("feature:f1", "role:r1", "term:t1"...). */
	readonly anchor: string;
	/** Character offsets into the stored text, end exclusive. */
	readonly start: number;
	readonly end: number;
	/** The words as the stored text reads them. */
	readonly words: string;
	/** What the element took from them, in one sentence. */
	readonly takes: string;
}

/** The longest passage kept: a quote, never a copy of the document. */
export const PASSAGE_MAX_CHARS = 2000;

const SPACE = /\s/;

/**
 * Where words stand in a text, spaces aside (a line break or a double space in
 * the stored text still matches one space in the quote), or null when the text
 * does not hold them word for word. The first occurrence wins.
 */
export function locateWords(text: string, words: string): { start: number; end: number } | null {
	const wanted = words.trim().split(/\s+/).filter(Boolean);
	if (wanted.length === 0) return null;
	const exact = text.indexOf(words.trim());
	if (exact >= 0) return { start: exact, end: exact + words.trim().length };
	// Normalise the text's spaces, keeping a map from each kept character to its place in the original.
	const kept: number[] = [];
	let flat = '';
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (SPACE.test(ch)) {
			if (flat.length > 0 && flat[flat.length - 1] !== ' ') {
				flat += ' ';
				kept.push(i);
			}
			continue;
		}
		flat += ch;
		kept.push(i);
	}
	const target = wanted.join(' ');
	const at = flat.indexOf(target);
	if (at < 0) return null;
	return { start: kept[at], end: kept[at + target.length - 1] + 1 };
}

export interface PassageInput {
	readonly sourceId: string;
	readonly anchor: string;
	readonly words: string;
	readonly takes: string;
}

export type PassageRefusal = { readonly input: PassageInput; readonly reason: string };

/**
 * Place each passage in the stored text of its source and fold it into the
 * register: a passage already recorded at the same place for the same element
 * is replaced (its words and what it took are rewritten), never doubled.
 * `textOf` answers the stored text of a register source, null when none is stored.
 */
export function citePassages(
	draft: ProjectDocumentsDraft,
	inputs: readonly PassageInput[],
	textOf: (sourceId: string) => string | null,
	newId: () => string
): { readonly draft: ProjectDocumentsDraft; readonly recorded: readonly SourcePassage[]; readonly refused: readonly PassageRefusal[] } {
	let passages = [...(draft.passages ?? [])];
	const recorded: SourcePassage[] = [];
	const refused: PassageRefusal[] = [];
	for (const input of inputs) {
		const anchor = input.anchor.trim();
		const takes = input.takes.trim();
		const source = draft.sources.find((s) => s.id === input.sourceId);
		const refuse = (reason: string) => refused.push({ input, reason });
		if (!source) refuse(`No source of the register has the id "${input.sourceId}".`);
		else if (!anchor) refuse('Name the element the passage supports (its anchor, e.g. "feature:<id>").');
		else if (!takes) refuse('Say in one sentence what the element took from the passage.');
		else if (input.words.trim().length > PASSAGE_MAX_CHARS) refuse(`A passage quotes at most ${PASSAGE_MAX_CHARS} characters: cite the words the element rests on, not the whole section.`);
		else {
			const text = source.stored ? textOf(source.id) : null;
			const place = text === null ? null : locateWords(text, input.words);
			if (text === null) refuse(`The text of "${source.title || source.id}" is not stored: store it first (attach_source with register_id "${source.id}").`);
			else if (!place) refuse(`These words are not in the stored text of "${source.title || source.id}", word for word: quote them as the source reads them.`);
			else {
				const passage: SourcePassage = { id: newId(), sourceId: source.id, anchor, start: place.start, end: place.end, words: text.slice(place.start, place.end), takes };
				const same = passages.findIndex((p) => p.sourceId === passage.sourceId && p.anchor === anchor && p.start === passage.start);
				if (same >= 0) passages[same] = { ...passage, id: passages[same].id };
				else passages = [...passages, passage];
				recorded.push(same >= 0 ? passages[same] : passage);
			}
		}
	}
	return { draft: { ...draft, passages }, recorded, refused };
}

/** The passages an element rests on, in the order of their source then their place. */
export function passagesOf(draft: Pick<ProjectDocumentsDraft, 'passages'>, anchor: string): SourcePassage[] {
	return (draft.passages ?? []).filter((p) => p.anchor === anchor).sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.start - b.start);
}

/** Split a stored text around passages, for a reader that highlights them: the earliest wins where two overlap. */
export function markPassages(text: string, passages: readonly Pick<SourcePassage, 'id' | 'start' | 'end'>[]): { readonly text: string; readonly passageId: string | null }[] {
	const sorted = [...passages].filter((p) => p.end > p.start && p.start < text.length).sort((a, b) => a.start - b.start);
	const out: { text: string; passageId: string | null }[] = [];
	let at = 0;
	for (const p of sorted) {
		const start = Math.max(p.start, at);
		const end = Math.min(p.end, text.length);
		if (end <= start) continue;
		if (start > at) out.push({ text: text.slice(at, start), passageId: null });
		out.push({ text: text.slice(start, end), passageId: p.id });
		at = end;
	}
	if (at < text.length) out.push({ text: text.slice(at), passageId: null });
	return out;
}
