import { describe, expect, it } from 'vitest';
import type { SkillCatalogPort } from '$lib/application/ports/skill-catalog';
import { BundledSkillCatalog } from '$lib/infrastructure/skills/bundled-skill-catalog.server';
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

describe('sync_skills on a Community installation (EVO-008)', () => {
	it('installs the waiting script and the session part of the instructions, the Evolution playbook left out [criterion:ac-leaf-7de9e4dc-80a7-4b51-9547-2d7137969c40]', () => {
		const synced = scopedSkillCatalog(new BundledSkillCatalog(), () => 'community').syncSkills([], 'claude', 'todomatic');
		expect(ids(synced.skills)).not.toContain(EVOLUTION_SKILL_ID);
		expect(ids(synced.skills).length).toBeGreaterThan(0);
		const wait = synced.binding?.tools.find((t) => t.path === '.lyriks/tools/await-event.mjs');
		expect(wait?.content).toContain('await_evolution_event');
		const [claude] = synced.binding?.targets ?? [];
		expect(claude.pointerBlock).toContain('`await-event.mjs`, run in the background, waits for the request page in a live Evolution session');
	});
});
