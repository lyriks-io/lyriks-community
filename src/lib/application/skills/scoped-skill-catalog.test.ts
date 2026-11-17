import { describe, expect, it } from 'vitest';
import type { SkillCatalogPort } from '$lib/application/ports/skill-catalog';
import { EVOLUTION_SKILL_ID, scopedSkillCatalog } from './scoped-skill-catalog';

const skill = (id: string) => ({ id, name: id, contentHash: 'h', status: 'new' }) as never;
const catalog: SkillCatalogPort = {
	listSkills: () => [skill('lyriks-build'), skill(EVOLUTION_SKILL_ID)],
	getSkill: (id) => skill(id),
	syncSkills: () => ({ skills: [skill('lyriks-build'), skill(EVOLUTION_SKILL_ID)], unknown: [] })
};
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('scopedSkillCatalog', () => {
	it('leaves the Evolution playbook out of a Community installation', () => {
		const scoped = scopedSkillCatalog(catalog, () => 'community');
		expect(ids(scoped.listSkills())).toEqual(['lyriks-build']);
		expect(scoped.getSkill(EVOLUTION_SKILL_ID)).toBeNull();
		expect(ids(scoped.syncSkills([]).skills)).toEqual(['lyriks-build']);
	});
	it('serves the whole catalog to every other edition', () => {
		const scoped = scopedSkillCatalog(catalog, () => 'enterprise');
		expect(ids(scoped.listSkills())).toEqual(['lyriks-build', EVOLUTION_SKILL_ID]);
		expect(scoped.getSkill(EVOLUTION_SKILL_ID)).not.toBeNull();
		expect(ids(scopedSkillCatalog(catalog, () => undefined).syncSkills([]).skills)).toContain(EVOLUTION_SKILL_ID);
	});
});
