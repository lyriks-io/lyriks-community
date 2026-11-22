import { DEFAULT_THRESHOLD, type ArtifactKind, type GapSeverity } from './enums';

/* ── Live analysis (recomputed, never persisted) ──────────────────────── */

/** One readiness dimension, derived from a source step. */
export interface Dimension {
	key: string;
	label: string;
	sourceStep: string; // wizard step id, e.g. 'data'
	score: number; // 0-100
	summary: string;
}

/** An auto-detected gap linking back to the step where it must be fixed. */
export type GapKind =
	| 'dangling'
	| 'duplicate'
	| 'orphan'
	| 'missing'
	| 'misalignment'
	| 'step-without-action';

/**
 * Who says so. The provenance a card shows for a gap: the kind of authority
 * behind it, so a decision an agent DECLARED in the spec is never dressed up as
 * a detector's finding, nor a heuristic as a proof.
 *   declared = written into the spec by a person or an agent (rules.issues)
 *   detected = a deterministic cross-section check
 *   proven   = the formal DPO engine (machine-guaranteed)
 *   reviewed = the AI consistency review (best-effort)
 *   behavior = the unspa model-check (best-effort, advisory)
 */
export type GapProvenance = 'declared' | 'detected' | 'proven' | 'reviewed' | 'behavior';

export interface Gap {
	id: string;
	severity: GapSeverity;
	title: string;
	detail: string;
	sourceStep: string;
	blocking: boolean;
	/** Explicit semantic class; inference remains only for legacy/engine gaps. */
	kind?: GapKind;
	/**
	 * The precise class in the reader's words ("Missing rule", "Type
	 * incompatibility", "Feature with no user right"). The coarse `kind` groups;
	 * this one names. Absent ⇒ the kind's generic label.
	 */
	kindLabel?: string;
	/**
	 * What a point of this kind means, in a sentence or two, for the emitter
	 * that knows it better than the check catalogue does (the behavior engine's
	 * Dead end, Broken...): What Lyriks noticed shows it on its type's hover.
	 */
	kindMeaning?: string;
	/** Who says so (see GapProvenance). Absent ⇒ derived from the emitting tier. */
	provenance?: GapProvenance;
	/** The element this is about (a feature, a role, a table), when known. */
	subject?: string;
	/**
	 * The one thing to do, as a verb phrase ("Grant it to a role in the access
	 * matrix"). Distinct from `detail`, which explains WHY. Absent ⇒ the card
	 * falls back to the detail, as it always did.
	 */
	action?: string;
	/** Catalogue key of the check that produced it (see checks.ts), when any. */
	checkId?: string;
	/**
	 * Optional query/hash suffix appended to the source step's route so "Fix now"
	 * deep-links to the exact spot (e.g. `?tab=screens&screen=<id>&node=<id>`),
	 * instead of just landing on the step. Empty/absent ⇒ plain step route.
	 */
	fixAnchor?: string;
	/**
	 * Optional feature id this gap belongs to. When set (e.g. per-feature behavior
	 * advisories), the knowledge graph hangs the gap off that feature node instead
	 * of the project root, so the flag sits on the thing it's about.
	 */
	featureRef?: string;
	/**
	 * A proof that reads as a scenario (Given, When each step, Then what no
	 * longer holds), when a solver proved the finding. Shown as is: it is the
	 * finding's evidence, not an explanation to fold away.
	 */
	proof?: GapProof;
	/**
	 * What the gap stems from, when several gaps share one root (one rule broken
	 * in several features): gaps of one cause weigh once in the score.
	 */
	cause?: string;
	/**
	 * Why the gap costs nothing although it is listed: `unverified`, the engine
	 * could not reach it within its exploration bound (absence of evidence, never
	 * proof of a fault); `consequence`, it follows from a cause already counted on
	 * the same feature (its scenarios fail because a rule breaks from the start).
	 */
	weighs?: 'unverified' | 'consequence';
	/**
	 * For an item an author declared: `defect`, what the product does wrong (an
	 * unhandled case, a contradiction); `question`, a decision still to take.
	 * A defect weighs more than a question, both less than a detection.
	 */
	nature?: 'defect' | 'question';
	/**
	 * An issue of the rules register whose fix is written and waits for someone
	 * to confirm it (status In review): Project health lists it apart under Fix
	 * to confirm and weighs nothing on it, while the coherence reading and the
	 * completion gate still count it as unsettled (criterion 2a55c3e7).
	 */
	fixToConfirm?: true;
}

