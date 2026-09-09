/**
 * A formal coherence verdict for a project, as an external formal engine
 * reports it. `engineAvailable` is false when no engine is wired (air-gapped,
 * engine down); callers then fall back to the local analysis instead of reading
 * an empty report as "perfectly coherent".
 */
export interface FormalCoherenceReport {
	readonly engineAvailable: boolean;
	readonly coherent: boolean;
	readonly inconsistencies: ReadonlyArray<{
		readonly code: string;
		/** A sentence naming the authored elements (feature, action, parameter, state). */
		readonly message: string;
		/** The state path(s) the violation concerns, when the engine could resolve them. */
		readonly nodeIds: readonly string[];
		/** Unspa id of the feature owning the offending element, when the engine resolved it. */
		readonly featureId?: string;
		/** Unspa id of the offending action, when the engine resolved it. */
		readonly actionId?: string;
		/**
		 * The parts `message` was composed from, when the engine resolved them, so
		 * the card can say the same thing in the project's own language.
		 */
		readonly featureName?: string;
		readonly actionName?: string;
		/** The parameter bound to the state, when the value comes from one. */
		readonly parameter?: string;
		/** The type the action carries. */
		readonly valueType?: string;
		/** The type the state was declared with. */
		readonly stateType?: string;
		/** How the value meets the state: `bind`, `write`, `read`, `delete`, `bus`. */
		readonly direction?: string;
		/** Names of the features declaring the state with `stateType`. */
		readonly declaringFeatures?: readonly string[];
	}>;
	/**
	 * How many mirrored features the verdict was computed over; absent from a
	 * back that predates the field. Zero means the engine proved an EMPTY model
	 * coherent, which is no proof: the panel says "nothing published" instead.
	 */
	readonly featureCount?: number;
	/**
	 * True when the back has no verdict yet for this mirror and is computing one:
	 * the other fields are placeholders, and nothing is proven until it lands.
	 */
	readonly pending?: boolean;
}

/**
 * Where a formal verdict comes from, when one exists. The open-source build
 * has none: its coherence, completion and readiness scores come from the
 * heuristic checker and the behavior engine, which need no external service.
 */
export interface FormalVerdictPort {
	/** `null` when no verdict is available. Best-effort, never throws. */
	fetchFormalCoherence(localProjectId: string): Promise<FormalCoherenceReport | null>;
}
