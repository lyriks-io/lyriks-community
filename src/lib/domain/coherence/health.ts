import type { Gap } from './draft';
import type { GapSeverity } from './enums';
import { coherenceHeadline, type CoherenceHeadline } from './headline';
import { effectivePenalties } from './incoherence';

/**
 * Project health (feat-health-scores, criteria 799e1f5b and 08324382): ONE
 * state score, computed from every open point Lyriks noticed. The coherence
 * gaps are only part of it; what the completeness audit flags and what the code
 * says about the spec are points too, so a completion at 100 can no longer sit
 * beside a project nobody proved against its code.
 *
 * Pure: the points are derived from the facts handed in, and the score is the
 * same saturating formula the coherence headline uses, so one cause still weighs
 * once and a declared gap less than a detected one.
 */

/** One issue of the completeness audit, as the audit words it. */
export interface HealthAuditIssue {
	readonly code: string;
	readonly severity: 'blocking' | 'warning';
	readonly message: string;
	readonly path: string;
}

/** What the code says about one feature, from the last sync of the implementation index. */
export interface HealthFeatureCode {
	readonly featureId: string;
	readonly name: string;
	/** Actions the index located in the code. */
	readonly locatedActions: number;
	/** Located actions whose scenarios passed against the code. */
	readonly provenActions: number;
	/** Active criteria by their last result; null when the engine reports none. */
	readonly criteria: { readonly total: number; readonly verified: number; readonly failing: number } | null;
	/** The spec of the feature changed after its code was last synced. */
	readonly drifted: boolean;
}

/** A code-to-spec analysis that was started (sources or spans) and never finalized. */
export interface HealthOpenAnalysis {
	readonly featureId: string;
	readonly name: string;
	/** Elements still without a span. */
	readonly untraced: number;
}

export interface HealthFacts {
	/** The open coherence gaps, as the coherence analysis lists them. */
	readonly gaps: readonly Gap[];
	readonly audit: readonly HealthAuditIssue[];
	/** False while nothing is located in the code: code points then cost nothing (criterion 08324382). */
	readonly codeLinked: boolean;
	readonly features: readonly HealthFeatureCode[];
	readonly openAnalyses: readonly HealthOpenAnalysis[];
}

export interface ProjectHealth {
	readonly headline: CoherenceHeadline;
	/** Every open point, the coherence gaps first, then the audit and the code. */
	readonly points: readonly Gap[];
	/**
	 * The issues of the rules register whose fix waits for confirmation: listed
	 * apart, in no count of the headline and weighing nothing (criterion
	 * 2a55c3e7). Absent on a reading kept from before they were told apart.
	 */
	readonly toConfirm?: readonly Gap[];
	readonly codeLinked: boolean;
	/** The reading was taken before the formal proof of the current specification landed (criterion 5785c1fb). */
	readonly proofPending?: boolean;
}

/**
 * Audit issues that restate a reading the health already holds: the coherence
 * check of the completion report reads the coherence gaps, which are points on
 * their own.
 */
const RESTATED_AUDIT_CODES = new Set(['coherence-not-ready']);

/**
 * The audit issue that is Lyriks's bookkeeping, not a gap of the project: the
 * coverage audit was last run before the project changed. It still blocks the
 * finish (the completion gate wants a fresh audit), but on the health it is a
 * low point that never blocks: nothing is known to be wrong in the product.
 */
const AUDIT_STALE = 'audit-stale';
export const AUDIT_STALE_MEANING =
	"The coverage audit was last run before the project changed, so its verdict no longer speaks for the project as it stands. Nothing is known to be wrong in the product: Lyriks's own records are behind. It never blocks the health; finishing the project still needs a fresh audit.";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the two kinds of point Project health adds mean, on their type's hover (criterion 4996a6b4). */
export const COMPLETENESS_MEANING =
	'What the completeness audit flags: something the project needs is missing from the specification, or described too thinly to build from. Each point says what to add, and the audit runs again once it is filled.';
export const CODE_MEANING =
	'What the code says about the specification, once code is linked: an analysis left unfinished, code read against an older spec, criteria failing or without a result, located actions no passing run proved.';

function point(fields: Omit<Gap, 'provenance' | 'blocking'> & { blocking?: boolean }): Gap {
	return { provenance: 'detected', blocking: false, ...fields };
}

