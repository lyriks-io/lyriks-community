/**
 * Outbound port for the Unspaghettit engine. The engine is the source of truth
 * for project / feature behavioral topology — v3 routes writes through it
 * (`save_feature`, `replace_project`) so the kernel validates every change,
 * then asks it value-add questions (score, gaps, summary) on the read side.
 *
 * PostgreSQL holds Lyriks-owned project state; Unspa holds the behavior graph.
 *
 * v0 adapter spawns the OSS `unspa-mcp` subprocess; calls flow over an MCP
 * stdio transport. When the engine is unreachable, callers fall back to the
 * `BehaviorRepositoryPort` (direct filesystem) so the wizard stays offline-
 * usable. Future swap: in-process library, remote MCP, or Rust kernel.
 */

import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

export interface FeatureScore {
	readonly score: number;
	readonly maxScore: number;
	readonly percentage: number;
	readonly criticalCount: number;
	readonly recommendedCount: number;
}

/**
 * The engine's actionable maturity report. Its vocabulary grows as Unspa adds
 * checks, so the platform deliberately preserves the complete JSON object
 * instead of narrowing away issue details, confidence dimensions or filters.
 */
export type BehaviorMaturityReport = Readonly<Record<string, unknown>>;

export interface FeatureGap {
	readonly type: string;
	readonly name: string;
	readonly reason: string;
}

/**
 * Implementation coverage tally for a feature — how many spec entities
 * (surfaces / actions / states / events) are mapped to real code in the
 * behavioral index. 0/total for a spec no one has implemented yet, climbing as
 * `report_implementation_status` records land. `partial` counts as unimplemented
 * in `percentage` so the bar only fills on fully-covered entities.
 */
export interface ImplementationCoverage {
	readonly total: number;
	readonly implemented: number;
	readonly partial: number;
	readonly missing: number;
	/** implemented / total, 0–100. */
	readonly percentage: number;
}

/**
 * The dashboard's plain-language behavior digest — the "what happens here"
 * prose Unspaghettit derives from the model (each action's intent, its guards,
 * effects/events, invariant messages). Never generated, so it can only describe
 * behavior that is actually in the spec. `hasContent` is false for an empty
 * shell. `markdown` is rendered read-only in the leaf drawer.
 */
export interface FeatureDigest {
	readonly hasContent: boolean;
	readonly markdown: string;
}

/**
 * Engine-side index of a feature — what it actually contains as seen by
 * Unspaghettit. Returned by `getFeatureSummary` via `get_feature` (non-verbose).
 * Honest signal of how much behavior the feature carries: 0/0 for fresh
 * shells, growing as Step 05+ adds surfaces and actions.
 */
export interface FeatureSummary {
	readonly id: string;
	readonly name: string;
	readonly surfaceCount: number;
	readonly actionCount: number;
	readonly stateCount: number;
	readonly entityCount: number;
	readonly eventCount: number;
	readonly personaCount: number;
}

/**
 * The named behavior a feature actually carries, as the engine sees it — the
 * human-readable companion to `FeatureSummary`'s counts. Used by the leaf
 * drawer to show "what's inside" (surfaces / actions / scenarios) read-only;
 * authoring still happens in the Unspa dashboard.
 */
export interface FeatureBehavior {
	readonly surfaces: readonly string[];
	readonly actions: readonly string[];
	readonly scenarios: readonly string[];
	readonly events: readonly string[];
	readonly personas: readonly string[];
}

/* ── Scenario execution (run_all_scenarios) ────────────────────────────── */

/** One Given/When/Then assertion's outcome against the post-simulation state. */
export interface ScenarioAssertionResult {
	readonly path: string;
	/** Whether it held; `null` when skipped (action blocked before effects ran). */
	readonly held: boolean | null;
	readonly skipped: boolean;
	readonly description: string | null;
}

/** Result of executing one authored scenario through the deterministic simulator. */
export interface ScenarioResult {
	readonly scenarioId: string;
	readonly scenarioName: string;
	readonly actionName: string;
	readonly personaName: string | null;
	readonly pass: boolean;
	readonly actualStatus: 'success' | 'blocked';
	readonly expectedStatus: 'success' | 'blocked' | null;
	/** One-line CI-grade summary (why it passed / failed). */
	readonly summary: string;
	readonly assertions: readonly ScenarioAssertionResult[];
}

/** Aggregate of every scenario run for one feature — a spec-test suite result. */
export interface ScenarioReport {
	readonly featureId: string;
	readonly featureName: string;
	readonly total: number;
	readonly passed: number;
	readonly failed: number;
	readonly results: readonly ScenarioResult[];
}

/* ── Bounded model checking (model_check) ──────────────────────────────── */

