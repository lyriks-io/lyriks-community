import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsReconciliationStore } from './fs-reconciliation-store.server';

/**
 * Folder keys and feature ids come from model data and become file names: the
 * store writes and reads under its own root only, whatever they say.
 */

function sandbox() {
	const outside = mkdtempSync(join(tmpdir(), 'lyriks-reconcile-'));
	const root = join(outside, 'unspa');
	return { outside, root, store: new FsReconciliationStore(root) };
}

const UNSAFE = ['', '.', '..', 'a/b', '../escape', 'a\\b', 'nul\0byte', 'x'.repeat(256)];

describe('the reconciliation store', () => {
	it('refuses a feature id that is not a plain file name, and writes nothing anywhere', async () => {
		for (const id of UNSAFE) {
			const { outside, root, store } = sandbox();
			await expect(
				store.promoteCanonical({ canonicalKernelId: 'p1', project: { id: 'p1' }, features: [{ id }], quarantineStamp: 's1', artifacts: [] }),
				JSON.stringify(id)
			).rejects.toThrow(/featureId is not a safe filesystem identifier/);
			expect(readdirSync(outside), JSON.stringify(id)).toEqual(['unspa']);
			expect(existsSync(join(root, 'p1')), JSON.stringify(id)).toBe(false);
		}
	});

	it('refuses a folder key that is not a plain directory name, before reading or moving anything', async () => {
		for (const key of UNSAFE) {
			const { store } = sandbox();
			await expect(store.loadCandidates([key]), JSON.stringify(key)).rejects.toThrow(/folderKey/);
			await expect(store.quarantine(key, 's1'), JSON.stringify(key)).rejects.toThrow(/folderKey/);
		}
	});

	it('writes a plain id under its own folder', async () => {
		const { root, store } = sandbox();
		await store.promoteCanonical({ canonicalKernelId: 'p1', project: { id: 'p1', name: 'Ledger' }, features: [{ id: 'f-1' }], quarantineStamp: 's1', artifacts: [] });
		expect(readdirSync(join(root, 'p1')).sort()).toEqual(['f-1.feature.json', 'p1.project.json'].sort());
		const [folder] = await store.loadCandidates(['p1']);
		expect(folder.project).toMatchObject({ name: 'Ledger' });
	});
});
