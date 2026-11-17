import { createEmptyRulesDraft, type ProjectRulesDraft } from '$domain/rules';
import type {
	ExperienceDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	RulesDraftRepositoryPort,
	UsersDraftRepositoryPort
} from '../ports';
import { buildRuleInventory } from './build-rule-inventory';
import type { SpecLanguage } from '$domain/language';

/**
 * Loads the persisted Step 06 draft (or an empty one) and refreshes its
 * read-only `inventory` by consolidating the rules declared in Steps 02, 03
 * and 05. The inventory is never authored here — it is recomputed on every
 * load so it always mirrors the latest upstream declarations.
 */
export class LoadRulesDraftUseCase {
	constructor(
		private readonly drafts: RulesDraftRepositoryPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly usersDrafts: UsersDraftRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort,
		/** The spec's language, so the inventory reads in it (English when absent). */
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
	) {}

	async execute(projectId: string): Promise<ProjectRulesDraft> {
		const [existing, definition, users, experience, lang] = await Promise.all([
			this.drafts.load(projectId),
			this.definitionDrafts.load(projectId),
			this.usersDrafts.load(projectId),
			this.experienceDrafts.load(projectId),
			this.languageOf?.(projectId)
		]);
		const draft = existing ?? createEmptyRulesDraft(projectId);
		const inventory = buildRuleInventory(definition, users, experience, lang ?? 'en');
		return { ...draft, inventory };
	}
}