export interface GapProof {
	readonly given: string;
	readonly when: readonly string[];
	readonly then: string;
}

/**
 * Why the formal (DPO) layer did or did not contribute to an analysis.
 *
 * Without this, an unreachable engine and a formally-clean project produce the
 * SAME screen — no `formal` dimension, no violations — and silence reads as
 * proof. The status makes the distinction explicit so the guarantee can never
 * be over-claimed:
 *
 *   • `not-entitled` — Enterprise-only capability, never called on this tier.
 *   • `unreachable`  — called, but the back/engine did not answer (down, wrong
 *                      URL, transport error). Nothing was checked.
 *   • `not-wired`    — the back answered with no DPO engine behind it.
 *   • `no-model`     — the engine answered, but this project has NO committed
 *                      graph, so "coherent" is a verdict over nothing. It earns
 *                      no formal dimension: a free 100 for a project the engine
 *                      never saw would inflate readiness with an empty proof.
 *   • `active`       — a real engine verdict over a real graph.
 */
export type FormalEngineStatus =
	| 'not-entitled'
	| 'unreachable'
	| 'not-wired'
	| 'no-model'
	/** The engine is computing its first verdict over this mirror; nothing is proven yet. */
	| 'pending'
	| 'active';

/**
 * The live picture, recomputed from Steps 01-08 (and later the Rust DPO
 * engine). Never persisted — produced by the GlobalCoherenceChecker on load /
 * re-check.
 */
export interface CoherenceAnalysis {
	dimensions: Dimension[];
	gaps: Gap[];
	readinessScore: number;
	/** Most recent save across ALL of the project's section drafts — the true
	 *  "last activity", so a portfolio card doesn't stay pinned to the Step-01 time
	 *  while later sections are edited. Null when nothing has been saved yet. */
	lastActivityAt?: string | null;
	/**
	 * Per-leaf behavioral maturity (feature id → 0-100) — the scores the maturity
	 * dimension averages. Kept so downstream views can re-aggregate maturity along
	 * other axes (per core feature, per release) without re-reading every kernel
	 * shell. Empty when the project has no leaf features.
	 */
	featureMaturity?: Record<string, number>;
	/**
	 * Whether the formal (DPO) layer actually ran — so the UI states the
	 * guarantee it really has instead of inferring "clean" from a missing
	 * `formal` dimension. Absent on analyses produced without the engine overlay
	 * (the local checker alone); read it as `not-entitled`.
	 */
	formalEngine?: FormalEngineStatus;
	/**
	 * The formal engine is still proving the specification as it stands: the
	 * analysis carries no verdict yet, or the previous one (Enterprise).
	 */
	formalProving?: boolean;
	/**
	 * Catalogue ids of the checks that actually RAN for this analysis (see
	 * checks.ts). A check that ran and emitted no gap passed; a check absent from
	 * this list was not run (engine offline, tier not entitled) and proves
	 * nothing. Absent on analyses produced before the catalogue existed.
	 */
	checksRun?: string[];
	/**
	 * Features the behaviour engine has not checked yet in this reading (its
	 * pass was capped): what it has not read proves nothing either way, so the
	 * completion gate cannot conclude on them (ac-leaf-ac-score-completion-unchecked).
	 * Absent when the engine reached every feature, or did not run.
	 */
	behaviorUnchecked?: number;
	/**
	 * Gaps a person settled with a traced decision (risk accepted, will not fix).
	 * They are OUT of `gaps`, so every score reads them as resolved, and IN here so
	 * the panel can still show them with who decided and why. See decisions.ts.
	 */
	settled?: SettledGap[];
}

