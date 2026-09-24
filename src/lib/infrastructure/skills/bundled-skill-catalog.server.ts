import type {
	InstalledSkillRef,
	Skill,
	SkillCatalogPort,
	SkillClientId,
	SkillSummary,
	SkillSyncOptions,
	SkillSyncResult
} from '$application/ports';
import { buildBinding, buildSkillCatalog, diffSkillCatalog } from './skill-catalog-build';
import bindingHookScript from './lyriks-bound-prompt.hook.mjs?raw';

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

/**
 * The helper scripts installed under `.lyriks/tools/`, inlined as raw text the
 * same way: they are shipped to the customer repository, never run here.
 */
const bundledTools = import.meta.glob('./tools/*.mjs', {
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

	syncSkills(installed: InstalledSkillRef[], client?: SkillClientId, projectId?: string, options?: SkillSyncOptions): SkillSyncResult {
		// The binding rides along on every sync: applying it is idempotent, and it
		// is what keeps the repository bound beyond this session (bundled hook
		// and helper scripts included, inlined at build time like the skills).
		return {
			...diffSkillCatalog(this.catalog, installed, client, options),
			binding: buildBinding(bindingHookScript, client, projectId, bundledTools, options?.installedTools)
		};
	}
}
