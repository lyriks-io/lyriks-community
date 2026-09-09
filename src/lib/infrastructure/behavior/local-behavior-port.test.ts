import { describe, it, expect } from 'vitest';
import type { BehaviorRepositoryPort } from '$application/ports';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { LocalBehaviorPort } from './local-behavior-port.server';

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

const clock = { nowIso: () => '2026-01-01T00:00:00.000Z' };

describe('LocalBehaviorPort.apply (engine-off write path)', () => {
	it('creates a feature shell with the arrays the engine indexes on, and sets the project', async () => {
		const repo = new MemRepo();
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{ kind: 'upsertFeatureShell', featureId: 'f1', name: 'Invoice', description: 'd', tags: [{ type: 'core', value: 'Billing' }] },
			{ kind: 'setProjectFeatureIds', featureIds: ['f1'] },
			{ kind: 'setProjectTags', tags: [{ type: 'core', value: 'Billing' }] }
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect(feat.featureInvariants).toEqual([]); // absence crashes the OSS engine
		expect(feat.surfaces).toEqual([]);
		expect(feat.name).toBe('Invoice');

		const project = (await port.readProject('p1'))!.project;
		expect(project.featureIds).toEqual(['f1']);
		expect(project.tags).toEqual([{ type: 'core', value: 'Billing' }]);
	});

	it('preserves already-authored content on re-upsert (idempotent identity refresh)', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', {
			format: 'unspaghettit',
			version: 1,
			feature: { id: 'f1', name: 'Old', description: 'o', surfaces: [{ id: 's1' }], createdAt: 'orig', tags: [] }
		} as unknown as UnspaFeatureSnapshot);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{ kind: 'upsertFeatureShell', featureId: 'f1', name: 'New', description: 'n', tags: [{ type: 'mvp', value: 'must' }] }
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect(feat.surfaces).toEqual([{ id: 's1' }]); // preserved
		expect(feat.createdAt).toBe('orig'); // preserved
		expect(feat.name).toBe('New'); // refreshed
		expect(feat.tags).toEqual([{ type: 'mvp', value: 'must' }]);
	});

	it('renames, retags, and delists', async () => {
		const repo = new MemRepo();
		const port = new LocalBehaviorPort(repo, clock);
		await port.apply('p1', [
			{ kind: 'upsertFeatureShell', featureId: 'f1', name: 'A', description: '', tags: [] },
			{ kind: 'setProjectFeatureIds', featureIds: ['f1'] }
		]);

		await port.apply('p1', [{ kind: 'renameFeature', featureId: 'f1', name: 'Renamed' }]);
		await port.apply('p1', [{ kind: 'setFeatureTags', featureId: 'f1', tags: [{ type: 'core', value: 'X' }] }]);
		await port.apply('p1', [{ kind: 'removeFeature', featureId: 'f1' }]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect(feat.name).toBe('Renamed');
		expect(feat.tags).toEqual([{ type: 'core', value: 'X' }]);
		expect((await port.readProject('p1'))!.project.featureIds).toEqual([]); // delisted
	});

	it('mirrors a Core journey onto a leaf without erasing what unspa authored there', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'f1',
				name: 'Pin a conversation',
				surfaces: [
					{ id: 'fc4f27f2', name: 'Pinned conversations', actions: [{ id: 'a1', name: 'Pin' }] }
				],
				personas: [{ id: 'd1e2f3a4', name: 'Authored in unspa' }],
				events: [{ id: 'e1', name: 'chat.pinned' }]
			}
		} as unknown as UnspaFeatureSnapshot);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{
				kind: 'mirrorFeatureBehavior',
				featureId: 'f1',
				surfaces: [{ id: 'srf-journey-organize', name: 'Find & resume a chat', actions: [] }],
				personas: [{ id: 'per-free', name: 'Free Member' }],
				events: [{ id: 'e2', name: 'chat.resumed' }]
			}
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		const surfaces = feat.surfaces as Array<Record<string, unknown>>;
		expect(surfaces.map((s) => s.id)).toEqual(['srf-journey-organize', 'fc4f27f2']);
		expect(surfaces[1].actions).toHaveLength(1); // the authored action survives
		expect((feat.personas as Array<{ id: string }>).map((p) => p.id)).toEqual([
			'per-free',
			'd1e2f3a4' // engine-authored (minted hex id) — survives the mirror
		]);
		expect((feat.events as Array<{ name: string }>).map((e) => e.name)).toEqual([
			'chat.resumed',
			'chat.pinned'
		]);
	});

	it('mirrors data onto a leaf without erasing entities authored in unspa', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', {
			format: 'unspaghettit',
			version: 1,
			feature: { id: 'f1', name: 'Invoice', entities: [{ id: '9c8b7a6d', name: 'Dunning note' }] }
		} as unknown as UnspaFeatureSnapshot);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{
				kind: 'mirrorFeatureData',
				featureId: 'f1',
				entities: [{ id: 'ent-invoice', name: 'Invoice' }],
				resources: []
			}
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect((feat.entities as Array<{ id: string }>).map((e) => e.id)).toEqual([
			'ent-invoice',
			'9c8b7a6d' // engine-authored (minted hex id) — survives the mirror
		]);
	});

	it('updates the central data model without erasing engine-owned nodes', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/p1__data_model', {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'p1__data_model',
				entities: [{ id: '9c8b7a6d', namespace: 'EngineEntity', fields: [] }],
				resources: [{ id: 'a1b2c3d4', name: 'Engine queue' }]
			}
		} as unknown as UnspaFeatureSnapshot);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{
				kind: 'upsertDataModelFeature',
				featureId: 'p1__data_model',
				name: 'Data Model',
				description: '',
				tags: [],
				entities: [{ id: 'ent-customer', namespace: 'Customer', fields: [] }],
				resources: []
			}
		]);

		const feature = (await port.readFeature('p1', 'p1__data_model'))!.feature as Record<string, unknown>;
		expect((feature.entities as Array<{ id: string }>).map((entity) => entity.id)).toEqual([
			'ent-customer',
			'9c8b7a6d'
		]);
		expect((feature.resources as Array<{ id: string }>).map((resource) => resource.id)).toEqual([
			'a1b2c3d4'
		]);
	});

	it('prunes stale Lyriks-owned mirror entities and resources on an empty re-mirror', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'f1',
				name: 'Invoice',
				entities: [
					{ id: 'ent-invoice', name: 'Invoice' }, // stale Lyriks mirror — must go
					{ id: '9c8b7a6d', name: 'Dunning note' } // engine-authored — must stay
				],
				resources: [
					{ id: 'res-db-main', name: 'Main DB' }, // stale Lyriks mirror — must go
					{ id: 'a1b2c3d4', name: 'Legacy queue' } // engine-authored — must stay
				]
			}
		} as unknown as UnspaFeatureSnapshot);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{ kind: 'mirrorFeatureData', featureId: 'f1', entities: [], resources: [] }
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect((feat.entities as Array<{ id: string }>).map((e) => e.id)).toEqual(['9c8b7a6d']);
		expect((feat.resources as Array<{ id: string }>).map((r) => r.id)).toEqual(['a1b2c3d4']);
	});

	it('skips the write when a re-mirror changes nothing on the leaf', async () => {
		const repo = new MemRepo();
		const before = {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'f1',
				name: 'Invoice',
				updatedAt: 'untouched',
				entities: [{ id: 'ent-invoice', name: 'Invoice' }],
				resources: []
			}
		} as unknown as UnspaFeatureSnapshot;
		repo.features.set('p1/f1', before);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{
				kind: 'mirrorFeatureData',
				featureId: 'f1',
				entities: [{ id: 'ent-invoice', name: 'Invoice' }],
				resources: []
			}
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect(feat.updatedAt).toBe('untouched'); // no gratuitous churn on every leaf file
	});

	it('is a no-op on an empty batch', async () => {
		const repo = new MemRepo();
		const port = new LocalBehaviorPort(repo, clock);
		await port.apply('p1', []);
		expect(await port.readProject('p1')).toBeNull();
	});
});

