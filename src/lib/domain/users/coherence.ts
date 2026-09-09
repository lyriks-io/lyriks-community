import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { SYSTEM_CAPABILITIES } from './enums';
import { permissionCoverage, type ProjectUsersDraft } from './draft';

/**
 * Local-coherence for Step 03 — implements the spec's
 * `users.localCoherenceScore` action (feature `33b2f79d`). The deliverable of
 * this step is a meaningfully *wired* permission matrix, so the score is driven
 * by coverage, not cell density: every capability granted to ≥1 role (70),
 * every role holding ≥1 capability (20), the rest role-naming trivia (10). This
 * rewards a complete matrix without demanding the least-privilege-violating
 * "every role holds every capability" that a density metric would.
 *
 * `derivedCapabilityIds` are the feature/journey capabilities the matrix shows
 * but the domain can't read (they live in upstream drafts); the store / global
 * checker pass them in. Score clamped to [0, 100].
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeUsersCoherence(
	draft: ProjectUsersDraft,
	derivedCapabilityIds: readonly string[] = []
): CoherenceResult {
	// No role ⇒ nothing downstream works; floor the score so it can't read healthy.
	if (draft.roles.length === 0) {
		return {
			score: 0,
			...toneFor(0),
			issues: [{ code: 'no-role', message: 'No role authored: Features is blocked.' }]
		};
	}

	const issues: CoherenceIssue[] = [];
	let score = 0;
	const cov = permissionCoverage(draft, derivedCapabilityIds);

	// 1. Capability coverage — DOMINANT (70 pts). Every capability (System,
	//    off-structure, feature, journey) must be granted to at least one role.
	score += 70 * (cov.totalCapabilities === 0 ? 0 : cov.coveredCapabilities / cov.totalCapabilities);
	if (cov.uncoveredCapabilityIds.length > 0) {
		// Name the culprits — "3 of 34 have no role" is unfixable without knowing
		// WHICH three. System capabilities carry labels; derived (feature/journey)
		// capabilities show their id, which the matrix rows use verbatim.
		const labelOf = (id: string): string =>
			SYSTEM_CAPABILITIES.find((c) => c.id === id)?.label ?? id;
		const shown = cov.uncoveredCapabilityIds.slice(0, 8).map(labelOf);
		const more = cov.uncoveredCapabilityIds.length - shown.length;
		issues.push({
			code: 'capability-unassigned',
			message:
				`${cov.uncoveredCapabilityIds.length} of ${cov.totalCapabilities} capabilities have no role granted: ` +
				`${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}.`
		});
	}

	// 2. Role coverage (20 pts). A role with no capability has no reason to exist.
	score += 20 * (cov.coveredRoles / draft.roles.length);
	if (cov.coveredRoles < draft.roles.length) {
		issues.push({
			code: 'role-no-access',
			message: `${draft.roles.length - cov.coveredRoles} role(s) hold no capability.`
		});
	}

	// 3. Roles named — minor (10 pts).
	const named = draft.roles.filter((r) => r.name.trim().length > 0).length;
	score += 10 * (named / draft.roles.length);
	if (named < draft.roles.length) {
		issues.push({ code: 'role-unnamed', message: 'One or more roles have no name.' });
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
