import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { stepsOfJourney, type ProjectExperienceDraft } from './draft';

/**
 * Local-coherence for Step 05. The spec scores three things — journey coverage
 * per core, steps-with-linked-screens, and events/data completeness — plus the
 * structural bar (≥ 1 journey, journeys that actually carry steps).
 *
 *   1. At least one journey ............................ 20 pts
 *   2. Journeys that carry ≥ 1 step (proportional) ..... 25 pts
 *   3. Cores covered by ≥ 1 journey (proportional) ..... 15 pts
 *   4. Steps with a linked Screen (proportional) ....... 20 pts
 *   5. Steps with ≥ 1 events/data underlay entry ....... 20 pts
 *
 * Score clamped to [0, 100], same convention as Steps 01-04.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeExperienceCoherence(draft: ProjectExperienceDraft): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	let score = 0;

	const journeys = draft.journeys;
	const steps = draft.steps;

	// 1. At least one journey — 20 pts.
	if (journeys.length === 0) {
		issues.push({ code: 'no-journey', message: 'No Journey authored yet.' });
	} else {
		score += 20;
	}

	// 2. Journeys that carry at least one step — 25 pts (proportional).
	if (journeys.length > 0) {
		const withStep = journeys.filter((j) => stepsOfJourney(draft, j.id).length > 0).length;
		score += Math.round(25 * (withStep / journeys.length));
		if (withStep < journeys.length) {
			issues.push({
				code: 'journey-without-step',
				message: `${journeys.length - withStep} Journey(s) with no Step.`
			});
		}
	}

	// 3. Cores covered by at least one journey — 15 pts (proportional).
	const cores = draft.derivedCores;
	if (cores.length > 0) {
		const coveredCores = new Set(journeys.map((j) => j.coreId));
		const uncovered = cores.filter((c) => !coveredCores.has(c.id));
		score += Math.round(15 * ((cores.length - uncovered.length) / cores.length));
		if (uncovered.length > 0) {
			// Name the cores — the count alone is unfixable without hunting them down.
			issues.push({
				code: 'core-without-journey',
				message: `${uncovered.length} Core(s) have no Journey yet: ${uncovered
					.map((c) => c.name || c.id)
					.join(', ')}.`
			});
		}
	}

	// 4. Steps with a linked Screen — 20 pts (proportional).
	if (steps.length > 0) {
		const linked = steps.filter((s) => s.linkedScreenId !== null).length;
		score += Math.round(20 * (linked / steps.length));
		if (linked < steps.length) {
			issues.push({
				code: 'step-without-screen',
				message: `${steps.length - linked} Step(s) without a linked Screen.`
			});
		}
	}

	// 5. Steps with at least one events/data underlay entry — 20 pts (proportional).
	if (steps.length > 0) {
		const opStepIds = new Set(draft.stepOperations.map((o) => o.stepId));
		const dataStepIds = new Set(draft.stepDataReads.map((d) => d.stepId));
		const withUnderlay = steps.filter((s) => opStepIds.has(s.id) || dataStepIds.has(s.id)).length;
		score += Math.round(20 * (withUnderlay / steps.length));
		if (withUnderlay < steps.length) {
			issues.push({
				code: 'step-without-underlay',
				message: `${steps.length - withUnderlay} Step(s) with no events flow or data consumed.`
			});
		}
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
