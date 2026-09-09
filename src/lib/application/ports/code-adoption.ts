/**
 * Code → spec: turn an existing codebase into a verified behavior model.
 *
 * The forward direction (spec → code) is served by {@link UnspaghettitAdvisorPort}.
 * This is the reverse: attach the source files an agent read, trace every modeled
 * element back to the exact span it came from, refuse to finalize until nothing
 * was invented, then seed the spec↔code map so implementation coverage is
 * non-zero from day one and drift detection is armed.
 *
 * ## Who holds what
 *
 * The agent holds the **filesystem** (it reads the code and owns `.unspa.json`
 * in the checkout); the platform holds the **spec** (the kernel store). Nothing
 * here reads a path on the server — the deliberate exception the engine offers
 * (`attach_source_path`) is NOT exposed, because a caller-supplied path resolved
 * server-side is an arbitrary-file-read primitive in a multi-tenant appliance.
 * Callers push content, and pay the token cost.
 *
 * That split is also why the index-side methods take the index as a payload:
 * there is no customer checkout inside the container to read it from.
 *
 * MAP-critical: every method answers `null` when the engine is absent, exactly
 * like the advisor. Adoption is an optional capability layered over the kernel,
 * never required to run the platform.
 */

/**
 * One engine answer.
 *
 * `null` means the engine is unreachable (the caller should report 503). Otherwise
 * a refusal is data, not an exception: `finalize_analysis` naming the untraced
 * elements IS the answer the agent must act on, so it must survive to the caller
 * instead of being flattened into a null the way advisory reads are.
 */
