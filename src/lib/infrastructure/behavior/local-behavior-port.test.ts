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

	it('declares the cores in the engine registry, normalised, and keeps what the engine wrote', async () => {
		const repo = new MemRepo();
		const port = new LocalBehaviorPort(repo, clock);
		await port.apply('p1', [{ kind: 'setProjectFeatureIds', featureIds: [] }]);
		// Something only the engine writes, which a Lyriks save must not drop.
		const stored = (await port.readProject('p1'))!;
		await repo.saveProject({
			...stored,
			project: { ...stored.project, projectInvariants: [{ id: 'pi1' }] } as typeof stored.project
		});

		await port.apply('p1', [{ kind: 'setProjectCores', cores: [{ value: 'Billing', description: 'Money in.' }] }]);

		const project = (await port.readProject('p1'))!.project as unknown as Record<string, unknown>;
		expect(project.coreFeatures).toEqual([{ value: 'billing', description: 'Money in.' }]);
		expect(project.projectInvariants).toEqual([{ id: 'pi1' }]);
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
			{ kind: 'upsertFeatureShell', featureId: 'f1', name: 'New', description: 'n', tags: [{ type: 'family', value: 'Recurring' }] }
		]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect(feat.surfaces).toEqual([{ id: 's1' }]); // preserved
		expect(feat.createdAt).toBe('orig'); // preserved
		expect(feat.name).toBe('New'); // refreshed
		expect(feat.tags).toEqual([{ type: 'family', value: 'Recurring' }]);
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

	it('drops the reachability goals that named a state of a Lyriks surface the mirror removed', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'f1',
				name: 'Checkout',
				surfaces: [{ id: 'srf-journey-old', name: 'Old step', stateDefinitions: [{ id: 'sd1', path: 'cart.open' }] }],
				reachabilityGoals: [
					{ id: 'g-cart', condition: { left: 'cart.open', op: 'eq', right: true } },
					{ id: 'g-clock', condition: { left: 'clock.now', op: 'gt', right: 0 } }
				]
			}
		} as unknown as UnspaFeatureSnapshot);
		const port = new LocalBehaviorPort(repo, clock);

		await port.apply('p1', [{ kind: 'mirrorFeatureBehavior', featureId: 'f1', surfaces: [{ id: 'srf-journey-new', name: 'New step', actions: [] }], personas: [], events: [] }]);

		const feat = (await port.readFeature('p1', 'f1'))!.feature as Record<string, unknown>;
		expect((feat.surfaces as Array<{ id: string }>).map((s) => s.id)).toEqual(['srf-journey-new']);
		expect((feat.reachabilityGoals as Array<{ id: string }>).map((g) => g.id)).toEqual(['g-clock']);
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

	it('stamps the element a projection rewrites, and only that one', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', stampedLeaf());
		const port = new LocalBehaviorPort(repo, { nowIso: () => '2026-03-01T00:00:00.000Z' });

		await port.apply('p1', [
			{
				kind: 'mirrorFeatureData',
				featureId: 'f1',
				entities: [{ id: 'e1', name: 'Invoice', fields: [{ name: 'total' }] }],
				resources: []
			}
		] as never);

		// The rewritten entity reads as moved: a stamp that no longer describes it would read as clean.
		expect(stampsOf(repo)).toEqual({ 'entity:e1': '2026-03-01T00:00:00.000Z' });
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

describe('a write into the features dates only what it changes [criterion:ac-leaf-ac-trace-drift-own-change]', () => {
	const at = '2026-10-29T15:41:03.792Z';
	const db = (inTransit: boolean) => ({ id: 'res-db', name: 'Kutt database', kind: 'relational_db', encryptionInTransit: inTransit });
	/** A leaf as the engine leaves it, with a surface, an action, a rule and a database. */
	const leaf = (id: string, stamps: Record<string, string> | null): UnspaFeatureSnapshot =>
		({
			format: 'unspaghettit',
			version: 1,
			feature: {
				id,
				name: id,
				description: 'd',
				surfaces: [
					{
						id: 's1',
						name: 'Reset',
						stateDefinitions: [{ path: 'account.exists', type: 'boolean' }],
						actions: [{ id: 'a1', name: 'Ask for a reset link', rules: [{ id: 'r1', description: 'Rate limited' }], scenarios: [{ id: 'sc1', name: 'ok' }] }]
					}
				],
				personas: [],
				entities: [],
				events: [],
				resources: [db(false)],
				...(stamps ? { elementVersions: stamps } : {}),
				createdAt: '2026-10-27T14:05:44.728Z',
				updatedAt: '2026-10-27T14:05:44.728Z'
			}
		}) as unknown as UnspaFeatureSnapshot;
	const engineStamps = {
		'surface:s1': '2026-10-27T14:05:44.728Z',
		'state:account.exists': '2026-10-27T14:05:44.728Z',
		'action:a1': '2026-10-27T14:05:44.728Z',
		'rule:r1': '2026-10-28T09:00:00.000Z',
		'scenario:sc1': '2026-10-27T14:05:44.728Z',
		'resource:res-db': '2026-10-27T14:05:44.728Z'
	};
	const mirror = (featureId: string, inTransit: boolean) => ({ kind: 'mirrorFeatureData', featureId, entities: [], resources: [db(inTransit)] });
	const stampsOf = (repo: MemRepo, id: string) => (repo.features.get(`p1/${id}`)!.feature as { elementVersions?: Record<string, string> }).elementVersions;

	it('a mirror that changes one resource stamps only that resource', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', leaf('f1', engineStamps));
		await new LocalBehaviorPort(repo, { nowIso: () => at }).apply('p1', [mirror('f1', true)] as never);
		expect(stampsOf(repo, 'f1')).toEqual({ ...engineStamps, 'resource:res-db': at });
	});

	it('a feature the write leaves as it was keeps its stamps', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', leaf('f1', engineStamps));
		await new LocalBehaviorPort(repo, { nowIso: () => at }).apply('p1', [mirror('f1', false), { kind: 'renameFeature', featureId: 'f1', name: 'Reset a forgotten password' }] as never);
		expect(stampsOf(repo, 'f1')).toEqual(engineStamps);
	});

	it('a feature that never carried stamps is calibrated on its own last date, the changed element apart', async () => {
		const repo = new MemRepo();
		repo.features.set('p1/f1', leaf('f1', null));
		await new LocalBehaviorPort(repo, { nowIso: () => at }).apply('p1', [mirror('f1', true)] as never);
		const before = '2026-10-27T14:05:44.728Z';
		expect(stampsOf(repo, 'f1')).toEqual({
			'surface:s1': before,
			'state:account.exists': before,
			'action:a1': before,
			'rule:r1': before,
			'scenario:sc1': before,
			'resource:res-db': at
		});
	});
});