/** The audit issues as points: a blocking issue blocks, a warning weighs medium. */
export function auditPoints(issues: readonly HealthAuditIssue[]): Gap[] {
	return issues
		.filter((issue) => !RESTATED_AUDIT_CODES.has(issue.code))
		.map((issue, i) => {
			const stale = issue.code === AUDIT_STALE;
			const severity: GapSeverity = stale ? 'low' : issue.severity === 'blocking' ? 'high' : 'medium';
			return point({
				id: `audit:${issue.code}:${issue.path}:${i}`,
				severity,
				blocking: !stale && issue.severity === 'blocking',
				title: issue.message,
				detail: issue.message,
				...(stale
					? { kindLabel: 'Audit out of date', kindMeaning: AUDIT_STALE_MEANING, action: 'Ask your AI to run the coverage audit again' }
					: { kindLabel: 'Completeness', kindMeaning: COMPLETENESS_MEANING }),
				sourceStep: issue.path.split('.')[0] || 'scope',
				checkId: `audit.${issue.code}`,
				cause: `audit:${issue.code}:${issue.path}`
			});
		});
}

/** What the code says, as points. Proof and criteria count only once code is linked. */
export function codePoints(facts: Pick<HealthFacts, 'codeLinked' | 'features' | 'openAnalyses'>): Gap[] {
	const out: Gap[] = facts.openAnalyses.map((a) =>
		point({
			id: `code:analysis-open:${a.featureId}`,
			severity: 'high',
			blocking: true,
			title: `Analysis not finalized: ${a.name}`,
			detail: `This feature was read from the code, and its analysis was never finalized: ${plural(a.untraced, 'element')} still have no span to the code they come from, so nothing shows they were read rather than invented.`,
			action: 'Record the missing spans, then finalize the analysis',
			kindLabel: 'Code',
			kindMeaning: CODE_MEANING,
			sourceStep: 'features',
			featureRef: a.featureId,
			subject: a.name,
			checkId: 'code.analysis-open',
			cause: `analysis:${a.featureId}`
		})
	);
	if (!facts.codeLinked) return out;
	for (const f of facts.features) {
		if (f.drifted) {
			out.push(
				point({
					id: `code:drift:${f.featureId}`,
					severity: 'medium',
					title: `Code read against an older spec: ${f.name}`,
					detail: 'The specification of this feature changed after its code was last synced, so the code may no longer do what the spec now says.',
					action: 'Check the code against the spec, then sync the index',
					kindLabel: 'Code',
					kindMeaning: CODE_MEANING,
					sourceStep: 'features',
					featureRef: f.featureId,
					subject: f.name,
					checkId: 'code.drift',
					cause: `drift:${f.featureId}`
				})
			);
		}
		const failing = f.criteria?.failing ?? 0;
		if (failing > 0) {
			out.push(
				point({
					id: `code:criteria-failing:${f.featureId}`,
					severity: 'high',
					title: `Failing against the code: ${f.name}`,
					detail: `${failing === 1 ? 'One acceptance criterion' : `${failing} acceptance criteria`} of this feature failed the last time ${failing === 1 ? 'its test' : 'their tests'} ran against the code.`,
					action: 'Fix the code or the criterion, then record the new result',
					kindLabel: 'Code',
					kindMeaning: CODE_MEANING,
					sourceStep: 'features',
					featureRef: f.featureId,
					subject: f.name,
					checkId: 'code.criteria-failing',
					cause: `criteria-failing:${f.featureId}`
				})
			);
		}
		const unproven = f.locatedActions - f.provenActions;
		if (unproven > 0) {
			out.push(
				point({
					id: `code:unproven:${f.featureId}`,
					severity: 'low',
					title: `Not proven against the code: ${f.name}`,
					detail: `${unproven} of ${plural(f.locatedActions, 'located action')} have no passing scenario run against the code: the code is found, not shown to behave as specified.`,
					action: 'Run the exported scenarios against the code and bring the results back',
					kindLabel: 'Code',
					kindMeaning: CODE_MEANING,
					sourceStep: 'features',
					featureRef: f.featureId,
					subject: f.name,
					checkId: 'code.unproven',
					cause: `unproven:${f.featureId}`
				})
			);
		}
		const withoutResult = f.criteria ? f.criteria.total - f.criteria.verified - f.criteria.failing : 0;
		if (withoutResult > 0) {
			out.push(
				point({
					id: `code:criteria-unverified:${f.featureId}`,
					severity: 'low',
					title: `Criteria without a test result: ${f.name}`,
					detail: `${withoutResult} acceptance ${withoutResult === 1 ? 'criterion has' : 'criteria have'} no recorded test result.`,
					action: 'Record the test that checks each criterion and its result',
					kindLabel: 'Code',
					kindMeaning: CODE_MEANING,
					sourceStep: 'features',
					featureRef: f.featureId,
					subject: f.name,
					checkId: 'code.criteria-unverified',
					cause: `criteria-unverified:${f.featureId}`
				})
			);
		}
	}
	return out;
}

