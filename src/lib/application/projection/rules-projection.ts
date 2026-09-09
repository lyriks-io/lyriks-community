import {
	createEmptyRulesDraft,
	type EdgeCase,
	type EdgeOutcome,
	type Issue,
	type ProjectRulesDraft
} from '$domain/rules';
import type { BehaviorOp } from '$application/ports';
import { experienceFeatureId } from './aux-feature-ids';

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
 * Project the Step-06 edge cases into kernel write ops: each becomes a prose
 * `AcceptanceCriterion` (Given/When/Then) on the central "Experience" feature — the
 * spec/documentation facet of the unified model, where every journey's workflow
 * surface lives so `relatedSurfaceId` resolves. This is what folds Rules' behavioral
 * half into the kernel (needs unspaghettit ≥ 0.9.0). The op patches an existing
 * feature only and merges by id, so it is a no-op before Experience has been saved,
 * and it never clobbers surfaces/entities/dashboard-authored criteria. Always emitted
 * (even empty) so deleting the last edge case clears the projected rows.
 */
export function rulesAcceptanceOps(projectId: string, draft: ProjectRulesDraft): BehaviorOp[] {
	const acceptanceCriteria = draft.scenarios.map((edge) => acceptanceCriterion(edge));
	return [
		{
			kind: 'mirrorFeatureAcceptance',
			featureId: experienceFeatureId(projectId),
			acceptanceCriteria: acceptanceCriteria as unknown as Record<string, unknown>[]
		}
	];
}

/** unspa AcceptanceOutcome (0.9.0) — the Rules `error` outcome maps to `failure`. */
const OUTCOME_MAP: Record<EdgeOutcome, 'success' | 'failure' | 'blocked'> = {
	success: 'success',
	blocked: 'blocked',
	error: 'failure'
};

function acceptanceCriterion(edge: EdgeCase) {
	return {
		id: `ac-edge-${edge.id}`,
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
	draft.issues = residue.issues;
	draft.scenarios = residue.scenarios;
	draft.lastSavedAt = residue.lastSavedAt;
	return draft;
}
