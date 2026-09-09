import type { GapSeverity } from './enums';
import type {
	CoherenceAnalysis,
	Dimension,
	FormalEngineStatus,
	Gap,
	GapDecision,
	GapKind,
	GapProvenance
} from './draft';
import { tallyChecks, type CheckTally } from './checks';

/**
 * The Control Center's model — a deep, whole-product view of coherence.
 *
 * The two whole-project outputs are orthogonal:
 *   - readinessScore : buildability — structural coverage and behavior maturity combined.
 *   - coherenceScore : correctness — 100 minus the gain locked up in unfixed incoherences.
 *
 * An `Incoherence` is a richer `Gap`: it carries a KIND, the capability it lives in,
 * a next-best-action, the coherence points recovered if fixed, and a Fix-Now route.
 */

export type IncoherenceKind = GapKind;

/**
 * The strength of the guarantee behind an incoherence — so the formal DPO
 * verdict is never mistaken for a best-effort heuristic.
 *   formal   = Rust DPO engine, MACHINE-GUARANTEED (type-compat / gluing / LCA).
 *   semantic = the consistency-review agent (your LLM via MCP), best-effort.
 *   coverage = deterministic cross-capability heuristics (engine-offline fallback).
 */
export type CoherenceGuarantee = 'formal' | 'semantic' | 'behavior' | 'coverage';

/** Derive the guarantee tier from the gap id the checker layers emit. */
export function guaranteeOf(gapId: string): CoherenceGuarantee {
	if (gapId.startsWith('dpo-')) return 'formal';
	if (gapId.startsWith('semantic')) return 'semantic';
	if (gapId.startsWith('unspa-')) return 'behavior';
	return 'coverage';
}

const GUARANTEE_RANK: Record<CoherenceGuarantee, number> = {
	formal: 0,
	semantic: 1,
	behavior: 2,
	coverage: 3
};

/**
 * The provenance a card shows: what the gap itself declares, else derived from
 * the tier that emitted it. A declared issue is a decision to settle, not a
 * heuristic, and the badge must say so.
 */
export function provenanceOf(gap: Pick<Gap, 'id' | 'provenance'>): GapProvenance {
	if (gap.provenance) return gap.provenance;
	switch (guaranteeOf(gap.id)) {
		case 'formal':
			return 'proven';
		case 'semantic':
			return 'reviewed';
		case 'behavior':
			return 'behavior';
		default:
			return 'detected';
	}
}

/** Card labels for each provenance, and what the label means (tooltips). */
export const PROVENANCE_META: Record<GapProvenance, { label: string; means: string }> = {
	declared: {
		label: 'Declared',
		means: 'Written into the spec by a person or an agent: a decision to settle, not a detection.'
	},
	detected: { label: 'Detected', means: 'Found by a deterministic check across the sections.' },
	proven: { label: 'Proven', means: 'Proven by the formal DPO engine (machine-guaranteed).' },
	reviewed: { label: 'Reviewed', means: 'Judged by the AI consistency review (best-effort).' },
	behavior: {
		label: 'Model-checked',
		means: 'Reported by the unspa behavior engine (best-effort, advisory).'
	}
};

/** Generic label per coarse kind; a gap's own `kindLabel` is preferred when set. */
export const KIND_LABEL: Record<IncoherenceKind, string> = {
	misalignment: 'Misalignment',
	dangling: 'Broken reference',
	duplicate: 'Duplicate',
	orphan: 'Orphan',
	missing: 'Missing',
	'step-without-action': 'Step without action'
};

export interface Incoherence {
	id: string;
	kind: IncoherenceKind;
	/** The precise class in the reader's words; the kind's label when the gap has none. */
	kindLabel: string;
	/** How strong the guarantee is — formal (DPO) outranks semantic + heuristic. */
	guarantee: CoherenceGuarantee;
	/** Who says so: declared, detected, proven, reviewed, model-checked. */
	provenance: GapProvenance;
	severity: GapSeverity;
	/** Capability id (registry) where this is fixed. */
	capabilityId: string;
	/** Human title of that capability, so the card names where the fix happens. */
	capabilityTitle: string;
	/** The element this is about (a feature, a role, a table), when known. */
	subject?: string;
	title: string;
	/** WHY: the explanation behind the finding. */
	detail: string;
	/** WHAT TO DO: the action line; the detail when the emitter gave no action. */
	nextBestAction: string;
	/** Resolved Fix-Now route. */
	fixRoute: string;
	blocking: boolean;
	/** Catalogue key of the check that produced it, when any. */
	checkId?: string;
	/** Feature the gap hangs off, when it belongs to one. */
	featureRef?: string;
}

