import { computeRulesCoherence, type ProjectRulesDraft } from '$domain/rules';
import type {
	ClockPort,
	ExperienceDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	RulesDraftRepositoryPort,
	TelemetryPort,
	UsersDraftRepositoryPort
} from '../ports';
import { buildRuleInventory } from '../build-rule-inventory';

export interface SaveRulesDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
}

export class SaveRulesDraftUseCase {
	constructor(
		private readonly drafts: RulesDraftRepositoryPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly usersDrafts: UsersDraftRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort
	) {}

	async execute(draft: ProjectRulesDraft): Promise<SaveRulesDraftResult> {
		const savedAt = this.clock.nowIso();
		// Don't persist the recomputed inventory mirror — it's rebuilt on load.
		const stamped: ProjectRulesDraft = { ...draft, inventory: [], lastSavedAt: savedAt };
		await this.drafts.save(stamped);

		// Score against the SAME derived inventory a reload will show, not the
		// author's (correctly) empty mirror. The inventory is read-only and
		// consolidated from Steps 02/03/05, so an author who leaves it `[]` per the
		// guidance must not be dinged an "empty inventory" penalty they can't act on.
		const [definition, users, experience] = await Promise.all([
			this.definitionDrafts.load(draft.projectId),
			this.usersDrafts.load(draft.projectId),
			this.experienceDrafts.load(draft.projectId)
		]);
		const coherence = computeRulesCoherence({
			...draft,
			inventory: buildRuleInventory(definition, users, experience)
		});
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'rules.autosaved', savedAt });
		telemetry.emit({
			type: 'rules.local_coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message)
		};
	}
}
