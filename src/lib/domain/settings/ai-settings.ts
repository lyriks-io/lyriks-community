/**
 * Settings bounded context. AI suggestions have exactly one source: the
 * operator's own LLM working through the Lyriks MCP tools, outside Lyriks.
 * The app never calls an LLM itself (no keys, no egress) — it only authorizes
 * or blocks that LLM from generating suggestions into the project. One switch,
 * app-level, not per-project.
 */
export interface AiSettings {
	/**
	 * Whether the LLM driving the Lyriks MCP is authorized to generate
	 * suggestions. Off = the suggestion write path is rejected and nothing is
	 * served to the UI.
	 */
	readonly suggestionsEnabled: boolean;
}

export function defaultAiSettings(): AiSettings {
	return { suggestionsEnabled: false };
}

/** Coerce an unknown (e.g. parsed JSON / request body) into a valid AiSettings. */
export function normalizeAiSettings(input: unknown): AiSettings {
	if (!input || typeof input !== 'object') return defaultAiSettings();
	const o = input as Record<string, unknown>;
	if (typeof o.suggestionsEnabled === 'boolean') {
		return { suggestionsEnabled: o.suggestionsEnabled };
	}
	// Legacy document (provider/BYOK era): anyone who had pointed suggestions at
	// an LLM stays authorized; the old 'offline' heuristic maps to blocked.
	if (typeof o.provider === 'string') {
		return { suggestionsEnabled: o.provider !== 'offline' };
	}
	return defaultAiSettings();
}
