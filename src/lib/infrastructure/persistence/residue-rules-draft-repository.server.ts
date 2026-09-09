import type {
	BehaviorPort,
	ProjectResidueRepositoryPort,
	RulesDraftRepositoryPort
} from '$application/ports';
import {
	buildRulesProjection,
	rulesAcceptanceOps,
	rulesResidueFromDraft,
	type RulesResidue
} from '$application/projection/rules-projection';
import type { ProjectRulesDraft } from '$domain/rules';

const SECTION = 'rules';

/**
 * The Rules section (Step 06), backed by the generalized project-residue store
 * instead of a bespoke draft table (Phase 3 of unify-unspa-kernel). Satisfies
 * the same `RulesDraftRepositoryPort` every consumer depends on, so swapping it in at
 * the composition root flips the section with no consumer churn.
 *
 * The issue-analysis facet lives in the residue; the **behavioral half** is the Step-06
 * edge cases, projected on save into the kernel as prose `acceptanceCriteria` on the
 * central "Experience" feature. The op
 * patches an existing feature only, so it is a no-op before Experience is saved. A
 * one-shot, idempotent backfill seeds the residue from the legacy section document on first
 * read so the flip never blanks an existing project. `inventory` stays derived.
 */
export class ResidueRulesDraftRepository implements RulesDraftRepositoryPort {
	constructor(
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly behavior: BehaviorPort,
		/** Legacy section store, read once to migrate a pre-residue project. */
		private readonly legacy: RulesDraftRepositoryPort
	) {}

	async load(projectId: string): Promise<ProjectRulesDraft | null> {
		let residue = (await this.residue.load(projectId, SECTION)) as RulesResidue | null;

		// First-read migration: an existing project with authored content but no residue
		// yet gets seeded from its legacy draft (idempotent once the residue exists).
		if (residue === null) {
			const legacy = await this.legacy.load(projectId);
			if (legacy && (legacy.issues.length > 0 || legacy.scenarios.length > 0)) {
				await this.save(legacy);
				residue = (await this.residue.load(projectId, SECTION)) as RulesResidue | null;
			}
		}

		if (residue === null) return null; // nothing authored yet
		return buildRulesProjection(projectId, residue);
	}

	async save(draft: ProjectRulesDraft): Promise<void> {
		await this.residue.save(draft.projectId, SECTION, rulesResidueFromDraft(draft));
		// Project the edge cases into the kernel as acceptance criteria (no-op until the
		// Experience feature exists; merges, never clobbers).
		await this.behavior.apply(draft.projectId, rulesAcceptanceOps(draft.projectId, draft));
	}
}