export interface ProductCoherence {
	readinessScore: number;
	coherenceScore: number;
	dimensions: Dimension[];
	incoherences: Incoherence[];
	/** Per-leaf behavioral maturity (feature id → 0-100), when the analysis has it. */
	featureMaturity?: Record<string, number>;
	/** How many catalogue checks ran and how many pass: the breadth of what was verified. */
	checks: CheckTally;
	/** Whether the formal layer contributed, so the panel states the guarantee it has. */
	formalEngine?: FormalEngineStatus;
	/** Gaps settled by a traced decision: out of the score, still readable with who and why. */
	settled: SettledIncoherence[];
}

export interface SettledIncoherence {
	incoherence: Incoherence;
	decision: GapDecision;
}

/** Where a source step's incoherence is fixed. */
export interface CapabilityRef {
	capabilityId: string;
	capabilityTitle: string;
	fixRoute: string;
}

/** Penalty (and recoverable gain) per severity. */
const PENALTY: Record<GapSeverity, number> = { high: 20, medium: 10, low: 4 };
const SEVERITY_RANK: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Best-effort kind inference from an existing Gap's id/title. */
export function inferKind(gap: Gap): IncoherenceKind {
	if (gap.kind) return gap.kind;
	const h = `${gap.id} ${gap.title}`.toLowerCase();
	if (h.includes('orphan') || h.includes('unused')) return 'orphan';
	if (h.includes('duplicate')) return 'duplicate';
	if (
		h.includes('dangling') ||
		h.includes('forgotten') ||
		h.includes('unreferenced') ||
		h.includes('reference') ||
		h.includes('broken') ||
		h.includes('nav-')
	)
		return 'dangling';
	if (h.includes('without') || h.includes('no action') || h.includes('empty journey') || h.includes('unlinked') || h.includes('dead-action')) return 'step-without-action';
	if (h.includes('missing') || h.includes('unfilled') || h.includes('below') || h.includes('uncovered') || h.includes('empty') || h.includes('no ')) return 'missing';
	return 'misalignment';
}

/**
 * "Do this first" order: what blocks the build, then what weighs most, then the
 * strongest guarantee. The list is sorted with it, so the first incoherence IS
 * the next best fix.
 */
export function fixPriority(a: Incoherence, b: Incoherence): number {
	return (
		Number(b.blocking) - Number(a.blocking) ||
		SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
		GUARANTEE_RANK[a.guarantee] - GUARANTEE_RANK[b.guarantee]
	);
}

/** The single incoherence to fix now, or none when the product is clean. */
export function nextBestFix(pc: ProductCoherence): Incoherence | undefined {
	return [...pc.incoherences].sort(fixPriority)[0];
}

/**
 * Map a raw CoherenceAnalysis into the bimodal ProductCoherence the Control
 * Center renders. `resolve` turns a source step id into the capability + route
 * (injected so the domain stays free of the UI capability registry).
 */