describe('LocalBehaviorPort and per-element spec stamps', () => {
	/** A leaf as the engine leaves it: content plus a stamp per element. */
	const stampedLeaf = (): UnspaFeatureSnapshot =>
		({
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'f1',
				name: 'Invoice',
				description: 'd',
				surfaces: [],
				personas: [],
				resources: [],
				entities: [{ id: 'e1', name: 'Invoice' }],
				events: [],
				elementVersions: { 'entity:e1': '2026-01-01T00:00:00.000Z' },
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			}
		}) as unknown as UnspaFeatureSnapshot;

	const stampsOf = (repo: MemRepo) =>
		(repo.features.get('p1/f1')!.feature as { elementVersions?: unknown }).elementVersions;

	it('drops stamps it cannot recompute when a projection rewrites elements', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', stampedLeaf());
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{
				kind: 'mirrorFeatureData',
				featureId: 'f1',
				entities: [{ id: 'e1', name: 'Invoice', fields: [{ name: 'total' }] }],
				resources: []
			}
		] as never);

		// Falling back to the feature stamp is noisy; keeping a stamp that no
		// longer describes the entity would read as clean, which is worse.
		expect(stampsOf(repo)).toBeUndefined();
	});

	it('leaves them alone when the projection changes nothing', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', stampedLeaf());
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [
			{ kind: 'mirrorFeatureData', featureId: 'f1', entities: [{ id: 'e1', name: 'Invoice' }], resources: [] }
		] as never);

		expect(stampsOf(repo)).toEqual({ 'entity:e1': '2026-01-01T00:00:00.000Z' });
	});

	it('leaves them alone on a rename, which touches no element', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', stampedLeaf());
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [{ kind: 'renameFeature', featureId: 'f1', name: 'Invoicing' }] as never);

		expect(stampsOf(repo)).toEqual({ 'entity:e1': '2026-01-01T00:00:00.000Z' });
	});
});
