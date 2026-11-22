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
	it('does not restamp unchanged behavior when planning metadata is saved', async () => {
		let now = '2026-01-01T00:00:00.000Z';
		const mem = new MemRepo();
		const port = new LocalBehaviorPort(mem, { nowIso: () => now });
		const repo = new KernelFeaturesDraftRepository(port, new MemResidue(), legacyOf(null));
		await repo.save(sampleDraft('p1'));
		const feature = mem.features.get('p1/f1')!.feature as Record<string, unknown>;
		feature.elementVersions = { 'action:unchanged': { version: 'original' } };
		const before = structuredClone([...mem.features.entries()]);
		const draft = (await repo.load('p1'))!;
		draft.leafMeta ??= {};
		draft.leafMeta.f1 = { ...draft.leafMeta.f1, objective: 'Bill on time.', sourceIds: ['source-new'] };
		draft.lastSavedAt = now = '2026-01-02T00:00:00.000Z';
		await repo.save(draft);
		expect([...mem.features.entries()]).toEqual(before);
		expect((await repo.load('p1'))!.leafMeta?.f1.sourceIds).toEqual(['source-new']);

		draft.features[0].name = 'Updated invoice';
		await repo.save(draft);
		expect((mem.features.get('p1/f1')!.feature as Record<string, unknown>).updatedAt).toBe(now);
		expect((mem.features.get('p1/f2')!.feature as Record<string, unknown>).updatedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('round-trips a draft through the kernel + residue', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const back = await repo.load('p1');

		expect(back!.features.map((f) => f.id)).toEqual(['f1', 'f2']);
		expect(back!.cores).toEqual([{ id: 'core-bill', name: 'Billing', description: 'money', tone: 'invoicing' }]);
		const f1 = back!.features.find((f) => f.id === 'f1')!;
		expect(f1).toMatchObject({ coreId: 'core-bill', parentFamilyId: 'fam-rec', name: 'Invoice' });
		expect(back!.lastSavedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('keeps when each core feature and feature first entered the spec [criterion:2a6bff42]', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const first = (await repo.load('p1'))!.firstSeenAt!;
		expect(Object.keys(first).sort()).toEqual(['core-bill', 'f1', 'f2']);
		const next = sampleDraft('p1');
		next.features = [...next.features, { id: 'f3', name: 'Refund', coreId: 'core-bill', parentFamilyId: null, description: '', unspaghettitFeatureId: 'f3' }];
		next.features[0] = { ...next.features[0], name: 'Invoice, renamed' };
		await repo.save(next);
		const after = (await repo.load('p1'))!.firstSeenAt!;
		// A rename never moves it; the one added has its own.
		expect(after.f1).toBe(first.f1);
		expect(after.f3).toBeTruthy();
	});

	it('never makes new what a project held before moments were kept [criterion:2a6bff42]', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		// A residue written before firstSeenAt existed.
		const residue = (repo as unknown as { residue: { store: Map<string, Record<string, unknown>> } }).residue.store;
		const blob = residue.get('p1/features')!;
		delete blob.firstSeenAt;
		await repo.save(sampleDraft('p1'));
		expect((await repo.load('p1'))!.firstSeenAt).toEqual({ 'core-bill': '', f1: '', f2: '' });
	});

	it('writes real Unspaghettit feature shells to the kernel (not a draft blob)', async () => {
		const { mem, repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const shell = mem.features.get('p1/f1')!.feature as Record<string, unknown>;
		expect(shell.featureInvariants).toEqual([]);
		expect(shell.tags).toEqual(
			expect.arrayContaining([
				{ type: 'core', value: 'Billing' },
				{ type: 'family', value: 'Recurring' }
			])
		);
		for (const retired of ['phase', 'mvp']) expect(shell.tags).not.toContainEqual(expect.objectContaining({ type: retired }));
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