/** An invariant that breaks in a reachable state, with the shortest path to it. */
export interface InvariantCounterexample {
	readonly invariantName: string;
	readonly actionName: string;
	/** Shortest sequence of action names that reaches the violating state. */
	readonly path: readonly string[];
}

/** A surface (screen) referenced by id + display name. */
export interface NamedSurface {
	readonly surfaceId: string;
	readonly surfaceName: string;
}

/**
 * Bounded exhaustive verification of the reachable state space, paired with the
 * static navigation-graph analysis. Findings are "within bounds" when
 * `truncated` is true.
 */
export interface ModelCheckReport {
	readonly statesExplored: number;
	readonly truncated: boolean;
	readonly invariantViolations: readonly InvariantCounterexample[];
	/** Action names never observed firing within the bound (dead branches). */
	readonly deadActions: readonly string[];
	/** Reachable states from which no action can fire (potential soft-locks). */
	readonly deadlockStates: number;
	/** Screens a user can never navigate to (static nav-graph analysis). */
	readonly unreachableSurfaces: readonly NamedSurface[];
	/** Screens with no way out. */
	readonly terminalSurfaces: readonly NamedSurface[];
}

/* ── Spec-depth gaps (get_spec_gaps) ───────────────────────────────────── */

/** A prioritized spec-completeness gap grounded in an existing entity. */
export interface SpecGap {
	readonly severity: 'critical' | 'recommended';
	readonly entityType: 'feature' | 'surface' | 'action';
	/**
	 * The engine id of the entity the gap sits on (`srf-*` / `act-*` / the feature
	 * id) — carried through so an author can jump straight to it rather than reading
	 * a bare count. Empty only if the engine omitted it. (Fix #10.)
	 */
	readonly entityId: string;
	readonly entityName: string;
	readonly reason: string;
	readonly suggestedFix: string;
}

/* ── Action simulation (dry_run_simulate) ──────────────────────────────── */

export interface SimulateArgs {
	readonly featureId: string;
	readonly surfaceId: string;
	readonly actionId: string;
	/** Initial state snapshot keyed by dotted path; defaults applied when omitted. */
	readonly snapshot?: Record<string, unknown>;
	readonly parameters?: Record<string, unknown>;
}

export interface SimulationResult {
	readonly status: 'success' | 'blocked';
	/** Live state after effects ran (unchanged on a blocked run). */
	readonly nextState: Record<string, unknown>;
	/** Surface the action transitioned to, if any. */
	readonly transition: string | null;
	/** Human-readable reasons the action was blocked (rules / invariants / params). */
	readonly blockedReasons: readonly string[];
}

/* ── Behavior authoring (apply_batch) — Fix #1: depth writes under auth ─── */

/**
 * The outcome of applying a batch of Unspaghettit ops to one feature. Mirrors the
 * engine's `apply_batch` summary but normalized: `null` from the port means the
 * engine is UNREACHABLE, whereas a returned value with `ok:false` means the batch
 * was REJECTED (validation) — the caller must distinguish the two.
 */
export interface BehaviorBatchResult {
	/** True only when the engine accepted (and, unless dryRun, saved) the batch. */
	readonly ok: boolean;
	/** Whether this was a validate-only run (no save). */
	readonly dryRun: boolean;
	/** How many ops the engine applied. */
	readonly appliedCount: number;
	/** `ref` → minted id, for add ops that captured a `ref` (empty on dryRun/failure). */
	readonly refs: Readonly<Record<string, string>>;
	/** Validation / rejection messages when `ok` is false (empty on success). */
	readonly errors: readonly string[];
	/** Structural maturity % after the batch, when the engine reported it. */
	readonly maturityPercentage: number | null;
	/**
	 * On a valid `dryRun`, the engine's single-use token (5-min TTL) that commits
	 * this exact batch without resending the ops — pass it back as `opts.commit`.
	 * Null on failure, on a non-dry run, and when the engine didn't mint one.
	 */
	readonly commitToken: string | null;
	/** The engine's own slim summary verbatim, for a caller that wants the detail. */
	readonly raw: unknown;
}

/* ── Id bridge (get_behavior_context) — Fix #2: wizard id → kernel id ───── */

/**
 * The resolved kernel address of a wizard entity plus a compact connectivity
 * snapshot — so an author never hand-translates `journey-triage → srf-journey-triage`
 * or `step-tri-3 → act-step-tri-3`. `found` is true only when the engine confirms
 * the entity exists; `depth` is null when the engine is unreachable.
 */
