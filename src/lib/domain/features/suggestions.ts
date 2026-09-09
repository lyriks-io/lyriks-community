import type { Core, ProjectFeaturesDraft } from './draft';

/**
 * A feature Lyriks proposes for the tree (the mockup's "Suggested features"). Produced
 * by the AI/MCP seam (`AiSuggesterPort.suggestFeatures`) — never hardcoded in the
 * UI. Nothing is created until the user accepts. `coreKeywords` route the
 * suggestion to an existing core by name; `preferredCore` is created when nothing
 * matches.
 */
export interface FeatureSuggestion {
	readonly id: string;
	readonly title: string;
	readonly rationale: string;
	readonly coreKeywords: readonly string[];
	readonly preferredCore?: string;
}

/**
 * Anti-corruption for LLM-pushed suggestions (they arrive as untrusted JSON
 * through the MCP write path): keep well-formed items, coerce shapes, drop the
 * rest. Items without an id get a stable positional one.
 */
export function parseFeatureSuggestions(input: unknown): FeatureSuggestion[] {
	if (!Array.isArray(input)) return [];
	const out: FeatureSuggestion[] = [];
	const seen = new Set<string>();
	input.forEach((item, i) => {
		if (!item || typeof item !== 'object') return;
		const o = item as Record<string, unknown>;
		const title = typeof o.title === 'string' ? o.title.trim() : '';
		if (!title || seen.has(title.toLowerCase())) return;
		seen.add(title.toLowerCase());
		out.push({
			id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `mcp-${i}`,
			title,
			rationale: typeof o.rationale === 'string' ? o.rationale : '',
			coreKeywords: Array.isArray(o.coreKeywords)
				? o.coreKeywords
						.filter((k): k is string => typeof k === 'string')
						.map((k) => k.toLowerCase())
				: [],
			preferredCore:
				typeof o.preferredCore === 'string' && o.preferredCore.trim()
					? o.preferredCore
					: undefined
		});
	});
	return out;
}

/** The existing core a suggestion routes into (keyword match), or null. */
export function matchCore(draft: ProjectFeaturesDraft, s: FeatureSuggestion): Core | null {
	const kw = s.coreKeywords.map((k) => k.toLowerCase());
	return (
		draft.cores.find((c) => {
			const n = c.name.toLowerCase();
			return kw.some((k) => n.includes(k));
		}) ?? null
	);
}
