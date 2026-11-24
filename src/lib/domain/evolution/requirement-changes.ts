import { pointsOf } from './prose-statements';
import type { AuthorKind } from './enums';

/**
 * What changed in a text of the Solution since a person last validated it
 * (criterion 6936f86a): the comments discuss and propose, the requirements
 * show the change. Pure: it reads the versions of one answer, newest first, as
 * the page receives them, and the text the answer holds now.
 */

/** One version of an answer as the page reads it: who wrote it, and who stands behind it. */
export interface AnswerVersion {
	readonly value: string;
	readonly by: string;
	readonly byKind: AuthorKind;
	/** Who validated this very version; a refusal is never among them. */
	readonly validatedBy: readonly string[];
}

/** Who wrote a line the validated version did not hold, or null when no version says it. */
export type LineAuthor = { readonly by: string; readonly byKind: AuthorKind } | null;

export interface RequirementChanges {
	/** Each line the answer holds now, in order, `added` set when the last validated version did not hold it. */
	readonly lines: readonly { readonly text: string; readonly added: LineAuthor | false }[];
	/** The lines the last validated version held and the answer no longer holds. */
	readonly removed: readonly string[];
}

/**
 * Mark the lines of `current` against the last validated version of
 * `versions` (newest first). An answer never validated reads every line added;
 * an answer whose current version is validated reads nothing marked.
 */
export function requirementChanges(current: string, versions: readonly AnswerVersion[]): RequirementChanges {
	const now = pointsOf(current);
	const validatedAt = versions.findIndex((v) => v.validatedBy.length > 0);
	const baseline = validatedAt === -1 ? [] : pointsOf(versions[validatedAt].value);
	const since = validatedAt === -1 ? versions : versions.slice(0, validatedAt);
	const held = new Set(baseline);
	return {
		lines: now.map((text) => ({ text, added: held.has(text) ? false : authorOf(text, since) })),
		removed: baseline.filter((text) => !now.includes(text))
	};
}

/**
 * The author of the version that brought a line in: the oldest of the run of
 * newest versions that all hold it, so a later rewrite of other lines keeps
 * the line's own author.
 */
function authorOf(text: string, since: readonly AnswerVersion[]): LineAuthor {
	let from = -1;
	for (let i = 0; i < since.length && pointsOf(since[i].value).includes(text); i++) from = i;
	return from === -1 ? null : { by: since[from].by, byKind: since[from].byKind };
}
