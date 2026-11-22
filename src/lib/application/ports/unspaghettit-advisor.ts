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

import type { SpecLanguage } from '$domain/language';
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
	/**
	 * Actions PROVEN against the code (a passing test run stamped them), out of the
	 * feature's actions. A different claim from `implemented`, which only says the
	 * code was located, so it is counted apart and never mixed into `percentage`.
	 * Absent on an engine that does not report it: unknown, not zero.
	 */
	readonly proven?: { readonly actions: number; readonly total: number };
	/** What verifies each acceptance criterion. Absent on an engine that does not report it. */
	readonly criteria?: readonly CriterionEvidenceSummary[];
}

/**
 * How one acceptance criterion stands against what is recorded to verify it:
 * `verified` (its last recorded result passed), `failing` (it failed),
 * `unverified` (something is recorded to verify it and was never run) or `none`
 * (nothing is recorded to verify it).
 */
export type CriterionEvidenceState = 'verified' | 'failing' | 'unverified' | 'none';

/**
 * What verifies one acceptance criterion and how that last went, as a newer
 * engine reads it from the repository's index (`criterion:<id>` entries).
 * Evidence for a reader, kept apart on purpose: it is never folded into
 * `percentage`, a readiness gate or a maturity stage, because a criterion is prose and the
 * result is whatever the repository last recorded, not something run here.
 */
