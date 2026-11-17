/** What a step still waits on the reader for, by kind: "2 features", or "the journey" for one of a kind. */
export interface WaitingPart {
	readonly count: number;
	/** The kind, singular: "section", "feature". */
	readonly one: string;
	/** Read as "the journey" rather than "1 journey": there is only ever one of it. */
	readonly definite?: boolean;
}

const wordsOf = (part: WaitingPart) => (part.definite ? `the ${part.one}` : `${part.count} ${part.one}${part.count === 1 ? '' : 's'}`);

/** How many elements "Validate all" of a step validates in one go. */
export const waitingCount = (parts: readonly WaitingPart[]): number => parts.reduce((n, p) => n + p.count, 0);

/**
 * The tooltip of a step's "Validate all": what it validates in the reader's
 * name, kind by kind ("the 3 sections of the Briefing", "2 features, 5 actions
 * and the journey of the Specification").
 */
export function stepValidateTip(step: string, parts: readonly WaitingPart[]): string {
	const words = parts.filter((p) => p.count > 0).map(wordsOf);
	const listed = words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
	const lead = words.length === 1 && !parts.find((p) => p.count > 0)?.definite ? `the ${listed}` : listed;
	return `Validate in your name ${lead} of the ${step} still waiting on you, in one go`;
}
