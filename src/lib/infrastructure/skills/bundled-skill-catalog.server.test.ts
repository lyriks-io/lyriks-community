import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BundledSkillCatalog } from './bundled-skill-catalog.server';
import { BINDING_TOOLS, PUBLISHED_SKILL_IDS } from './skill-catalog-build';

// The builder is tested on its own with hand-fed files. This proves the other
// half: that the adapter's build-time globs really pick the files up, which is
// the step that silently ships an appliance without them when a pattern is off.
describe('BundledSkillCatalog (what the build actually inlines)', () => {
	const catalog = new BundledSkillCatalog();

	it('bundles every published skill', () => {
		expect(catalog.listSkills().map((skill) => skill.id)).toEqual([...PUBLISHED_SKILL_IDS]);
	});

	it('returns the helper scripts on every sync, byte for byte as they are on disk', () => {
		const { binding } = catalog.syncSkills([], 'codex', 'vector-rally');
		expect(binding?.tools.map((tool) => tool.path)).toEqual(BINDING_TOOLS.map(({ file }) => `.lyriks/tools/${file}`));
		for (const tool of binding?.tools ?? []) {
			const onDisk = fileURLToPath(new URL(`./tools/${tool.path.split('/').pop()}`, import.meta.url));
			expect(tool.content).toBe(readFileSync(onDisk, 'utf8'));
		}
		// The newest script proves the glob still picks up a file added to the folder.
		expect(binding?.tools.map((tool) => tool.path)).toContain('.lyriks/tools/ingest-results.mjs');
		// Codex gets no hook, and still gets the scripts.
		expect(binding?.targets.map((target) => target.hook)).toEqual([undefined]);
	});
});
