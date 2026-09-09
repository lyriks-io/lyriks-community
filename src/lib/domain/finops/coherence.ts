import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import type { ProjectFinopsDraft } from './draft';
import { isFrozen, scopeIsImmature, spentRatio, ZERO_SIGNALS, type FinopsSignals } from './compile';

/**
 * Local-coherence for the AI Cost Governor capability. Draft-first so the client
 * can recompute it live (signals are folded in when present):
 *   1. A budget ceiling is set (> 0) .......................... 20 pts
 *   2. Thresholds are sane (0-100 / 0-1) ..................... 15 pts
 *   3. There is a spec to govern (readiness signal > 0) ...... 15 pts
 *   4. An immature scope is not left running unguarded ....... 25 pts
 *   5. No compiled rule is stuck 'proposed' (all acted on) ... 15 pts
 *   6. The gateway is linked or the install is explicitly air-gapped-advisory  10 pts
 *
 * Score clamped to [0, 100], same convention as the sibling capabilities.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeFinopsCoherence(
	draft: ProjectFinopsDraft,
	signals: FinopsSignals = ZERO_SIGNALS
): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	let score = 0;

	// 1. Budget ceiling — 20 pts.
	if (draft.monthlyBudgetUsd > 0) {
		score += 20;
	} else {
		issues.push({ code: 'no-budget', message: 'Set a monthly AI budget ceiling to govern spend.' });
	}

	// 2. Sane thresholds — 15 pts.
	const thresholdsSane =
		draft.maturityThreshold >= 0 &&
		draft.maturityThreshold <= 100 &&
		draft.coherenceThreshold >= 0 &&
		draft.coherenceThreshold <= 100 &&
		draft.budgetTightenRatio >= 0 &&
		draft.budgetTightenRatio <= 1;
	if (thresholdsSane) {
		score += 15;
	} else {
		issues.push({ code: 'bad-thresholds', message: 'Policy thresholds are out of range.' });
	}

	// 3. A spec to govern — 15 pts.
	if (signals.readinessScore > 0) {
		score += 15;
	} else {
		issues.push({
			code: 'no-signal',
			message: 'No readiness signal yet: the governor has nothing to gate spend on.'
		});
	}

	// 4. Immature scope is guarded — 25 pts.
	if (!scopeIsImmature(draft, signals)) {
		score += 25;
	} else if (isFrozen(draft, signals)) {
		// Immature but enforced-and-frozen: the tokens are protected. Full credit.
		score += 25;
	} else {
		issues.push({
			code: 'immature-scope-unguarded',
			message: 'A scope below the readiness bar can still burn tokens; enforce, or compile a block rule.'
		});
	}

	// 5. No rule stuck proposed — 15 pts.
	const proposed = draft.rules.filter((r) => r.status === 'proposed').length;
	if (proposed === 0) {
		score += 15;
	} else {
		issues.push({
			code: 'rules-pending',
			message: `${proposed} compiled rule(s) awaiting approval.`
		});
	}

	// 6. Gateway reachable or explicitly air-gapped-advisory — 10 pts.
	if (draft.gateway.connected || draft.enforcementMode === 'advisory') {
		score += 10;
	} else {
		issues.push({
			code: 'gateway-unlinked',
			message: 'Enforced but no proxy linked: connect the gateway or drop to advisory.'
		});
	}

	// Nudge (not scored): spend past the tighten line but not yet frozen.
	if (spentRatio(draft) > draft.budgetTightenRatio && !isFrozen(draft, signals)) {
		issues.push({
			code: 'budget-tightening',
			message: 'Spend is over the tighten line: compile a budget-cap rule.'
		});
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