export interface CriterionEvidenceSummary {
	readonly id: string;
	readonly title: string;
	/** The engine's one-line standing: `active`, `draft`, `superseded by <ids>`, and so on. */
	readonly standing: string;
	readonly state: CriterionEvidenceState;
	/** True when the criterion changed after its verification was last synced. */
	readonly stale: boolean;
	readonly verification?: {
		/** unit | integration | e2e | visual | measurement | manual, as the engine names it. */
		readonly kind: string;
		readonly command?: string;
		/** At most the first five: enough to find the test, never the whole list. */
		readonly files?: readonly string[];
		readonly artifacts?: readonly string[];
		readonly lastResult?: {
			readonly passed: boolean;
			readonly at: string;
			readonly summary?: string;
		};
	};
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
 * An action the search never saw firing because a bound cut it short. It says
 * nothing about the action: the state that enables it may lie past the cut. A
 * dead action is a finding; this is only what the search did not get to.
 */
export interface UnreachedAction {
	readonly surfaceId: string;
	readonly actionId: string;
	readonly actionName: string;
	/** Which bound cut the search, in the engine's words. */
	readonly reason: string;
}

/**
 * An action the search never ran because one of its inputs has no value it can
 * try. It was not explored at all, so it is neither dead nor unreached.
 */
export interface SkippedAction {
	readonly surfaceId: string;
	readonly actionId: string;
	readonly actionName: string;
	/** Which input could not be supplied, in the engine's words. */
	readonly reason: string;
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
	/**
	 * Actions a truncated search did not reach. Only an engine that tells the two
	 * apart reports it (and then fills `deadActions` on a complete search alone);
	 * absent on an older engine, whose `deadActions` must be read next to
	 * `truncated`. Never merged into `deadActions`, never a failure.
	 */
	readonly unreachedActions?: readonly UnreachedAction[];
	/**
	 * Actions the search never ran. Absent on an engine that does not send them;
	 * a search that skipped one is never complete.
	 */
	readonly skippedActions?: readonly SkippedAction[];
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
	/**
	 * `criterion` comes from engines that give acceptance criteria a standing: a
	 * criterion still active while another one supersedes it. Older engines never
	 * send it.
	 */
	readonly entityType: 'feature' | 'surface' | 'action' | 'criterion';
	/**
	 * The engine id of the entity the gap sits on (`srf-*` / `act-*` / the feature
	 * id) — carried through so an author can jump straight to it rather than reading
	 * a bare count. Empty only if the engine omitted it. (Fix #10.)
	 */
	readonly entityId: string;
	readonly entityName: string;
	readonly reason: string;
	readonly suggestedFix: string;
	/**
	 * What the gap is, stable whatever language its text is written in
	 * (`missing-scenario`, `not-implemented`, `proof:<finding kind>`...): the
	 * platform sorts gaps by it. Empty from an older engine, which is then read
	 * by its English text.
	 */
	readonly code: string;
	/** The element the gap is about (a rule, a statement, a goal), when the engine names one. */
	readonly subjectId?: string;
}

/** What the path search says about one always-true statement. Only `violated` is a gap. */
export interface SpecProofPath {
	readonly invariantId: string;
	readonly invariantName: string;
	readonly outcome: 'violated' | 'none-within-bound' | 'unsettled' | 'unsupported';
	/** For `violated`: how many steps the shortest path found takes. */
	readonly steps?: number;
	/** For `unsupported`: what the solver does not read. */
	readonly reason?: string;
}

/** What the reach search says about one action. Only `none-within-bound` is a gap, and a bounded one. */
export interface SpecProofReach {
	readonly actionId: string;
	readonly actionName: string;
	readonly outcome: 'reached' | 'none-within-bound' | 'unsettled' | 'unsupported';
	/** For `reached`: how many steps the shortest path found takes, the action's own run included. */
	readonly steps?: number;
	/** For `unsupported`: why the search does not answer. */
	readonly reason?: string;
}

/** What the reach search says about one reachability goal. Only `none-within-bound` is a gap. */
export interface SpecProofGoal {
	readonly goalId: string;
	readonly goalName: string;
	readonly outcome: SpecProofReach['outcome'];
	/** For `reached`: how many steps the shortest path found takes (0: the starting state). */
	readonly steps?: number;
	readonly reason?: string;
}

/** A situation in which an action breaks a statement, with no path from the start found: a lead, never a gap. */
export interface SpecProofLead {
	readonly actionId: string;
	readonly actionName: string;
	readonly invariantId: string;
	readonly invariantName: string;
	readonly situation: string;
	readonly pathSearch: string;
}

/**
 * The solver's answer beside the gaps: whether it ran, what it could not settle,
 * the outcome of the path search for every statement, and the leads. None of it
 * is a gap, and none of it may be dropped: "none within the bound" and
 * "unsettled" must never read as nothing at all.
 */
export interface SpecProof {
	readonly solver: 'ran' | 'unavailable';
	readonly questions: number;
	readonly unsettled: number;
	readonly reason?: string;
	readonly interrupted?: string;
	/** On a first pass: whether asking for the full proof (`complete`) may settle more of what it left open. */
	readonly moreToCome?: boolean;
	/** The rules whose every question the solver answered; one absent was not settled. */
	readonly rulesSettled?: readonly string[];
	readonly paths?: { readonly maxSteps: number; readonly results: readonly SpecProofPath[] };
	/** The reach search: whether each action can run from the start within the bound. */
	readonly actions?: { readonly maxSteps: number; readonly results: readonly SpecProofReach[] };
	/** The same search for reachability goals: whether each can be met from the start within the bound. */
	readonly goals?: { readonly maxSteps: number; readonly results: readonly SpecProofGoal[] };
	/** The search for a state no action can leave, from the start within the bound. */
	readonly deadlocks?: SpecProofDeadlocks;
	/** Every finding the solver made, as data (an engine that sends them). */
	readonly findings?: readonly SpecProofFinding[];
	readonly leads: readonly SpecProofLead[];
}

/** One step of a path the solver found from the start, replayed by the simulator. */
export interface SpecProofStep {
	readonly actionId: string;
	readonly actionName: string;
	readonly surfaceId: string;
	/** Set when the step belongs to another feature of the project. */
	readonly featureName?: string;
	readonly parameters: Readonly<Record<string, unknown>>;
}

/** One finding of the solver, with what it is about and, for a path, its steps. */
export interface SpecProofFinding {
	readonly kind: string;
	readonly severity: 'critical' | 'recommended';
	readonly detail: string;
	readonly surfaceName?: string;
	readonly actionId?: string;
	readonly actionName?: string;
	readonly ruleId?: string;
	readonly invariantId?: string;
	readonly invariantName?: string;
	readonly goalId?: string;
	readonly goalName?: string;
	readonly path?: readonly SpecProofStep[];
	/**
	 * unreachable-action, unmet-goal: each state the guard (or the goal's
	 * condition) reads that nothing moves from its start, with the actions that
	 * change it, themselves not reached (empty: nothing changes it). Criterion
	 * 39ea86c2 of feat-behavior-model.
	 */
	readonly stuck?: readonly SpecProofStuckState[];
}

/** A state that holds a target back: where it starts and what alone could move it. */
export interface SpecProofStuckState {
	readonly path: string;
	readonly startsAt: unknown;
	readonly changedBy: readonly string[];
}

/** What the dead-end search says; only `found` names a path (by action names). */
export interface SpecProofDeadlocks {
	readonly maxSteps: number;
	readonly outcome: 'found' | 'none-within-bound' | 'unsettled' | 'unsupported';
	readonly steps?: number;
	readonly path?: readonly string[];
	readonly reason?: string;
}

/* ── Step-by-step simulation (simulate_steps) ─────────────────────────── */

/** One step of a walk: an action, where it lives when known, and its inputs. */
export interface WalkStepArgs {
	readonly actionId?: string;
	readonly actionRef?: string;
	readonly surfaceId?: string;
	readonly surfaceRef?: string;
	/** Values by parameter name; `$channel` names the channel the call arrives through. */
	readonly parameters?: Record<string, unknown>;
	readonly timeAdvance?: number;
}

export interface SimulateStepsArgs {
	/** The kernel feature to walk. With `blank`, an empty feature under this id. */
	readonly featureId?: string;
	readonly blank?: boolean;
	/** apply_batch operations applied in memory before the walk; never saved. */
	readonly operations?: readonly Record<string, unknown>[];
	/** Ids an earlier answer minted over the same operations, replayed so every id comes out the same. */
	readonly mintedIds?: readonly string[];
	/** Operations from this index on are the new ones: `batch` then describes them alone. */
	readonly newOperationsFrom?: number;
	readonly steps?: readonly WalkStepArgs[];
	/** The project whose cross-feature invariants the walk enforces (an empty feature or a draft names it). */
	readonly projectId?: string;
	/** State to start from, over the declared defaults. */
	readonly snapshot?: Record<string, unknown>;
	readonly personaId?: string;
	readonly stopOnBlocked?: boolean;
	/** Run every scenario of the simulated feature. */
	readonly runScenarios?: boolean;
	/** Explore its state space, like model_check. */
	readonly modelCheck?: boolean | { readonly maxDepth?: number; readonly maxStates?: number };
	/** Return the simulated feature itself. */
	readonly includeFeature?: boolean;
	/**
	 * Ids of elements to disable for this trial only, in memory, after the
	 * operations: nothing is saved, and an id the feature does not hold refuses
	 * the trial with that id.
	 */
	readonly disable?: readonly string[];
}

/**
 * The engine's walk, relayed as it answers: `{ ok, persisted:false, featureId,
 * batch?, steps[], notRun, finalState }`, or `{ ok:false, errors }` for a batch
 * that did not validate. `refused` carries the sentence the engine wrote when it
 * could not run the walk at all (an unknown action, a missing persona).
 */
/**
 * An engine answer relayed as it came, or the sentence it refused with. The
 * project-level tools return shapes the platform does not reinterpret, so the
 * port hands them over whole rather than mapping each field.
 */
export type EngineAnswer =
	| { readonly kind: 'answer'; readonly value: Readonly<Record<string, unknown>> }
	| { readonly kind: 'refused'; readonly error: string };

/** What the engine holds for a project beyond its features. */
export interface ProjectBehavior {
	/** Invariants spanning the project's features. */
	readonly projectInvariants: readonly Readonly<Record<string, unknown>>[];
	/** The registry of core features, declared from the feature tree. */
	readonly coreFeatures: readonly Readonly<Record<string, unknown>>[];
	/** Canonical state variables, with any drift from the data field they mirror. */
	readonly stateVariables: Readonly<Record<string, unknown>>;
	/** Entities, resources and personas defined once and referenced by features. */
	readonly library: Readonly<Record<string, unknown>>;
	/**
	 * The ids of the state variables the project registered explicitly; the
	 * others in `stateVariables` are projections of feature declarations, which
	 * must be registered before a data field can be tied to them.
	 */
	readonly registeredStateIds?: readonly string[];
}

/**
 * The oracle's answer for every rule that spans a project (engine
 * `prove_project_invariants`): one verdict per rule over the whole project,
 * with its proof, the actions that would break it, who writes and reads it and
 * one sentence in the spec's language.
 */
export interface ProveProjectRulesArgs {
	readonly projectId: string;
	readonly invariantIds?: readonly string[];
	readonly maxSteps?: number;
	readonly language?: 'en' | 'fr';
	/** Only the rules the induction settles, at once, with no feature proved; the others are left out. */
	readonly quick?: boolean;
}

/** What a change to a project's rules would do, nothing saved (engine `what_if_project`). */
export interface WhatIfProjectArgs {
	readonly projectId: string;
	readonly operations: readonly Record<string, unknown>[];
	readonly maxSteps?: number;
	readonly language?: 'en' | 'fr';
}

/** What a change written in the batch vocabulary would do, proved before and after (engine `what_if`). */
export interface WhatIfArgs {
	readonly featureId: string;
	readonly operations: readonly Record<string, unknown>[];
	/** The ids a stored model was built with (an Evolution draft), replayed slot for slot. */
	readonly mintedIds?: readonly string[];
	/** The change creates the feature: it is compared with an empty one. */
	readonly blank?: boolean;
	readonly projectId?: string;
	readonly maxSteps?: number;
}

/** The engine's comparison, as it sent it (see DraftProofImpact for the stored reading). */
export type WhatIfResult =
	| { readonly kind: 'comparison'; readonly comparison: Readonly<Record<string, unknown>> }
	| { readonly kind: 'refused'; readonly error: string };

export type SimulateStepsResult =
	| { readonly kind: 'walk'; readonly walk: Readonly<Record<string, unknown>> }
	| { readonly kind: 'refused'; readonly error: string };

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
	/**
	 * Everything below is answered by newer engines only and lifted from `raw`
	 * (see `liftBehaviorBatchAnswer`): absent means the engine did not say, never
	 * "false" or "nothing changed".
	 *
	 * True when the batch named the version it was written against
	 * (`expectedUpdatedAt`) and the feature had moved on. Nothing was written.
	 */
	readonly conflict?: true;
	/** On a conflict: the version the feature is at now, to re-read and rebase on. */
	readonly currentUpdatedAt?: string;
	/** On a conflict: the elements changed since the expected version (may be capped). */
	readonly changedSince?: readonly string[];
	/** On a conflict: how many elements changed in all, when `changedSince` is capped. */
	readonly changedSinceTotal?: number;
	/** On a save: the version the batch was applied on top of. */
	readonly previousUpdatedAt?: string;
	/** On a save: the version the feature is at after the batch. */
	readonly updatedAt?: string;
	/** What the batch touches in OTHER features, relayed as the engine shaped it. */
	readonly relatedElsewhere?: unknown;
	/** The scenarios of what the batch touched, relayed as the engine shaped them. */
	readonly scenarios?: unknown;
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
	/**
	 * Each statement the exploration broke (the feature's own and the project's),
	 * once per action that breaks it, with the action path that gets there.
	 * Absent on an engine that sends no traces: unknown, not "none".
	 */
	readonly brokenStatements?: readonly BrokenStatement[];
}

