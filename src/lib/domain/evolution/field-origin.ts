/**
 * What an answer on a touched feature holds, split by where it comes from
 * (ac-evo-mat-split-bar): what this request brings, and what the feature
 * already held before it. A list answer (acceptance criteria) is split line by
 * line; a text answer reads as the request's when the request gave one, with
 * the feature's earlier text beside it when it differs.
 *
 * The split used to be a count drawn as a bar, computed field by field from
 * what was typed on the dossier: criteria a draft added were counted as the
 * feature's, and the answer itself showed only part of what the request
 * carried. Here every line is shown, and says whose it is.
 */
export interface FieldOrigin {
	/** What this request brings: its own value, or the lines it adds. */
	readonly request: readonly string[];
	/** What the feature already held, not repeated by the request. */
	readonly feature: readonly string[];
}

const norm = (s: string) =>
	s
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/[.!?;:]+$/, '');
const lines = (s: string) =>
	s
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '');

export function fieldOrigin(input: {
	readonly kind: 'text' | 'list';
	/** Every value the request carries for the field: its draft's, the one signed on it. */
	readonly requestValues: readonly string[];
	/** The value the feature holds, as the section has it. */
	readonly featureValue: string;
}): FieldOrigin {
	if (input.kind === 'list') {
		const seen = new Set<string>();
		const request: string[] = [];
		for (const line of input.requestValues.flatMap(lines)) {
			if (seen.has(norm(line))) continue;
			seen.add(norm(line));
			request.push(line);
		}
		return { request, feature: lines(input.featureValue).filter((l) => !seen.has(norm(l))) };
	}
	const own = input.requestValues.map((v) => v.trim()).find((v) => v !== '') ?? '';
	const feature = input.featureValue.trim();
	if (own === '') return { request: [], feature: feature ? [feature] : [] };
	return { request: [own], feature: feature && norm(feature) !== norm(own) ? [feature] : [] };
}