export interface BehaviorContext {
	readonly featureId: string;
	/** The neighborhood root key that was resolved, e.g. `action:act-step-tri-3`. */
	readonly rootKey: string;
	readonly found: boolean;
	readonly kind: 'surface' | 'action' | 'unknown';
	/** The surface the entity lives on (itself, for a surface root). */
	readonly surfaceId: string | null;
	readonly surfaceName: string | null;
	/** The action id, for an action root. */
	readonly actionId: string | null;
	readonly name: string | null;
	/** What the entity touches — null when the engine is unreachable. */
	readonly depth: {
		readonly statesWritten: number;
		readonly statesRead: number;
		readonly eventsEmitted: number;
		readonly transitions: number;
		/** Contained actions (for a surface root). */
		readonly actions: number;
	} | null;
}

/* ── Gated verdict (verify) — the in-chat form of `unspa check` ─────────── */

export interface FeatureVerdict {
	readonly featureId: string;
	readonly featureName: string;
	readonly passed: boolean;
}

export interface VerificationVerdict {
	readonly passed: boolean;
	readonly featuresChecked: number;
	readonly featuresPassed: number;
	readonly featuresFailed: number;
	readonly scenariosRun: number;
	readonly scenariosFailed: number;
	readonly invariantViolations: number;
	readonly features: readonly FeatureVerdict[];
}

/* ── Spec→code drift (get_drift) ───────────────────────────────────────── */

export interface DriftReport {
	/** Implementations audited against an older spec than the one on disk. */
	readonly stale: number;
	/** Audited but never spec-version-stamped, so drift can't be judged. */
	readonly unversioned: number;
	/** Index keys that no longer resolve to any spec entity. */
	readonly orphans: number;
}

/* ── Implementation queue (enqueue / get_next_queued / …) ──────────────── */

export interface QueueItemView {
	readonly id: string;
	readonly kind: 'feature' | 'surface' | 'action';
	readonly featureId: string;
	readonly featureName: string;
	readonly label: string;
	readonly goal: string | null;
}

export type QueueKind = 'feature' | 'surface' | 'action';

/**
 * How long a caller is willing to wait for ONE engine read. Omitted leaves the
 * adapter's own default in place. A read that overruns is not merely dropped:
 * the engine computes synchronously, so the adapter also drops the subprocess,
 * which is the only thing that stops an abandoned computation from holding a
 * core (and starving every later read behind it).
 */
export interface AdvisorCallBudget {
	timeoutMs?: number;
}

export interface UnspaghettitAdvisorPort {
	/** Whether the engine is reachable (subprocess running). */
	readonly available: boolean;

	// ───────── Reads ─────────
	scoreFeature(featureId: string, budget?: AdvisorCallBudget): Promise<FeatureScore | null>;
	/** Detailed maturity report, optionally narrowed to one area/entity class. */
	scoreFeatureDetailed(
		featureId: string,
		opts?: {
			includeIssues?: boolean;
			surfaceId?: string;
			area?: string;
			severity?: 'critical' | 'recommended';
		}
	): Promise<BehaviorMaturityReport | null>;
	/** The authoritative apply_batch operation reference exposed by the engine. */
	getOperationsReference(): Promise<string | null>;
	/** One operation schema (or the known-kind index) from describe_operations. */
	describeOperations(kind?: string): Promise<Readonly<Record<string, unknown>> | null>;
	findFeatureGaps(featureId: string): Promise<FeatureGap[]>;
	/** Returns null when the engine can't find the feature; never throws. */
	getFeatureSummary(featureId: string): Promise<FeatureSummary | null>;
	/** Named surfaces/actions/scenarios for one feature (verbose read). */
	getFeatureBehavior(featureId: string): Promise<FeatureBehavior | null>;
	/**
	 * The dashboard's plain-language behavior digest for a feature (model-derived
	 * markdown). Null when the engine is unreachable.
	 */
	getDigest(featureId: string): Promise<FeatureDigest | null>;
	/**
	 * Implementation coverage tally from the behavioral index. Null when the
	 * engine is unreachable.
	 */
	getImplementationCoverage(featureId: string): Promise<ImplementationCoverage | null>;

	// ───────── Verification & simulation (the executable-spec spine) ─────────
	/**
	 * Execute every authored scenario through the deterministic simulator and
	 * assert each against its expected status + assertions. Optionally scope to
	 * one surface or action. Returns null when the engine is unreachable.
	 */
	runScenarios(
		featureId: string,
		scope?: { surfaceId?: string; actionId?: string },
		budget?: AdvisorCallBudget
	): Promise<ScenarioReport | null>;

	/**
	 * Bounded exhaustive verification of the reachable state space + static
	 * navigation reachability. Returns null when the engine is unreachable.
	 */
	modelCheck(
		featureId: string,
		opts?: { maxDepth?: number; maxStates?: number } & AdvisorCallBudget
	): Promise<ModelCheckReport | null>;

