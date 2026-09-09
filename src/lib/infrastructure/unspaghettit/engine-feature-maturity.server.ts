import { computeFeatureMaturity } from 'unspaghettit';
import type { FeatureMaturity, MaturityIssue } from 'unspaghettit';

import type {
	FeatureMaturityIssue,
	FeatureMaturityReport,
	FeatureMaturityScorerPort
} from '$application/ports';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { normalizeFeatureCollections } from './normalize-feature-collections';

/**
 * `FeatureMaturityScorerPort` backed by the engine's own scorer, exported from
 * the `unspaghettit` package since 0.14.0 for exactly this reason: the platform
 * needs the number offline (air-gapped MAP mode) and hand-copying the weights
 * let the two formulas drift.
 *
 * The call is pure and synchronous — no subprocess, no network, nothing to fall
 * back to — so this stays usable with the engine's MCP advisor switched off,
 * which is what the per-leaf maturity reading requires.
 */
export class EngineFeatureMaturityScorer implements FeatureMaturityScorerPort {
	/**
	 * One reading per snapshot object. The behavior store hands back the same
	 * parsed (and frozen) object for a file until that file changes, and the
	 * project chrome scores every leaf on every page, so without this a project
	 * of N leaves paid N scorings per request for readings that never moved.
	 * A WeakMap keeps a reading exactly as long as its snapshot stays cached.
	 */
	readonly #readings = new WeakMap<object, FeatureMaturity | null>();

	score(snapshot: UnspaFeatureSnapshot | null): number {
		// The engine reports `percentage` (0-100) alongside its raw score and the
		// issues behind it; this reading keeps only the percentage.
		return this.#compute(snapshot)?.percentage ?? 0;
	}

	report(snapshot: UnspaFeatureSnapshot | null): FeatureMaturityReport | null {
		const maturity = this.#compute(snapshot);
		if (!maturity) return null;
		return {
			score: maturity.score,
			maxScore: maturity.maxScore,
			percentage: maturity.percentage,
			// Critical before recommended: the caller renders this list in order,
			// and a blocking check is always the better next thing to fix.
			issues: [
				...maturity.criticalIssues.map(toIssue),
				...maturity.recommendedIssues.map(toIssue)
			]
		};
	}

	/** The one engine call both readings share. Null means nothing to score. */
	#compute(snapshot: UnspaFeatureSnapshot | null): FeatureMaturity | null {
		const feature = snapshot?.feature;
		if (!feature || typeof feature !== 'object') return null;
		const remembered = this.#readings.get(feature);
		if (remembered !== undefined) return remembered;
		const reading = this.#score(feature);
		this.#readings.set(feature, reading);
		return reading;
	}

	#score(feature: object): FeatureMaturity | null {
		try {
			// The scorer walks `surface.rules`, `action.effects` and their siblings
			// without defaulting them, so a snapshot that lost one array throws and
			// scores 0. A fully modelled feature then reads as unauthored and blocks
			// its project on missing behavior. Hand it the empty arrays instead: a
			// well-formed snapshot is unchanged, a damaged one gets its real number.
			return computeFeatureMaturity(normalizeFeatureCollections(feature) as never);
		} catch (error) {
			// Still throwing after that is a snapshot this adapter cannot read, not
			// an unauthored feature. It reads like an absent shell either way, since
			// a page load must not die on one bad record, but it says so out loud:
			// a feature silently scored 0 is a project blocked with no cause named.
			console.warn(
				`[engine-maturity] cannot score ${featureIdOf(feature)}, reading it as unauthored:`,
				error instanceof Error ? error.message : String(error)
			);
			return null;
		}
	}
}

/**
 * Engine issue to port issue. The optional ids only travel when the engine set
 * them, so a consumer compiled with exactOptionalPropertyTypes stays happy.
 */
function toIssue(issue: MaturityIssue): FeatureMaturityIssue {
	return {
		target: issue.target,
		targetKind: issue.targetKind,
		area: issue.area,
		message: issue.message,
		severity: issue.severity,
		...(issue.surfaceId !== undefined ? { surfaceId: issue.surfaceId } : {}),
		...(issue.actionId !== undefined ? { actionId: issue.actionId } : {})
	};
}

/** Best-effort id for the warning above; a shell missing even that is why we warn. */
function featureIdOf(feature: object): string {
	const id = (feature as { id?: unknown }).id;
	return typeof id === 'string' && id.length > 0 ? id : '<unnamed feature>';
}
