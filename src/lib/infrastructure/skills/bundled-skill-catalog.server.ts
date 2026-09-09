import type {
	InstalledSkillRef,
	Skill,
	SkillCatalogPort,
	SkillClientId,
	SkillSummary,
	SkillSyncResult
} from '$application/ports';
import { buildSkillCatalog, diffSkillCatalog } from './skill-catalog-build';

/**
 * Skill catalog bundled at BUILD time: Vite inlines every SKILL.md under
 * .claude/skills/ into the server bundle (root-relative glob), so the Docker
 * appliance serves them with zero filesystem or network access at runtime —
 * the air-gap posture is untouched. Filtering to the published allowlist,
 * frontmatter parsing and the per-runtime install layouts live in
 * skill-catalog-build (pure, tested).
 */
const bundledFiles = import.meta.glob('/.claude/skills/*/SKILL.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export class BundledSkillCatalog implements SkillCatalogPort {
	private readonly catalog: Skill[] = buildSkillCatalog(bundledFiles);

	listSkills(): SkillSummary[] {
		return this.catalog.map(({ id, name, description, sizeBytes, contentHash }) => ({
			id,
			name,
			description,
			sizeBytes,
			contentHash
		}));
	}

	getSkill(id: string): Skill | null {
		return this.catalog.find((skill) => skill.id === id) ?? null;
	}

	syncSkills(installed: InstalledSkillRef[], client?: SkillClientId): SkillSyncResult {
		return diffSkillCatalog(this.catalog, installed, client);
	}
}
