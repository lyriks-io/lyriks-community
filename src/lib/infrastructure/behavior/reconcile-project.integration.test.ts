import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackLinkRepositoryPort, ClockPort } from '$application/ports';
import { ReconcileProjectUseCase } from '$application/use-cases/reconcile-project';
import { FsProjectLock } from './fs-project-lock.server';
import { FsReconciliationStore } from './fs-reconciliation-store.server';

let root: string;
const clock: ClockPort = { nowIso: () => '2026-07-21T00:00:00.000Z' } as ClockPort;

function backLinksSpy() {
	const markStatus = vi.fn(async () => {});
	const links: BackLinkRepositoryPort = {
		find: async () => null,
		save: async () => {},
		markStatus,
		nextEnvelopeVersion: async () => null
	};
	return { links, markStatus };
}

function writeFolder(folderKey: string, projectId: string, features: string[]) {
	const dir = join(root, folderKey);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${projectId}.project.json`),
		JSON.stringify({ format: 'unspaghettit-project', version: 1, project: { id: projectId, name: projectId, featureIds: features } })
	);
	for (const f of features) {
		writeFileSync(join(dir, `${f}.feature.json`), JSON.stringify({ format: 'unspaghettit', version: 1, feature: { id: f, name: f } }));
	}
}

function useCase(links: BackLinkRepositoryPort) {
	return new ReconcileProjectUseCase(
		new FsReconciliationStore(root),
		new FsProjectLock(root, { retryMs: 5, maxWaitMs: 500 }),
		links,
		clock
	);
}

function featureIdsIn(folderKey: string): string[] {
	const dir = join(root, folderKey);
	return readdirSync(dir)
		.filter((n) => n.endsWith('.feature.json'))
		.map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')).feature.id)
		.sort();
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'reconcile-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('ReconcileProjectUseCase (real FS adapters)', () => {
	it('dry-runs by default: produces a plan and writes nothing', async () => {
		writeFolder('uuid', 'uuid', ['f1']);
		writeFolder('slug', 'slug', ['f2']);
		const { links, markStatus } = backLinksSpy();

		const result = await useCase(links).execute({ projectId: 'proj', canonicalKernelId: 'uuid', sourceFolderKeys: ['uuid', 'slug'] });

		expect(result.applied).toBe(false);
		expect(result.status).toBe('auto-resolvable');
		expect(existsSync(join(root, 'slug'))).toBe(true); // untouched
		expect(featureIdsIn('uuid')).toEqual(['f1']); // untouched
		expect(markStatus).not.toHaveBeenCalled();
	});

	it('applies an auto-resolvable twin: merges into canonical, quarantines the loser, heals the link', async () => {
		writeFolder('uuid', 'uuid', ['f1']);
		writeFolder('slug', 'slug', ['f2']);
		const { links, markStatus } = backLinksSpy();

		const result = await useCase(links).execute({
			projectId: 'proj',
			canonicalKernelId: 'uuid',
			sourceFolderKeys: ['uuid', 'slug'],
			apply: true
		});

		expect(result.applied).toBe(true);
		expect(featureIdsIn('uuid')).toEqual(['f1', 'f2']); // merged
		const manifest = JSON.parse(readFileSync(join(root, 'uuid', 'uuid.project.json'), 'utf8'));
		expect(manifest.project.featureIds).toEqual(['f1', 'f2']);
		expect(manifest.project.id).toBe('uuid');

		// loser is quarantined (recoverable), not deleted
		expect(existsSync(join(root, 'slug'))).toBe(false);
		const stamp = readdirSync(join(root, '.quarantine'))[0];
		expect(existsSync(join(root, '.quarantine', stamp, 'slug'))).toBe(true);
		expect(existsSync(join(root, '.quarantine', stamp, 'uuid.pre-reconcile'))).toBe(true); // pre-state backed up

		expect(markStatus).toHaveBeenCalledWith('proj', 'linked');
	});

	it('refuses to apply when there is a real conflict — writes nothing', async () => {
		const dirA = join(root, 'uuid');
		mkdirSync(dirA, { recursive: true });
		writeFileSync(join(dirA, 'uuid.project.json'), JSON.stringify({ format: 'unspaghettit-project', version: 1, project: { id: 'uuid', name: 'uuid', featureIds: ['f1'] } }));
		writeFileSync(join(dirA, 'f1.feature.json'), JSON.stringify({ format: 'unspaghettit', version: 1, feature: { id: 'f1', v: 1 } }));
		const dirB = join(root, 'slug');
		mkdirSync(dirB, { recursive: true });
		writeFileSync(join(dirB, 'slug.project.json'), JSON.stringify({ format: 'unspaghettit-project', version: 1, project: { id: 'slug', name: 'slug', featureIds: ['f1'] } }));
		writeFileSync(join(dirB, 'f1.feature.json'), JSON.stringify({ format: 'unspaghettit', version: 1, feature: { id: 'f1', v: 2 } }));
		const { links, markStatus } = backLinksSpy();

		const result = await useCase(links).execute({
			projectId: 'proj',
			canonicalKernelId: 'uuid',
			sourceFolderKeys: ['uuid', 'slug'],
			apply: true
		});

		expect(result.applied).toBe(false);
		expect(result.status).toBe('conflicts');
		expect(existsSync(join(root, 'slug'))).toBe(true);
		expect(existsSync(join(root, '.quarantine'))).toBe(false);
		expect(markStatus).not.toHaveBeenCalled();
	});

	it('serializes concurrent reconciles of the same project under the lock', async () => {
		writeFolder('uuid', 'uuid', ['f1']);
		writeFolder('slug', 'slug', ['f2']);
		const { links } = backLinksSpy();
		const uc = useCase(links);
		const [a, b] = await Promise.all([
			uc.execute({ projectId: 'proj', canonicalKernelId: 'uuid', sourceFolderKeys: ['uuid', 'slug'], apply: true }),
			uc.execute({ projectId: 'proj', canonicalKernelId: 'uuid', sourceFolderKeys: ['uuid', 'slug'], apply: true })
		]);
		// Both complete without corrupting the store; the canonical folder is intact.
		expect([a.applied, b.applied]).toContain(true);
		expect(featureIdsIn('uuid').length).toBeGreaterThanOrEqual(1);
		expect(existsSync(join(root, '.locks', 'proj'))).toBe(false); // lock released
	});
});
