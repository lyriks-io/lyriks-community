import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';
import type { UnspaProjectSnapshot } from '$lib/unspa-schema';

describe('LocalFsBehaviorRepository filesystem boundary', () => {
	it('rejects project and feature identifiers that can escape the workspace', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		const repository = new LocalFsBehaviorRepository(root);

		await expect(repository.loadProject('../outside')).rejects.toThrow(/safe filesystem identifier/);
		await expect(repository.loadFeature('safe', '../outside')).rejects.toThrow(
			/safe filesystem identifier/
		);
		await expect(repository.deleteProject('..')).rejects.toThrow(/safe filesystem identifier/);
		expect(existsSync(join(root, '..', 'outside'))).toBe(false);
	});

	it('writes snapshot directories and files with owner-only permissions', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		const repository = new LocalFsBehaviorRepository(root);
		const snapshot = { project: { id: 'safe-project' } } as UnspaProjectSnapshot;

		await repository.saveProject(snapshot);

		const dir = join(root, 'safe-project');
		const file = join(dir, 'safe-project.project.json');
		expect(statSync(dir).mode & 0o777).toBe(0o700);
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	it('never re-chmods a pre-existing project directory (shared-volume safe)', async () => {
		// On enterprise installs `data/unspa` is shared between the platform and the
		// back, which may own a project's folder. The old write path chmod'd the dir
		// on EVERY write; a chmod by a non-owner throws EPERM and turned every
		// kernel-backed section save (features/data/experience) into an opaque 500.
		// We only touch perms on a dir we create — a pre-existing one is left as-is.
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		const repository = new LocalFsBehaviorRepository(root);
		const dir = join(root, 'shared-project');
		mkdirSync(dir, { mode: 0o755 }); // pre-created by another service, different mode

		await repository.saveProject({ project: { id: 'shared-project' } } as UnspaProjectSnapshot);

		// Dir mode untouched (old code forced 0o700); the write still landed.
		expect(statSync(dir).mode & 0o777).toBe(0o755);
		expect(existsSync(join(dir, 'shared-project.project.json'))).toBe(true);
	});
});