export type AdoptionResult =
	| { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
	| { readonly ok: false; readonly error: string };

/**
 * The engine's payloads are relayed verbatim rather than re-typed.
 *
 * Nothing in the platform's UI consumes them — they travel straight back out
 * through the authenticated MCP to an LLM, which reads the engine's own
 * vocabulary (`hints[]`, `healed`, `orphans`, `skipped`, per-entry reasons).
 * Re-typing here would be speculative, lossy on every engine release, and would
 * buy no compile-time safety for a consumer that is a language model. Inputs ARE
 * typed, because those are ours to get wrong.
 */
export type EnginePayload = Readonly<Record<string, unknown>>;

/** A source document the agent read and is attaching as evidence. */
export interface AttachSourceInput {
	readonly featureId: string;
	/** Repo-relative path for `kind: 'code'` (e.g. `src/lib/cart.ts`) — spans seed the index from it. */
	readonly fileName: string;
	readonly content: string;
	/** `code` when adopting an implementation file; `file` for a document that happens to live in the repo. */
	readonly kind?: 'file' | 'code';
	/** Ranks the source so a later contradiction resolves by authority, not ingestion order. */
	readonly authority?: string;
	readonly artifact?: string;
	readonly maxBytes?: number;
}

/** One modeled element pinned to the character span it was extracted from. */
export interface ElementSpanInput {
	readonly elementId: string;
	readonly startOffset: number;
	/** End offset, exclusive. */
	readonly endOffset: number;
	readonly sourceId?: string;
}

/** A span the agent proposes to model but has not turned into an element yet. */
export interface CandidateSpanInput {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly summary: string;
	readonly sourceId?: string;
	readonly kind?: string;
	readonly confidence?: number;
}

export interface DisposeCandidateInput {
	readonly featureId: string;
	readonly candidateId: string;
	readonly disposition?: string;
	readonly rationale?: string;
	/** The element the candidate became, when it was modeled rather than dropped. */
	readonly elementId?: string;
}

export interface FlagConflictInput {
	readonly featureId: string;
	readonly summary: string;
	readonly statements?: readonly { readonly sourceId: string; readonly statement: string }[];
	readonly affectedElements?: readonly string[];
}

export interface ResolveConflictInput {
	readonly featureId: string;
	readonly conflictId: string;
	readonly status: 'resolved' | 'accepted_ambiguity';
	readonly resolution: string;
	readonly resolvedInFavorOf?: string;
}

/** Where one spec entity lives in the code, as the agent found it. */
export interface FoundEntityInput {
	readonly entityType: string;
	readonly entityId: string;
	readonly locations: readonly {
		readonly file: string;
		readonly line?: number;
		readonly snippet?: string;
	}[];
	readonly capturedFields?: unknown;
}

export interface ReportImplementationInput {
	readonly featureId: string;
	readonly actionId?: string;
	readonly surfaceId?: string;
	readonly foundEntities: readonly FoundEntityInput[];
}

/**
 * The spec↔code map, exactly as it lives under `index` in the repo's
 * `.unspa.json`. Keyed `"<type>:<id-or-path>"` — `action:<id>`, `surface:<id>`,
 * `state:<dotted.path>`, `rule:<id>`, … — with `{status, file, line, signature}`
 * and audit stamps. Opaque here: the engine owns its shape and resolves the ids
 * against the spec itself.
 */
export type BehavioralIndexPayload = Readonly<Record<string, unknown>>;

export interface CodeAdoptionPort {
	/** False when the engine subprocess is unreachable; every method then answers null. */
	readonly available: boolean;

	// ───────── Sources: the evidence an agent attaches ─────────

	/** Store a file the agent read as project-level evidence. Identical content is deduplicated. */
	attachSource(input: AttachSourceInput): Promise<AdoptionResult | null>;
	listSources(projectId: string): Promise<AdoptionResult | null>;
	getSource(
		sourceId: string,
		opts?: { readonly offset?: number; readonly maxChars?: number }
	): Promise<AdoptionResult | null>;
	classifySource(
		sourceId: string,
		classification: Readonly<Record<string, unknown>>
	): Promise<AdoptionResult | null>;
	removeSource(sourceId: string): Promise<AdoptionResult | null>;

	// ───────── Analysis: tracing the model back to the evidence ─────────

	/** Pin many modeled elements to their spans in one call — the cost driver of adoption. */
	recordElementSpans(
		featureId: string,
		spans: readonly ElementSpanInput[],
		sourceId?: string
	): Promise<AdoptionResult | null>;
	stageCandidates(
		featureId: string,
		candidates: readonly CandidateSpanInput[],
		sourceId?: string
	): Promise<AdoptionResult | null>;
	disposeCandidate(input: DisposeCandidateInput): Promise<AdoptionResult | null>;
	flagConflict(input: FlagConflictInput): Promise<AdoptionResult | null>;
	resolveConflict(input: ResolveConflictInput): Promise<AdoptionResult | null>;
	/** The gate: refuses while any element is untraced, so nothing enters the spec uninvented. */
	finalizeAnalysis(featureId: string): Promise<AdoptionResult | null>;
	resetAnalysis(featureId: string): Promise<AdoptionResult | null>;
	getProvenance(featureId: string): Promise<AdoptionResult | null>;
	getSourceCoverage(featureId: string, sourceId?: string): Promise<AdoptionResult | null>;

	// ───────── Implementation index: the spec↔code map ─────────

	/**
	 * Turn a finalized analysis into index entries — ALWAYS a preview. The
	 * engine would otherwise write `.unspa.json` next to itself, which inside the
	 * container is the wrong filesystem; the caller writes the returned entries
	 * into its own checkout.
	 */
	seedIndexFromAnalysis(
		featureId: string,
		opts?: { readonly overwrite?: boolean }
	): Promise<AdoptionResult | null>;
	/** Push a full coverage report for a project from the index the caller holds. */
	syncImplementationIndex(
		projectId: string,
		index: BehavioralIndexPayload
	): Promise<AdoptionResult | null>;
	reportImplementationStatus(input: ReportImplementationInput): Promise<AdoptionResult | null>;
	reportImplementationStatusBatch(
		featureId: string,
		entries: readonly Omit<ReportImplementationInput, 'featureId'>[]
	): Promise<AdoptionResult | null>;
	getImplementationStatus(
		featureId: string,
		opts?: Readonly<Record<string, unknown>>
	): Promise<AdoptionResult | null>;
	getBehavioralIndex(
		projectId: string,
		index: BehavioralIndexPayload,
		filters?: Readonly<Record<string, unknown>>
	): Promise<AdoptionResult | null>;
	getImplementationGaps(
		featureId: string,
		projectId: string,
		index: BehavioralIndexPayload
	): Promise<AdoptionResult | null>;
	/**
	 * Full spec-drift report against the caller's index, scoped to one project
	 * (or one feature within it).
	 *
	 * Distinct from {@link UnspaghettitAdvisorPort.getDrift}, which folds the same
	 * engine call into three counts for the in-app advisories. This one relays
	 * `stale` / `unversioned` / `orphans` entry-by-entry, because the agent has to
	 * act on each one.
	 *
	 * `projectId` is mandatory here and not merely a filter: it is the scope, and
	 * the engine's unscoped fallback spans the whole store.
	 */
	getImplementationDrift(
		projectId: string,
		index: BehavioralIndexPayload,
		featureId?: string
	): Promise<AdoptionResult | null>;
}
