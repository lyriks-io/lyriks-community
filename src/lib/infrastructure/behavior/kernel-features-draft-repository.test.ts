import { describe, it, expect } from 'vitest';
import type { BehaviorRepositoryPort, FeaturesDraftRepositoryPort, ProjectResidueRepositoryPort } from '$application/ports';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalBehaviorPort } from './local-behavior-port.server';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';
import { KernelFeaturesDraftRepository } from './kernel-features-draft-repository.server';

class MemRepo implements BehaviorRepositoryPort {
	projects = new Map<string, UnspaProjectSnapshot>();
	features = new Map<string, UnspaFeatureSnapshot>();
	async loadProject(id: string) {
		return this.projects.get(id) ?? null;
	}
	async saveProject(s: UnspaProjectSnapshot) {
		this.projects.set(s.project.id, s);
	}
	async loadFeature(pid: string, fid: string) {
		return this.features.get(`${pid}/${fid}`) ?? null;
	}
	async saveFeature(pid: string, s: UnspaFeatureSnapshot) {
		this.features.set(`${pid}/${(s.feature as { id: string }).id}`, s);
	}
	async deleteProject() {}
	workspaceRoot() {
		return '/mem';
	}
}

class MemResidue implements ProjectResidueRepositoryPort {
	store = new Map<string, unknown>();
	async load(projectId: string, section: string) {
		return this.store.get(`${projectId}/${section}`) ?? null;
	}
	async save(projectId: string, section: string, payload: unknown) {
		this.store.set(`${projectId}/${section}`, payload);
	}
}

const legacyOf = (draft: ProjectFeaturesDraft | null): FeaturesDraftRepositoryPort => ({
	load: async () => draft,
	save: async () => {}
});

function sampleDraft(projectId: string): ProjectFeaturesDraft {
	const d = createEmptyFeaturesDraft(projectId);
	d.cores = [{ id: 'core-bill', name: 'Billing', description: 'money', tone: 'invoicing' }];
	d.families = [{ id: 'fam-rec', name: 'Recurring', coreId: 'core-bill', parentFamilyId: null, description: '' }];
	d.features = [
		{ id: 'f1', name: 'Invoice', coreId: 'core-bill', parentFamilyId: 'fam-rec', description: 'bill', unspaghettitFeatureId: 'f1' },
		{ id: 'f2', name: 'Dunning', coreId: 'core-bill', parentFamilyId: null, description: '', unspaghettitFeatureId: 'f2' }
	];
	d.releases = [{ id: 'rel-1', name: 'MVP', version: 'V1', weekStart: 1, weekEnd: 6, order: 0, description: '' }];
	d.mvpAssignments = [{ featureId: 'f1', tier: 'must' }];
	d.roadmapAssignments = [{ featureId: 'f1', releaseId: 'rel-1' }];
	d.lastSavedAt = '2026-01-01T00:00:00.000Z';
	return d;
}

function makeRepo(legacy: ProjectFeaturesDraft | null = null) {
	const mem = new MemRepo();
	const port = new LocalBehaviorPort(mem, { nowIso: () => '2026-01-01T00:00:00.000Z' });
	const residue = new MemResidue();
	return { mem, repo: new KernelFeaturesDraftRepository(port, residue, legacyOf(legacy)) };
}

describe('KernelFeaturesDraftRepository (Phase 1 Features flip)', () => {
	it('round-trips a draft through the kernel + residue', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const back = await repo.load('p1');

		expect(back!.features.map((f) => f.id)).toEqual(['f1', 'f2']);
		expect(back!.cores).toEqual([{ id: 'core-bill', name: 'Billing', description: 'money', tone: 'invoicing' }]);
		const f1 = back!.features.find((f) => f.id === 'f1')!;
		expect(f1).toMatchObject({ coreId: 'core-bill', parentFamilyId: 'fam-rec', name: 'Invoice' });
		expect(back!.mvpAssignments).toEqual([{ featureId: 'f1', tier: 'must' }]);
		expect(back!.roadmapAssignments).toEqual([{ featureId: 'f1', releaseId: 'rel-1' }]);
		expect(back!.lastSavedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('writes real Unspaghettit feature shells to the kernel (not a draft blob)', async () => {
		const { mem, repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const shell = mem.features.get('p1/f1')!.feature as Record<string, unknown>;
		expect(shell.featureInvariants).toEqual([]);
		expect(shell.tags).toEqual(
			expect.arrayContaining([
				{ type: 'core', value: 'Billing' },
				{ type: 'family', value: 'Recurring' },
				{ type: 'mvp', value: 'must' },
				{ type: 'phase', value: 'V1' }
			])
		);
		expect(mem.projects.get('p1')!.project.featureIds).toEqual(['f1', 'f2']);
	});

	it('backfills from the legacy SQLite draft on first read', async () => {
		const { mem, repo } = makeRepo(sampleDraft('p1'));
		expect(mem.projects.size).toBe(0); // kernel empty before read
		const back = await repo.load('p1');
		expect(back!.features.map((f) => f.id)).toEqual(['f1', 'f2']); // projected from seeded kernel
		expect(mem.projects.get('p1')!.project.featureIds).toEqual(['f1', 'f2']); // seeded
	});

	it('MAP end-to-end: a save writes real .feature.json shells on fs, engine-off, and loads back', async () => {
		const root = mkdtempSync(join(tmpdir(), 'kfeat-'));
		const port = new LocalBehaviorPort(new LocalFsBehaviorRepository(root), { nowIso: () => '2026-01-01T00:00:00.000Z' });
		const repo = new KernelFeaturesDraftRepository(port, new MemResidue(), legacyOf(null));

		await repo.save(sampleDraft('p1'));
		expect(existsSync(join(root, 'p1', 'p1.project.json'))).toBe(true);
		expect(existsSync(join(root, 'p1', 'f1.feature.json'))).toBe(true);

		const back = await repo.load('p1');
		expect(back!.features.map((f) => f.id)).toEqual(['f1', 'f2']);
		expect(back!.features.find((f) => f.id === 'f1')!.coreId).toBe('core-bill');
	});

	it('preserves aux features (Data Model / Experience) in the project featureIds', async () => {
		const { mem, repo } = makeRepo();
		// Pre-seed the kernel project with an aux feature (as sync-data would).
		mem.projects.set('p1', {
			format: 'unspaghettit-project',
			version: 1,
			project: { id: 'p1', name: 'p1', description: '', tags: [], featureIds: ['p1__data_model'], createdAt: 'x', updatedAt: 'x' }
		});
		await repo.save(sampleDraft('p1'));
		expect(mem.projects.get('p1')!.project.featureIds).toEqual(['f1', 'f2', 'p1__data_model']);
		// The projection excludes aux from the leaf set.
		const back = await repo.load('p1');
		expect(back!.features.map((f) => f.id)).toEqual(['f1', 'f2']);
	});
});