/** A gap taken out of the open list by a decision, kept with its trace. */
export interface SettledGap {
	gap: Gap;
	decision: GapDecision;
}

/**
 * What a person decided about a gap. Append-only: a reopen SUPERSEDES the
 * decision instead of deleting it, so the trace of "who accepted this risk and
 * why" survives the change of mind.
 *   accepted_risk = the gap stays as is, knowingly, and the risk is owned.
 *   by_design     = the finding is correct and deliberate: nothing is at risk.
 *   wont_fix      = the finding is not worth fixing in this product.
 *   reopened      = a previous decision no longer stands.
 *
 * `by_design` exists because the other three all say something is wrong. A
 * faithful transcription gap, a screen unreachable because it is not a page, an
 * edge the product settled on purpose: filing those as an accepted risk asserts
 * a danger that is not there. Offered only that, an honest author leaves the
 * gap open instead, and the register fills with things already decided, which
 * is precisely how a coherence reading stops meaning anything.
 */
export type GapDecisionStatus = 'accepted_risk' | 'by_design' | 'wont_fix' | 'reopened';

export interface GapDecision {
	readonly id: string;
	gapId: string;
	status: GapDecisionStatus;
	reason: string;
	/** Who decided: the account email, or 'local' on an install without accounts. */
	authorId: string;
	/** A decision belongs to a person; an AI client may only report. */
	authorKind: 'person' | 'ai_client';
	decidedAt: string;
	/**
	 * The gap title at decision time, so the trace reads on its own once the gap
	 * is gone. A display copy only: a decision finds its gap by `gapId`, a key
	 * built from the check and the element (never from words), so a gap whose
	 * text changes language keeps its decision.
	 */
	gapTitle: string;
	/** Set when a later decision replaces this one. The original stays readable. */
	supersededById: string | null;
}

/**
 * A decision somebody prepared and nobody has taken yet.
 *
 * It is NOT a decision: the finding stays open, every score is unchanged, and
 * nothing here settles anything. It is the reasoning done ahead of time, so the
 * person who answers for the call reads a disposition and a why instead of
 * writing them. That is what a client may do with a register it understands,
 * now that it is refused the decision itself: told no and offered nothing, it
 * reports the same findings again next session and the register never moves.
 *
 * At most one per gap, replaced rather than stacked: two prepared answers to
 * one question is one question more than the person asked for.
 */
export interface PreparedDecision {
	readonly id: string;
	gapId: string;
	/** The gap title when it was prepared, so the card reads on its own. A display copy: the gap is found by `gapId`. */
	gapTitle: string;
	status: Exclude<GapDecisionStatus, 'reopened'>;
	reason: string;
	/** Who prepared it: the account email, or the client's own name. */
	preparedById: string;
	preparedByKind: 'person' | 'ai_client';
	preparedAt: string;
}

/** The dimension carrying per-feature behavioral maturity. */
export const MATURITY_DIMENSION_KEY = 'maturity';
/**
 * Behavior is the larger share of "buildable". Structure (every other
 * dimension) makes a spec coherent; authored behavior makes it implementable.
 * So readiness = 40% structure + 60% maturity. Consequence (deliberate): a
 * structurally-perfect spec whose features carry no behavior caps around 40
 * ("Watch") — it can never read as "Strong"/ready until the behavior is real.
 */
const MATURITY_SHARE = 0.6;

/**
 * COVERAGE — structural breadth alone (presence & completeness): the average of
 * every dimension except behavior maturity. `fallback` covers dimension-less
 * analyses (empty project). Shared by the Control Center and the portfolio
 * cards so the number never drifts between the two.
 */
