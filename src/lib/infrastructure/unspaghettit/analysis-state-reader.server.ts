import type { CodeAdoptionPort } from '$application/ports';
import type { AnalysisState, AnalysisStateReader } from '$application/use-cases';

/** How long one feature's analysis state is reused: the Overview reads it on every visit. */
const TTL_MS = 60_000;

/**
 * A feature's code-to-spec analysis state, read from the engine's provenance
 * (get_provenance) and kept a minute, so the project health does not ask the
 * engine once per feature on every page load.
 */
export class EngineAnalysisStateReader implements AnalysisStateReader {
	readonly #cache = new Map<string, { at: number; state: AnalysisState | null }>();
	readonly #pending = new Map<string, Promise<AnalysisState | null>>();

	constructor(
		private readonly adoption: CodeAdoptionPort,
		private readonly now: () => number = Date.now
	) {}

	async read(featureId: string): Promise<AnalysisState | null> {
		const hit = this.#cache.get(featureId);
		if (hit && this.now() - hit.at < TTL_MS) return hit.state;
		const pending = this.#pending.get(featureId);
		if (pending) return pending;
		const read = this.adoption.getProvenance(featureId).then((result) => {
			const state = analysisStateOf(result);
			this.#cache.set(featureId, { at: this.now(), state });
			return state;
		}).finally(() => {
			this.#pending.delete(featureId);
		});
		this.#pending.set(featureId, read);
		return read;
	}
}

/** The state an engine provenance answer describes; null when there is none to read. */
export function analysisStateOf(result: Awaited<ReturnType<CodeAdoptionPort['getProvenance']>>): AnalysisState | null {
	if (!result || !result.ok) return null;
	const v = result.value;
	const sources = Array.isArray(v.sources) ? v.sources.length : 0;
	const spans = typeof v.spanCount === 'number' ? v.spanCount : 0;
	return {
		started: sources > 0 || spans > 0 || (v.file !== null && v.file !== undefined),
		finalized: v.finalized === true,
		untraced: typeof v.untracedCount === 'number' ? v.untracedCount : 0
	};
}
