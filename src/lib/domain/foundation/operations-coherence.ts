import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import type { FoundationOperationsDraft } from './operations';

/**
 * Local-coherence for the Foundation operations slice — equal-weight rails,
 * draft-only so the client recomputes it live:
 *   1. A primary locale is set
 *   2. A quality budget exists (latency or availability)
 *   3. A roll-out strategy is chosen (only when the project replaces an
 *      existing system — a greenfield build has nothing to roll over)
 *   4. Some coverage exists (a fixture or a screen's states)
 *
 * Score clamped to [0, 100], same convention as the sibling capabilities.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

const filled = (v: string) => v.trim().length > 0;

export function computeOperationsCoherence(
	draft: FoundationOperationsDraft,
	migrationExpected = true
): CoherenceResult {
	const hasFixture = draft.testFixtures.some((f) => filled(f.name));
	const hasScreenState = Object.values(draft.screenStates).some((s) =>
		Object.values(s).some(filled)
	);

	const rails = [
		{
			met: filled(draft.i18n.primaryLocale),
			code: 'no-locale',
			message: 'No primary locale set for i18n.'
		},
		{
			met: filled(draft.quality.latencyP95Ms) || filled(draft.quality.availabilityPct),
			code: 'no-quality-budget',
			message: 'No latency or availability budget set.'
		},
		...(migrationExpected
			? [{ met: Boolean(draft.migration.strategy), code: 'no-migration', message: 'No roll-out strategy chosen.' }]
			: []),
		{
			met: hasFixture || hasScreenState,
			code: 'no-coverage',
			message: 'No test fixture or per-screen UI state described.'
		}
	];

	const issues: CoherenceIssue[] = rails
		.filter((r) => !r.met)
		.map((r) => ({ code: r.code, message: r.message }));
	const score = Math.round((rails.filter((r) => r.met).length / rails.length) * 100);
	const clamped = Math.max(0, Math.min(100, score));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