export function coverageScoreOf(dimensions: readonly Dimension[], fallback = 0): number {
	const structural = dimensions.filter((d) => d.key !== MATURITY_DIMENSION_KEY);
	return structural.length
		? Math.round(structural.reduce((s, d) => s + d.score, 0) / structural.length)
		: fallback;
}

/**
 * MATURITY — the behavior-maturity dimension's own score (read as a maturity stage by the
 * UI). `fallback` covers projects whose analysis carries no maturity dimension.
 */
export function maturityScoreOf(dimensions: readonly Dimension[], fallback = 0): number {
	return dimensions.find((d) => d.key === MATURITY_DIMENSION_KEY)?.score ?? fallback;
}

export function computeReadiness(dimensions: Dimension[]): number {
	if (dimensions.length === 0) return 0;
	const maturity = dimensions.find((d) => d.key === MATURITY_DIMENSION_KEY);
	const structural = dimensions.filter((d) => d.key !== MATURITY_DIMENSION_KEY);
	const structuralAvg = structural.length
		? structural.reduce((s, d) => s + d.score, 0) / structural.length
		: 0;
	// Missing maturity evidence is zero, never permission to ignore maturity.
	return Math.round(
		(1 - MATURITY_SHARE) * structuralAvg + MATURITY_SHARE * (maturity?.score ?? 0)
	);
}

/* ── Persisted entities ───────────────────────────────────────────────── */

/** A document produced by Generate Specs — feeds the AI Generation Contract. */
export interface GeneratedArtifact {
	readonly id: string;
	kind: ArtifactKind;
	title: string;
	content: string;
	generatedAt: string;
}

/** The authored content of Step 09. Dimensions/gaps/readiness are NOT here. */
export interface ProjectCoherenceDraft {
	projectId: string;
	threshold: number;
	/** Legacy acknowledgements (no reason, no author). Read as settled; never written to any more. */
	acknowledgedGapIds: string[];
	/** Traced decisions over gaps, append-only (see GapDecision). */
	decisions: GapDecision[];
	/** Decisions prepared for a person to take, at most one per gap (see prepared.ts). */
	prepared: PreparedDecision[];
	artifacts: GeneratedArtifact[];
	specsGenerated: boolean;
	generatedAt: string | null;
	lastCheckAt: string | null;
	lastSavedAt: string | null;
}

export function createEmptyCoherenceDraft(projectId: string): ProjectCoherenceDraft {
	return {
		projectId,
		threshold: DEFAULT_THRESHOLD,
		acknowledgedGapIds: [],
		decisions: [],
		prepared: [],
		artifacts: [],
		specsGenerated: false,
		generatedAt: null,
		lastCheckAt: null,
		lastSavedAt: null
	};
}

/* ── Gate helpers (the whole point: block the push until green) ───────── */

/** Blocking gaps cannot be acknowledged away. */
export function blockingGapCount(analysis: CoherenceAnalysis): number {
	return analysis.gaps.filter((g) => g.blocking).length;
}

/**
 * Open gaps minus the non-blocking ones the team has settled, by a traced
 * decision or a legacy acknowledgement. The checker already applies decisions
 * (see decisions.ts), so on a current analysis this is a no-op safety net.
 */
export function openGaps(draft: ProjectCoherenceDraft, analysis: CoherenceAnalysis): Gap[] {
	const settled = new Set(draft.acknowledgedGapIds);
	for (const d of draft.decisions) {
		if (d.supersededById === null && d.status !== 'reopened') settled.add(d.gapId);
	}
	return analysis.gaps.filter((g) => g.blocking || !settled.has(g.id));
}

/** Green = readiness clears the threshold AND no blocking gap remains. */
export function isGreen(draft: ProjectCoherenceDraft, analysis: CoherenceAnalysis): boolean {
	return analysis.readinessScore >= draft.threshold && blockingGapCount(analysis) === 0;
}
