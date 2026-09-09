import { mapLimit } from '$lib/shared/map-limit';
import type { BehaviorAdvisory, BehaviorRepositoryPort, UnspaghettitAdvisorPort } from '../ports';
import { isAuxFeatureId } from '../projection/aux-feature-ids';
import { SpecVersionMemo, specVersionOf } from '../spec-version-memo';

/**
 * Engine calls per pass. A feature whose spec has not moved since its last
 * verdict is served from memory and costs nothing, so the cap only bounds the
 * features that actually need the engine; the rest wait for the next refresh
 * (the cached advisor refreshes every minute), and the note says how many.
 */
const MAX_ENGINE_CALLS = 40;

/**
 * Verifications in flight at once. `verify` with model checking is the most
 * expensive call the engine takes, and the engine is one thread: two keep it
 * busy while the next leaf's stamp is read, more only lengthens the queue a
 * budget kill wipes out.
 */
const ENGINE_WIDTH = 2;

/**
 * Compute the behavior advisories for a project by running the Unspaghettit
 * verification surface over its features and distilling the failures into a flat
 * message list. HEAVY (spawns / drives the unspa engine per feature) — meant to
 * run in the background behind a cache, never on the request path (see
 * `CachedBehaviorAdvisor`).
 *
 * Scoped to the project's own unspa `featureIds` (from the behavior project
 * snapshot) so it never verifies a sibling project's features in the shared
 * workspace. A feature whose spec has not changed since its last verdict is
 * served from memory: after one full pass, a refresh only verifies what moved.
 */
export class ComputeBehaviorAdvisoriesUseCase {
	readonly #memo = new SpecVersionMemo<BehaviorAdvisory | null>();

	constructor(
		private readonly advisor: UnspaghettitAdvisorPort,
		private readonly behavior: BehaviorRepositoryPort
	) {}

	async execute(projectId: string): Promise<BehaviorAdvisory[]> {
		if (!this.advisor.available) return [];
		const project = await this.behavior.loadProject(projectId);
		// The aux "__experience"/"__data_model" features are derived projections —
		// spec-gapping them yields advisories nobody can act on from the board.
		const ids = (project?.project.featureIds ?? []).filter((fid) => !isAuxFeatureId(fid));
		if (ids.length === 0) return [];

		// Cheap local reads first: what is remembered for its current spec version
		// is served as is, and only what moved (or was never checked) goes to the
		// engine. Before this, the first 40 ids were verified on every pass and the
		// rest never, whatever their state: "limited to 40 of 55" was permanent.
		const remembered: BehaviorAdvisory[] = [];
		const pending: { fid: string; version: string | null }[] = [];
		for (const fid of ids) {
			const snapshot = await this.behavior.loadFeature(projectId, fid).catch(() => null);
			const version = specVersionOf(snapshot);
			const known = version ? this.#memo.get(`${projectId}/${fid}`, version) : undefined;
			if (known !== undefined) {
				if (known) remembered.push(known);
			} else pending.push({ fid, version: version || null });
		}
		const scoped = pending.slice(0, MAX_ENGINE_CALLS);
		const verified = await mapLimit(scoped, ENGINE_WIDTH, async ({ fid, version }) => {
			const advisory = await this.assess(fid);
			if (version) this.#memo.set(`${projectId}/${fid}`, version, advisory);
			return advisory;
		});
		const out = [...remembered, ...verified.filter((a): a is BehaviorAdvisory => a != null)];

		const skipped = pending.length - scoped.length;
		if (skipped > 0) {
			out.push({
				severity: 'low',
				code: 'capped',
				title: `${skipped} feature${skipped === 1 ? ' has' : 's have'} not been checked yet`,
				detail: `The behavior engine checks ${MAX_ENGINE_CALLS} features per pass; the rest are checked on the next refresh, about a minute later.`
			});
		}
		return out;
	}

	/**
	 * One feature → at most one advisory (its worst finding), or null when clean.
	 * Surfaces BOTH a failing verify verdict (invariant/scenario) AND critical spec
	 * gaps, so real warnings show even when the gated verdict passes.
	 */
	private async assess(featureId: string): Promise<BehaviorAdvisory | null> {
		const [verdict, specGaps] = await Promise.all([
			this.advisor.verify(featureId, { modelCheck: true }),
			this.advisor.getSpecGaps(featureId).catch(() => [])
		]);

		const failed = verdict != null && !verdict.passed;
		const critical = specGaps.filter((g) => g.severity === 'critical');
		if (!failed && critical.length === 0) return null;

		const name = verdict?.features[0]?.featureName ?? featureId;
		const bits: string[] = [];
		if ((verdict?.invariantViolations ?? 0) > 0)
			bits.push(`${verdict!.invariantViolations} invariant violation(s)`);
		if ((verdict?.scenariosFailed ?? 0) > 0)
			bits.push(`${verdict!.scenariosFailed} scenario(s) failing`);
		if (critical.length > 0) bits.push(`${critical.length} critical spec gap(s)`);

		const detail =
			[bits.join(', '), ...critical.slice(0, 2).map((g) => g.reason)]
				.filter(Boolean)
				.join(' · ') || 'The unspa engine flagged this feature as not yet verifiable.';

		const hasHardFailure = (verdict?.invariantViolations ?? 0) > 0 || (verdict?.scenariosFailed ?? 0) > 0;
		return {
			severity: hasHardFailure ? 'high' : 'medium',
			code: hasHardFailure ? 'verify' : 'specgap',
			featureId,
			featureName: name,
			title: hasHardFailure
				? `${name} contradicts its own invariants or scenarios`
				: `${name} has ${critical.length} critical spec gap${critical.length === 1 ? '' : 's'} to close`,
			detail,
			gaps: critical.map((g) => ({
				entityName: g.entityName,
				reason: g.reason,
				suggestedFix: g.suggestedFix
			}))
		};
	}
}