/**
 * The one health score and every point it is computed from. An issue whose fix
 * waits for confirmation is no point: it reads apart and weighs nothing until
 * someone confirms or reopens it (criterion 2a55c3e7).
 */
export function projectHealth(facts: HealthFacts): ProjectHealth {
	const toConfirm = facts.gaps.filter((g) => g.fixToConfirm);
	const points = [...facts.gaps.filter((g) => !g.fixToConfirm), ...auditPoints(facts.audit), ...codePoints(facts)];
	return { headline: coherenceHeadline(points), points, toConfirm, codeLinked: facts.codeLinked };
}

/**
 * The points in the order they cost the health: what blocks first, then the
 * heaviest, a cause counted once (its other gaps cost nothing and come after).
 */
export function pointsByCost(points: readonly Gap[]): Gap[] {
	const penalties = effectivePenalties(points);
	return points
		.map((gap, i) => ({ gap, cost: penalties[i] }))
		.sort((a, b) => Number(b.gap.blocking) - Number(a.gap.blocking) || b.cost - a.cost || a.gap.id.localeCompare(b.gap.id))
		.map((p) => p.gap);
}

/** The coverage row of one feature, as the implementation-coverage read keeps it. */
export interface HealthCoverageRow {
	readonly featureId: string;
	readonly found: number;
	readonly actions?: Readonly<Record<string, { readonly elements?: readonly { readonly kind: string; readonly location: unknown }[]; readonly provenAt?: string }>>;
	readonly criteria?: { readonly total: number; readonly verified: number; readonly failing: number };
	readonly updatedAt: string | null;
	readonly specUpdatedAt: string | null;
}

/**
 * What the code says about one feature. Located means the index found the
 * action itself, as the conformance reading counts it; drift means the spec
 * moved after the code was last synced against it.
 */
export function featureCodeOf(row: HealthCoverageRow, name: string): HealthFeatureCode {
	let locatedActions = 0;
	let provenActions = 0;
	for (const action of Object.values(row.actions ?? {})) {
		if (!(action.elements ?? []).some((e) => e.kind === 'action' && e.location !== null)) continue;
		locatedActions += 1;
		if (action.provenAt) provenActions += 1;
	}
	const drifted = row.found > 0 && !!row.updatedAt && !!row.specUpdatedAt && row.specUpdatedAt > row.updatedAt;
	return { featureId: row.featureId, name, locatedActions, provenActions, criteria: row.criteria ?? null, drifted };
}

/** How many points a reading outside the screen carries; `pointsTotal` keeps the count. */
const READ_POINTS = 50;

/**
 * The project health as an AI client reads it (criterion 7ae9b322): the same
 * score, word and counts the Overview shows, with the first points (the ones
 * that cost the health most first, criteria 96a3bc62 and 9eef1d63), how many
 * there are in all and how many fixes wait for confirmation.
 */
export function healthReading(health: ProjectHealth) {
	const { score, verdict, blocking, total } = health.headline;
	return {
		score,
		verdict,
		blocking,
		total,
		codeLinked: health.codeLinked,
		points: pointsByCost(health.points).slice(0, READ_POINTS).map((p) => ({
			id: p.id,
			title: p.title,
			severity: p.severity,
			blocking: p.blocking,
			kindLabel: p.kindLabel ?? 'Coherence',
			...(p.featureRef ? { featureRef: p.featureRef } : {})
		})),
		pointsTotal: health.points.length,
		fixesToConfirm: health.toConfirm?.length ?? 0
	};
}
