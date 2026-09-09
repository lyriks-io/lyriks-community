import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';
import { LocalBehaviorPort } from './local-behavior-port.server';

const clock = { nowIso: () => '2026-01-01T00:00:00.000Z' };

/**
 * MAP proof: the behavior kernel is readable AND writable by the platform with the
 * unspa engine and the DPO turned OFF. This test spins up LocalBehaviorPort over a
 * real node:fs store in a temp dir — no unspa subprocess, no Lyriks-back, no HTTP —
 * and round-trips an edit. If this passes, the Minimal Autonomous Product can author
 * behavior standalone.
 */
describe('LocalBehaviorPort — MAP (engine-off) proof', () => {
	it('writes and reads the unspa-format kernel on real fs, no engines', async () => {
		const root = mkdtempSync(join(tmpdir(), 'kernel-'));
		const port = new LocalBehaviorPort(new LocalFsBehaviorRepository(root), clock);

		await port.apply('proj1', [
			{
				kind: 'upsertFeatureShell',
				featureId: 'feat1',
				name: 'Search',
				description: 'find things',
				tags: [{ type: 'core', value: 'Discovery' }]
			},
			{ kind: 'setProjectFeatureIds', featureIds: ['feat1'] },
			{ kind: 'setProjectTags', tags: [{ type: 'core', value: 'Discovery' }] }
		]);

		// The canonical files exist on disk in the Unspaghettit layout.
		expect(existsSync(join(root, 'proj1', 'proj1.project.json'))).toBe(true);
		expect(existsSync(join(root, 'proj1', 'feat1.feature.json'))).toBe(true);
		const onDisk = JSON.parse(readFileSync(join(root, 'proj1', 'feat1.feature.json'), 'utf8'));
		expect(onDisk.format).toBe('unspaghettit');
		expect(onDisk.feature.featureInvariants).toEqual([]);

		// Read back through the port.
		const feat = await port.readFeature('proj1', 'feat1');
		expect((feat!.feature as { name: string }).name).toBe('Search');
		const project = await port.readProject('proj1');
		expect(project!.project.featureIds).toEqual(['feat1']);
		expect(project!.project.tags).toEqual([{ type: 'core', value: 'Discovery' }]);
	});

	it('air-gap guard: the write path imports neither the unspa engine nor the back client', () => {
		for (const file of ['local-behavior-port.server.ts', 'local-fs-behavior-repository.server.ts']) {
			const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
			expect(src).not.toMatch(/unspaghettit/);
			expect(src).not.toMatch(/lyriks-back|http-lyriks-back-client|fetch\(/);
		}
	});
});
