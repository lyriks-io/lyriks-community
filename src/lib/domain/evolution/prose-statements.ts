/**
 * A text of a step of prose read as what it says, one statement at a time
 * (ac-evo-form-prose-as-list): its paragraphs, each made of its lines, a
 * paragraph written in one go cut into its sentences, a list marker typed at
 * the start of a line set aside. A paragraph written line by line is a list
 * already: each line is one point as written (ac-evo-form-list-edit). The text itself is never changed: this is only how it is read, and
 * editing opens it as it was written.
 *
 * Pure and framework-free.
 */

/** A dash, a star, a bullet or a number typed to start a line of a list. */
const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s+/;
/** Where a sentence ends: its stop, then a space, then what opens the next one. */
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[\p{Lu}«"“(@\d])/u;

export function proseStatements(text: string): string[][] {
	return text
		.split(/\n\s*\n/)
		.map((paragraph) => {
			const lines = paragraph
				.split('\n')
				.map((line) => line.trim().replace(LIST_MARKER, ''))
				.filter((line) => line !== '');
			// A paragraph already written line by line is a list as it stands: a line is one point, never cut again.
			if (lines.length > 1) return lines;
			return lines.flatMap((line) => line.split(SENTENCE_BREAK).map((sentence) => sentence.trim())).filter((sentence) => sentence !== '');
		})
		.filter((paragraph) => paragraph.length > 0);
}

/** How many things a text says: a text saying one thing stays a sentence. */
export const statementCount = (paragraphs: readonly (readonly string[])[]): number => paragraphs.reduce((n, p) => n + p.length, 0);

/** The points an answer is edited as, in their order, one field each (ac-evo-form-list-edit). */
export const pointsOf = (text: string): string[] => proseStatements(text).flat();

/** What a list edited point by point saves: one point per line, the empty ones left out. */
export const textOfPoints = (points: readonly string[]): string =>
	points
		.map((point) => point.replace(/\s*\n\s*/g, ' ').trim())
		.filter((point) => point !== '')
		.join('\n');