export function toProductCoherence(
	analysis: CoherenceAnalysis,
	resolve: (sourceStep: string) => CapabilityRef
): ProductCoherence {
	// No per-card "points": what one fix is worth to the ring depends on every
	// other open gap, so any number printed on a card would be wrong. The card
	// says how urgent it is (blocking, severity); the ring says the score.
	const toIncoherence = (gap: Gap): Incoherence => {
		const ref = resolve(gap.sourceStep);
		const kind = inferKind(gap);
		return {
			id: gap.id,
			kind,
			kindLabel: gap.kindLabel ?? KIND_LABEL[kind],
			guarantee: guaranteeOf(gap.id),
			provenance: provenanceOf(gap),
			severity: gap.severity,
			capabilityId: ref.capabilityId,
			capabilityTitle: ref.capabilityTitle,
			...(gap.subject ? { subject: gap.subject } : {}),
			title: gap.title,
			detail: gap.detail,
			nextBestAction: gap.action ?? gap.detail,
			fixRoute: ref.fixRoute + (gap.fixAnchor ?? ''),
			blocking: gap.blocking,
			...(gap.checkId ? { checkId: gap.checkId } : {}),
			...(gap.featureRef ? { featureRef: gap.featureRef } : {})
		};
	};
	const incoherences: Incoherence[] = analysis.gaps.map(toIncoherence);
	incoherences.sort(fixPriority);
	const settled: SettledIncoherence[] = (analysis.settled ?? []).map((s) => ({
		incoherence: toIncoherence(s.gap),
		decision: s.decision
	}));

	const coherenceScore = coherenceScoreOf(analysis.gaps);

	return {
		readinessScore: clamp(analysis.readinessScore),
		coherenceScore,
		dimensions: analysis.dimensions,
		incoherences,
		featureMaturity: analysis.featureMaturity,
		// A settled gap still names a check that ran and found something: the tally
		// counts it as failing, so a decision never turns a check green.
		checks: tallyChecks(analysis.checksRun ?? [], [...analysis.gaps, ...settled.map((s) => s.incoherence)]),
		...(analysis.formalEngine ? { formalEngine: analysis.formalEngine } : {}),
		settled
	};
}

/** Open gaps landing on one dimension and the coherence points they lock up. */
export interface DimensionCoherence {
	/** Number of open gaps attributed to this dimension. */
	gapCount: number;
	/** Coherence points these gaps lock up (recovered if all are fixed). */
	penalty: number;
	/** This dimension's own correctness, 0–100 = 100 − its locked points. */
	score: number;
}

/**
 * Some gap `sourceStep`s name a sub-area that has no dimension of its own — they
 * are fixed under a parent dimension. Map them so every gap lands somewhere.
 */
const GAP_SOURCE_ALIAS: Record<string, string> = { permissions: 'users' };

/**
 * Attribute each gap to the dimension that owns its fix, by `sourceStep`. This is
 * what lets the readiness table show CORRECTNESS per row alongside breadth — so a
 * dimension whose breadth bar is fully green still surfaces the gaps it carries,
 * instead of the coherence penalty hiding in a single product-wide number.
 */
export function coherenceByDimension(
	dimensions: readonly Dimension[],
	gaps: readonly Gap[]
): Map<string, DimensionCoherence> {
	const byKey = new Map<string, DimensionCoherence>(
		dimensions.map((d) => [d.key, { gapCount: 0, penalty: 0, score: 100 }])
	);
	// First dimension to claim a sourceStep owns the gaps emitted for that step.
	const keyForStep = new Map<string, string>();
	for (const d of dimensions) if (!keyForStep.has(d.sourceStep)) keyForStep.set(d.sourceStep, d.key);

	for (const g of gaps) {
		const step = GAP_SOURCE_ALIAS[g.sourceStep] ?? g.sourceStep;
		const key = keyForStep.get(step);
		const entry = key ? byKey.get(key) : undefined;
		if (!entry) continue;
		entry.gapCount += 1;
		entry.penalty += PENALTY[g.severity];
	}
	for (const entry of byKey.values()) entry.score = clamp(100 - entry.penalty);
	return byKey;
}

/**
 * Product-level COHERENCE score (0–100): correctness of the whole product. 100
 * minus the weight of every open incoherence, but with DIMINISHING damage — each
 * further issue costs a little less than the last, so the score tracks the
 * VOLUME of problems (a dozen errors read far from 100) yet never collapses to a
 * meaningless 0 just because the list is long. A clean product is 100; a pile of
 * open issues drags it toward, but not onto, 0.
 *
 * `SATURATION` is the half-life: at a summed penalty equal to it the score is
 * 50. Lower = harsher. Orthogonal to readiness (breadth): this is correctness.
 *
 * THE single correctness formula — shared by the Control Center, the global
 * Coherence page, and the portfolio card so the number never drifts.
 */
const SATURATION = 100;
export function coherenceScoreOf(gaps: readonly Gap[]): number {
	const penalty = gaps.reduce((sum, g) => sum + PENALTY[g.severity], 0);
	return clamp((100 * SATURATION) / (SATURATION + penalty));
}
