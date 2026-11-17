import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
import type { FoundationOperationsDraft } from './operations';

/**
 * Local-coherence for the Foundation operations slice — equal-weight rails,
 * draft-only so the client recomputes it live:
 *   1. A primary locale is set
 *   2. A quality budget exists (latency or availability)
 *   3. Some coverage exists (a fixture, now written on Experience › Journeys,
 *      or a screen's states)
 *
 * The roll-out strategy rail is retired with the Migration entry (spec:
 * criterion 60324141); `migrationExpected` is kept so callers stay compatible.
 *
 * Score clamped to [0, 100], same convention as the sibling capabilities.
 */

const filled = (v: string) => v.trim().length > 0;

export function computeOperationsCoherence(
	draft: FoundationOperationsDraft,
	migrationExpected = true,
	lang: SpecLanguage = 'en'
): CoherenceResult {
	const fr = lang === 'fr';
	const hasFixture = draft.testFixtures.some((f) => filled(f.name));
	const hasScreenState = Object.values(draft.screenStates).some((s) =>
		Object.values(s).some(filled)
	);

	const rails = [
		{
			met: filled(draft.i18n.primaryLocale),
			code: 'no-locale',
			message: fr ? "Aucune langue principale n'est définie pour l'i18n." : 'No primary locale set for i18n.'
		},
		// The accessibility level is the only quality budget asked for (spec: criterion 60324141).
		{
			met: draft.quality.a11yStandards.length > 0,
			code: 'no-a11y-level',
			message: fr ? "Aucun niveau d'accessibilité n'est fixé." : 'No accessibility level set.'
		},
		// Retired (spec: criterion 60324141): Migration is not asked for any more.
		// ...(migrationExpected
		// 	? [{ met: Boolean(draft.migration.strategy), code: 'no-migration', message: 'No roll-out strategy chosen.' }]
		// 	: []),
		{
			met: hasFixture || hasScreenState,
			code: 'no-coverage',
			message: fr
				? "Aucun jeu de test ni aucun état d'interface par écran n'est décrit."
				: 'No test fixture or per-screen UI state described.'
		}
	];

	const issues: CoherenceIssue[] = rails
		.filter((r) => !r.met)
		.map((r) => ({ code: r.code, message: r.message }));
	const score = Math.round((rails.filter((r) => r.met).length / rails.length) * 100);
	const clamped = Math.max(0, Math.min(100, score));
	const { tone, label } = sectionTone(clamped, lang);
	return { score: clamped, tone, label, issues };
}
