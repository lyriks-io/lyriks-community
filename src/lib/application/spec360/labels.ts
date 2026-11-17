import type { Option } from '$domain/shared';

/**
 * A stored text, trimmed; '' when the field is absent. Drafts written by older
 * versions of a section can miss a field the current shape declares, and a
 * read-only page must still render them.
 */
export function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** A stored list, or none when the field is absent. */
export function list<T>(value: readonly T[] | null | undefined): readonly T[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Small readers shared by the Specification 360° views: a stored code read as
 * the label the app gives it (a code the list does not know is shown as it was
 * written, never dropped), plural counts, and the lead sentence of a text.
 */

export function labelOf(options: readonly Option[], code: string): string {
	return options.find((o) => o.code === code)?.label ?? code;
}

export function labelsOf(options: readonly Option[], codes: readonly string[]): string[] {
	return codes.map((c) => labelOf(options, c)).filter((l) => l.trim() !== '');
}

/** "1 feature", "3 features". */
export function counted(n: number, singular: string, plural = `${singular}s`): string {
	return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * The opening of a text, the way a pitch reads it: its first sentence, with
 * the next one when the first is too short to say anything on its own.
 */
export function leadSentence(text: string): string {
	const clean = text.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ') ?? '';
	const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [];
	const [first = clean, second] = sentences.map((x) => x.trim());
	if (first.length >= 60 || !second) return first;
	return `${first} ${second}`;
}

/** A text's paragraphs, each on one line: what the Overview reads of the product summary (criterion 416e4885). */
export function paragraphsOf(text: string): string[] {
	return text
		.trim()
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

/** A unit after a value, the way a target reads ("100 %", "500 ms", "2 min"). */
export function withUnit(value: number | string | null | undefined, unit: string): string {
	if (value === null || value === undefined || value === '') return '';
	return unit.trim() ? `${value} ${unit.trim()}` : String(value);
}
