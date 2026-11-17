import { evolutionAccess } from '$domain/licensing';
import type { SkillCatalogPort } from '$lib/application/ports/skill-catalog';

/** The playbook that drives Evolution requests, which Community does not hold. */
export const EVOLUTION_SKILL_ID = 'lyriks-evolution';

/**
 * The skill catalog as the installation's edition holds it: on Community, where
 * Evolutions are locked, the Evolution playbook is neither listed, read nor
 * installed, so an AI client is never taught a workflow every call of which
 * would be refused. Every other edition sees the whole catalog.
 */
export function scopedSkillCatalog(catalog: SkillCatalogPort, edition: () => string | null | undefined): SkillCatalogPort {
	const hidden = (id: string) => id === EVOLUTION_SKILL_ID && !evolutionAccess(edition()).ok;
	return {
		listSkills: () => catalog.listSkills().filter((s) => !hidden(s.id)),
		getSkill: (id) => (hidden(id) ? null : catalog.getSkill(id)),
		syncSkills: (installed, client, projectId, options) => {
			const result = catalog.syncSkills(installed, client, projectId, options);
			return { ...result, skills: result.skills.filter((s) => !hidden(s.id)) };
		}
	};
}