	/** Run one action against a state snapshot (pure). Null when unreachable. */
	simulateAction(args: SimulateArgs): Promise<SimulationResult | null>;

	/**
	 * Fold the whole verification spine (scenarios + maturity + reachability +
	 * drift, optionally model checking) into a gated verdict. Scope to one
	 * feature, else the linked project / all. Null when unreachable.
	 */
	verify(
		featureId?: string,
		opts?: { modelCheck?: boolean; minMaturity?: number } & AdvisorCallBudget
	): Promise<VerificationVerdict | null>;

	/** Prioritized spec-completeness gaps for a feature. Empty when unreachable. */
	getSpecGaps(featureId: string, budget?: AdvisorCallBudget): Promise<SpecGap[]>;

	/**
	 * Resolve one entity's neighborhood into its kernel address + a connectivity
	 * tally (the id-bridge read — Fix #2). `rootKey` is `action:<id>` | `surface:<id>`
	 * | `state:<path>` | `event:<name>` | `feature:<id>`. Null when unreachable.
	 */
	getBehaviorContext(featureId: string, rootKey: string): Promise<BehaviorContext | null>;

	// ───────── Authoring (the write path — Fix #1) ─────────
	/**
	 * Author behavior depth: apply a batch of Unspaghettit ops to one feature in a
	 * single atomic load+validate+save (`dryRun` validates without saving). This is
	 * the write half that lets an authenticated surface (the Lyriks MCP) fold in the
	 * full unspa vocabulary instead of leaving for the standalone engine. Returns
	 * `null` only when the engine is unreachable; a rejected batch comes back with
	 * `ok:false` and `errors`.
	 *
	 * `opts.commit` commits a batch previously validated with `dryRun` by its
	 * `commitToken` — the engine replays the cached ops against the current feature
	 * (never a blind save), so `operations` may be empty. A stale/expired/unknown
	 * token comes back as `ok:false` (single-use, 5-min TTL); on the commit path
	 * `dryRun` is ignored.
	 */
	applyBehaviorBatch(
		featureId: string,
		operations: readonly Record<string, unknown>[],
		opts?: {
			dryRun?: boolean;
			commit?: string;
			/**
			 * Ask the engine for the FULL per-issue verification report (under
			 * `raw.maturity`) instead of aggregate counts only — so a dry run can name
			 * the exact issues to fix, not just `issuesByArea` tallies.
			 */
			verbose?: boolean;
		}
	): Promise<BehaviorBatchResult | null>;

	/** Spec→code drift across a feature / the linked project. Null when unreachable. */
	getDrift(featureId?: string): Promise<DriftReport | null>;

	// ───────── Codegen & implementation queue ─────────
	/**
	 * Generate the TypeScript contract module for a feature (state types, event
	 * names, action parameter shapes) at `outputPath`. Returns the written path,
	 * or null when unreachable / rejected.
	 */
	generateTypes(featureId: string, outputPath: string): Promise<string | null>;

	/** The next live "implement next" queue item, or null when empty/unreachable. */
	getNextQueued(projectId?: string): Promise<QueueItemView | null>;

	/** The project's implement-next queue, in order. Empty when unreachable. */
	listQueue(projectId?: string): Promise<QueueItemView[]>;

	/**
	 * Add a feature / surface / action to a project's implement-next queue.
	 * Returns true when accepted (or already queued).
	 */
	enqueue(
		projectId: string,
		item: { kind: QueueKind; featureId: string; surfaceId?: string; actionId?: string; note?: string }
	): Promise<boolean>;

	/**
	 * Reconcile the `.unspa.json` behavioral index against the spec so the
	 * dashboard / coverage see freshly-recorded implementations. No-op when
	 * unreachable.
	 */
	syncFromIndex(): Promise<boolean>;

	// ───────── Writes ─────────
	/**
	 * Full-overwrite a Feature shell through the kernel's `save_feature`
	 * (validated server-side). Returns false when the engine is unreachable so
	 * the caller can fall back to direct FS write.
	 */
	saveFeatureShell(snapshot: UnspaFeatureSnapshot): Promise<boolean>;

	/**
	 * Full-overwrite a Project shell through the kernel's `replace_project`.
	 * Returns:
	 *   - 'replaced' when the engine accepted the write
	 *   - 'not-found' when the engine couldn't find the project (caller should
	 *      bootstrap it on the filesystem first, then retry on next sync)
	 *   - 'unavailable' when the engine is unreachable
	 * Never throws.
	 */
	replaceProject(snapshot: UnspaProjectSnapshot): Promise<'replaced' | 'not-found' | 'unavailable'>;
}
