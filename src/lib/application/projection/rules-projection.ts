import {
	createEmptyRulesDraft,
	type EdgeCase,
	type EdgeOutcome,
	type Issue,
	type ProjectRulesDraft
} from '$domain/rules';
import type { BehaviorOp } from '$application/ports';
import { parseRulesDraft } from '$application/specification/parse-rules-draft';
import { experienceFeatureId } from './aux-feature-ids';
import { ACCEPTANCE_EDGE_PREFIX } from './ownership';

/**
 * The Lyriks-owned RESIDUE for the Rules section (Step 06). The derived `inventory`
 * is rebuilt on load and `issues` remain an analysis worklist. Authored edge-case
 * scenarios live in residue for lossless editing and are also projected as kernel
 * acceptance criteria on the central Experience feature. `inventory` is intentionally
 * absent from residue because it is never authored here.
 */
export interface RulesResidue {
	issues: Issue[];
	scenarios: EdgeCase[];
	lastSavedAt: string | null;
}

/** Split the Lyriks-owned residue out of the wizard draft (the write side). */
export function rulesResidueFromDraft(draft: ProjectRulesDraft): RulesResidue {
	return {
		issues: draft.issues,
		scenarios: draft.scenarios,
		lastSavedAt: draft.lastSavedAt
	};
}

/**
 * Project the Given / When / Then criteria into kernel write ops: each becomes a prose
 * `AcceptanceCriterion` (Given/When/Then) on the feature it tests, and a case
 * naming no feature lands on the central "Experience" feature, the spec facet
 * of the unified model where every journey's workflow surface lives (so
 * `relatedSurfaceId` resolves). Each op patches an existing feature only and
 * replaces just the `ac-edge-` rows, so it never clobbers surfaces, entities or
 * dashboard-authored criteria.
 *
 * Emitted for Experience always, and for every feature that holds a case now
 * or held one before (`previousFeatureIds`), even with nothing left to carry:
 * that is what clears a case from the feature it was moved off, and the last
 * case from a feature once deleted.
 */
export function rulesAcceptanceOps(
	projectId: string,
	draft: ProjectRulesDraft,
	previousFeatureIds: readonly string[] = []
): BehaviorOp[] {
	const experience = experienceFeatureId(projectId);
	const byFeature = new Map<string, Record<string, unknown>[]>([[experience, []]]);
	for (const id of previousFeatureIds) byFeature.set(id, []);
	for (const edge of draft.scenarios) {
		const home = edge.relatedFeatureId || experience;
		const rows = byFeature.get(home) ?? [];
		rows.push(acceptanceCriterion(edge) as unknown as Record<string, unknown>);
		byFeature.set(home, rows);
	}
	return [...byFeature].map(([featureId, acceptanceCriteria]) => ({
		kind: 'mirrorFeatureAcceptance',
		featureId,
		acceptanceCriteria,
		ownedPrefix: ACCEPTANCE_EDGE_PREFIX
	}));
}

/** The features the cases of a saved draft sit on (Experience aside). */
export function edgeCaseFeatureIds(scenarios: readonly EdgeCase[]): string[] {
	return [...new Set(scenarios.flatMap((s) => (s.relatedFeatureId ? [s.relatedFeatureId] : [])))];
}

/** unspa AcceptanceOutcome (0.9.0) — the Rules `error` outcome maps to `failure`. */
const OUTCOME_MAP: Record<EdgeOutcome, 'success' | 'failure' | 'blocked'> = {
	success: 'success',
	blocked: 'blocked',
	error: 'failure'
};

function acceptanceCriterion(edge: EdgeCase) {
	return {
		id: `${ACCEPTANCE_EDGE_PREFIX}${edge.id}`,
		title: edge.title,
		given: edge.given,
		when: edge.whenText,
		then: edge.then,
		expectedOutcome: OUTCOME_MAP[edge.expectedOutcome] ?? 'success',
		// Link to the journey's workflow surface when the edge case names one; a
		// dangling ref is a soft warning in unspa (never a hard error).
		...(edge.relatedJourneyId ? { relatedSurfaceId: `srf-${edge.relatedJourneyId}` } : {})
	};
}

/**
 * Rebuild the Rules wizard draft from the residue. Pure and framework-free.
 * `inventory` is left empty — `LoadRulesDraftUseCase` recomputes it from upstream on
 * every load.
 */
export function buildRulesProjection(
	projectId: string,
	residue: RulesResidue | null
): ProjectRulesDraft {
	const draft = createEmptyRulesDraft(projectId);
	if (!residue) return draft;
	// The stored residue is untrusted: read through the section's parser, an issue or a case saved before a
	// field existed (an issue's sourceIds) comes back whole instead of breaking every reader of the section.
	const parsed = parseRulesDraft({ issues: residue.issues, scenarios: residue.scenarios }, projectId);
	draft.issues = parsed.issues;
	draft.scenarios = parsed.scenarios;
	draft.lastSavedAt = residue.lastSavedAt;
	return draft;
}