export interface BrokenStatement {
	/** The statement's name as the engine holds it. */
	readonly name: string;
	/** The actions, in order, from the starting state to the break. */
	readonly path: readonly string[];
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
	/**
	 * True when the engine's verify proved the features itself: its counts then
	 * already hold the paths the solver found, so they are not added again.
	 */
	readonly solverCounted?: boolean;
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
	 * markdown), or for one of its actions when `action` names it. Null when the
	 * engine is unreachable.
	 */
	getDigest(
		featureId: string,
		action?: { readonly surfaceId: string; readonly actionId: string }
	): Promise<FeatureDigest | null>;
	/**
	 * Implementation coverage tallied from what reports and index syncs located,
	 * the same record the implementation status reads. Null when the engine is
	 * unreachable or nothing was ever reported for the feature.
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

	/**
	 * Apply project-level operations atomically (cross-feature invariants,
	 * canonical state variables, core features). Null when unreachable.
	 */
	applyProjectBatch(
		projectId: string,
		operations: readonly Record<string, unknown>[],
		dryRun: boolean
	): Promise<EngineAnswer | null>;

	/** What the engine holds for a project beyond its features. Null when unreachable. */
	readProjectBehavior(projectId: string): Promise<ProjectBehavior | null>;

	/** Every place a feature reads or writes a state path. Null when unreachable. */
	findStateReferences(featureId: string, statePath: string): Promise<EngineAnswer | null>;

	/** The TypeScript module mirroring a feature, as source. Null when unreachable. */
	generateTypesSource(featureId: string): Promise<EngineAnswer | null>;

	/**
	 * Move a feature's entity, resource or persona into the project library and
	 * collapse identical copies elsewhere into references. Null when unreachable.
	 */
	promoteToProjectLibrary(input: {
		expectedProjectId: string;
		featureId: string;
		definitionKind: 'entity' | 'resource' | 'persona';
		id: string;
		dedupe?: boolean;
	}): Promise<EngineAnswer | null>;

	/**
	 * Walk a feature step by step without saving anything (see SimulateStepsArgs).
	 * Null when the engine is unreachable.
	 */
	simulateSteps(
		args: SimulateStepsArgs,
		budget?: AdvisorCallBudget
	): Promise<SimulateStepsResult | null>;

	/**
	 * What a change would do to a feature's proofs and scenarios, nothing saved.
	 * Null when the engine is unreachable. Optional: an engine without the solver
	 * cannot answer it.
	 */
	whatIf?(args: WhatIfArgs, budget?: AdvisorCallBudget): Promise<WhatIfResult | null>;

	/**
	 * The verdict of every rule that spans the project, proved over its
	 * features. Null when the engine is unreachable; optional, since an engine
	 * without the solver cannot answer it.
	 */
	proveProjectRules?(args: ProveProjectRulesArgs, budget?: AdvisorCallBudget): Promise<EngineAnswer | null>;

	/**
	 * What adding, changing or removing a rule of the project would do to its
	 * rules, scenarios and actions, nothing saved. Null when unreachable.
	 */
	whatIfProject?(args: WhatIfProjectArgs, budget?: AdvisorCallBudget): Promise<EngineAnswer | null>;

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
	 * The same read with the solver's answer kept beside the gaps. Optional: a
	 * reader without it falls back to `getSpecGaps` and shows no proof.
	 */
	getSpecGapsAndProof?(
		featureId: string,
		budget?: AdvisorCallBudget,
		/** The spec's language: the scenarios the solver generates are named in it. */
		language?: SpecLanguage,
		/**
		 * `complete`: the full proof, the phases the first pass left open asked
		 * again (tens of seconds); otherwise the first pass, at once, with
		 * `proof.moreToCome` saying whether the full proof may settle more.
		 */
		options?: { readonly complete?: boolean }
	): Promise<{ readonly gaps: SpecGap[]; readonly proof: SpecProof | null }>;

	/**
	 * The solver on one feature's rules alone (engine `prove_feature_rules`): no
	 * path search, no scenarios, no gaps, so it settles every rule in seconds
	 * where the full proof takes a minute. Kept by the engine, by content.
	 */
	proveFeatureRules?(
		featureId: string,
		budget?: AdvisorCallBudget,
		language?: SpecLanguage
	): Promise<SpecProof | null>;

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
			/**
			 * The feature version (`updatedAt`) this batch was written against. A newer
			 * engine writes nothing and answers a conflict when the feature has moved
			 * on since. Sent to the engine only when given: an older engine has no such
			 * argument, and a caller that names no version keeps last-write-wins.
			 */
			expectedUpdatedAt?: string;
			/**
			 * Ids to mint again, slot for slot: those a simulation minted over the same
			 * operations (an Evolution draft's model), so the batch lands with the ids
			 * its later operations and scenarios name.
			 */
			mintedIds?: readonly string[];
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
