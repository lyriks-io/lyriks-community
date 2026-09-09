import { describe, it, expect } from 'vitest';
import type {
	BehaviorRepositoryPort,
	DataDraftRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	ProjectResidueRepositoryPort,
	UsersDraftRepositoryPort
} from '$application/ports';
import {
	createEmptyExperienceDraft,
	createJourney,
	createStep,
	type ProjectExperienceDraft
} from '$domain/experience';
import { createEmptyDataDraft, type ProjectDataDraft } from '$domain/data';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import { createEmptyUsersDraft, createRole, type ProjectUsersDraft } from '$domain/users';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalBehaviorPort } from './local-behavior-port.server';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';
import { KernelExperienceDraftRepository } from './kernel-experience-draft-repository.server';

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

const stubExperience = (d: ProjectExperienceDraft | null = null): ExperienceDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});
const stubFeatures = (d: ProjectFeaturesDraft | null = null): FeaturesDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});
const stubUsers = (d: ProjectUsersDraft | null = null): UsersDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});
const stubData = (d: ProjectDataDraft | null = null): DataDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});
const stubDefinition = (): FoundationDefinitionRepositoryPort => ({
	load: async () => null,
	save: async () => {}
});

function sampleDraft(projectId = 'p1'): ProjectExperienceDraft {
	const draft = createEmptyExperienceDraft(projectId);
	draft.journeys = [createJourney('coreA', 0, { id: 'J1', name: 'Checkout', actorRoleIds: ['R1'] })];
	draft.steps = [
		createStep('J1', 0, { id: 'S1', name: 'Open cart' }),
		createStep('J1', 1, { id: 'S2', name: 'Pay' })
	];
	return draft;
}

function usersWith(): ProjectUsersDraft {
	return { ...createEmptyUsersDraft('p1'), roles: [createRole({ id: 'R1', name: 'Shopper' })] };
}

function featuresWithLeaf(): ProjectFeaturesDraft {
	const f = createEmptyFeaturesDraft('p1');
	f.cores = [{ id: 'coreA', name: 'Core A', description: '', tone: 'custom' }];
	f.features = [
		{ id: 'leaf1', name: 'L1', coreId: 'coreA', parentFamilyId: null, description: '', unspaghettitFeatureId: 'leaf1' }
	];
	return f;
}

function makeRepo(opts: {
	legacy?: ProjectExperienceDraft | null;
	users?: ProjectUsersDraft | null;
	features?: ProjectFeaturesDraft | null;
	data?: ProjectDataDraft | null;
} = {}) {
	const mem = new MemRepo();
	const port = new LocalBehaviorPort(mem, { nowIso: () => '2026-01-01T00:00:00.000Z' });
	const residue = new MemResidue();
	const repo = new KernelExperienceDraftRepository(
		port,
		residue,
		stubFeatures(opts.features ?? null),
		stubUsers(opts.users ?? usersWith()),
		stubExperience(opts.legacy ?? null),
		opts.data !== undefined ? () => stubData(opts.data ?? null) : undefined,
		opts.data !== undefined ? stubDefinition() : undefined
	);
	return { mem, residue, repo };
}

/** A data draft with one "Cart" entity on a database — the mirror source for #5. */
function dataWithCart(projectId = 'p1'): ProjectDataDraft {
	const d = createEmptyDataDraft(projectId);
	d.hosts = [{ id: 'h1', name: 'AWS', kind: 'cloud', provider: 'AWS', region: 'eu', description: '' }];
	d.databases = [{ id: 'db1', hostId: 'h1', name: 'Core DB', engine: 'postgres', description: '' }];
	d.entities = [
		{ id: 'e-cart', name: 'Cart', databaseId: 'db1', description: 'Shopping cart', derivedFrom: 'manual', sourceRefId: null }
	];
	return d;
}

/** Seed the leaf feature shell in the kernel — in a real project the Features save
 *  creates it before Experience/Data ever mirror into it. */
function seedLeafShell(mem: MemRepo): void {
	mem.features.set('p1/leaf1', {
		format: 'unspaghettit',
		version: 1,
		feature: {
			id: 'leaf1',
			name: 'L1',
			surfaces: [],
			personas: [],
			entities: [],
			resources: [],
			featureInvariants: []
		}
	} as UnspaFeatureSnapshot);
}

describe('KernelExperienceDraftRepository (Phase 4 Experience flip)', () => {
	it('round-trips journeys/steps through the kernel + residue', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const back = (await repo.load('p1'))!;
		expect(back.journeys.map((j) => ({ id: j.id, name: j.name, coreId: j.coreId }))).toEqual([
			{ id: 'J1', name: 'Checkout', coreId: 'coreA' }
		]);
		expect(back.steps.map((s) => s.id)).toEqual(['S1', 'S2']);
	});

	it('writes the central Experience feature and lists it in the project', async () => {
		const { mem, repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		const feat = mem.features.get('p1/p1__experience')!.feature as Record<string, unknown>;
		expect(feat.name).toBe('Experience');
		const surfaces = feat.surfaces as { id: string; type: string }[];
		expect(surfaces.find((s) => s.id === 'srf-J1')?.type).toBe('workflow');
		expect(mem.projects.get('p1')!.project.featureIds).toContain('p1__experience');
	});

	it('types a simulator seed from the leaf feature that declares the state', async () => {
		const { mem, repo } = makeRepo({ features: featuresWithLeaf() });
		mem.features.set('p1/leaf1', {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'leaf1',
				name: 'L1',
				surfaces: [
					{
						id: 'c0ffee01',
						name: 'Cart',
						type: 'screen',
						stateDefinitions: [
							{ id: 'd1', path: 'cart.count', type: 'number', defaultValue: 0 },
							{ id: 'd2', path: 'cart.mode', type: 'enum', enumValues: ['open', 'closed'], defaultValue: 'closed' }
						],
						actions: []
					}
				],
				personas: [],
				entities: [],
				resources: [],
				featureInvariants: []
			}
		} as UnspaFeatureSnapshot);
		const draft = sampleDraft('p1');
		draft.builder = {
			...draft.builder,
			screenRoots: { scr1: 'root-scr1' },
			entryScreenId: 'scr1',
			nodes: {},
			stateSeeds: [
				{ path: 'cart.count', value: '2' },
				{ path: 'cart.mode', value: 'open' }
			]
		};
		await repo.save(draft);
		const feat = mem.features.get('p1/p1__experience')!.feature as {
			surfaces: { id: string; stateDefinitions: Record<string, unknown>[] }[];
		};
		const defs = feat.surfaces.find((s) => s.id === 'srf-screen-scr1')!.stateDefinitions;
		expect(defs.find((d) => d.path === 'cart.count')).toMatchObject({ type: 'number', defaultValue: 2 });
		expect(defs.find((d) => d.path === 'cart.mode')).toMatchObject({
			type: 'enum',
			enumValues: ['open', 'closed'],
			defaultValue: 'open'
		});
	});

	it('does not copy journey behavior onto a leaf, and leaves its own model untouched', async () => {
		const { mem, repo } = makeRepo({ features: featuresWithLeaf() });
		// The leaf shell already carries its own surface + Step-07 data.
		mem.features.set('p1/leaf1', {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'leaf1',
				name: 'L1',
				surfaces: [{ id: 'srf-own', name: 'Authored here', actions: [] }],
				personas: [],
				entities: [{ id: 'ent-x', namespace: 'Cart' }],
				resources: [{ id: 'res-db-1', name: 'DB' }],
				featureInvariants: []
			}
		} as UnspaFeatureSnapshot);
		await repo.save(sampleDraft('p1'));

		const leaf = mem.features.get('p1/leaf1')!.feature as {
			surfaces: { id: string }[];
			entities: { namespace: string }[];
			resources: { id: string }[];
		};
		// The journey is NOT copied in; the leaf keeps exactly its own surface.
		expect(leaf.surfaces.map((s) => s.id)).toEqual(['srf-own']);
		expect(leaf.entities.map((e) => e.namespace)).toEqual(['Cart']); // data preserved
		expect(leaf.resources.map((r) => r.id)).toEqual(['res-db-1']); // data preserved
	});

	it('Fix #5: an Experience-only save re-mirrors entities a step reads onto the consuming leaf', async () => {
		const { mem, repo } = makeRepo({ features: featuresWithLeaf(), data: dataWithCart() });
		seedLeafShell(mem); // the leaf already exists in the kernel (created by the Features save)
		// The Step-05 draft now records that step S1 (on coreA, the leaf's core) reads Cart.
		const draft = sampleDraft('p1');
		draft.stepDataReads = [{ id: 'r1', stepId: 'S1', order: 0, entityName: 'Cart', mode: 'read', fields: [] }];

		await repo.save(draft);

		const leaf = mem.features.get('p1/leaf1')!.feature as {
			entities: { namespace: string }[];
			resources: { id: string }[];
		};
		expect(leaf.entities.map((e) => e.namespace)).toContain('Cart'); // data mirrored on Experience save
		expect(leaf.resources.map((r) => r.id)).toContain('res-db-db1'); // its backing database too
	});

	it('Fix #5: no data provider wired → save still succeeds, just no extra mirror', async () => {
		const { mem, repo } = makeRepo({ features: featuresWithLeaf() });
		seedLeafShell(mem);
		const draft = sampleDraft('p1');
		draft.stepDataReads = [{ id: 'r1', stepId: 'S1', order: 0, entityName: 'Cart', mode: 'read', fields: [] }];
		await repo.save(draft);
		const leaf = mem.features.get('p1/leaf1')!.feature as { entities: { namespace: string }[] };
		expect(leaf.entities).toEqual([]); // nothing to mirror without a data source
	});

	it('backfills from the legacy SQLite draft on first read', async () => {
		const { mem, repo } = makeRepo({ legacy: sampleDraft('p1') });
		expect(mem.features.size).toBe(0);
		const back = (await repo.load('p1'))!;
		expect(back.journeys.map((j) => j.id)).toEqual(['J1']);
		expect(mem.features.get('p1/p1__experience')).toBeTruthy(); // seeded
	});

	it('returns null when nothing is authored yet', async () => {
		const { repo } = makeRepo();
		expect(await repo.load('p1')).toBeNull();
	});

	it('two-way binding: a journey added in the kernel appears on the next load', async () => {
		const { mem, repo } = makeRepo();
		await repo.save(sampleDraft('p1'));
		// Simulate a dashboard/MCP edit straight into the kernel feature.
		const snap = mem.features.get('p1/p1__experience')!;
		const feat = snap.feature as { surfaces: { id: string; type: string; name: string; actions: unknown[]; transitions: unknown[] }[] };
		feat.surfaces.push({ id: 'srf-J2', name: 'Support', type: 'workflow', actions: [], transitions: [] });

		const back = (await repo.load('p1'))!;
		expect(back.journeys.map((j) => j.id).sort()).toEqual(['J1', 'J2']);
		expect(back.journeys.find((j) => j.id === 'J2')!.name).toBe('Support');
	});

	it('MAP end-to-end: a save writes the .feature.json on fs, engine-off, and loads back', async () => {
		const root = mkdtempSync(join(tmpdir(), 'kexp-'));
		const port = new LocalBehaviorPort(new LocalFsBehaviorRepository(root), {
			nowIso: () => '2026-01-01T00:00:00.000Z'
		});
		const repo = new KernelExperienceDraftRepository(
			port,
			new MemResidue(),
			stubFeatures(),
			stubUsers(usersWith()),
			stubExperience()
		);

		await repo.save(sampleDraft('p1'));
		expect(existsSync(join(root, 'p1', 'p1__experience.feature.json'))).toBe(true);

		const back = (await repo.load('p1'))!;
		expect(back.journeys.map((j) => j.id)).toEqual(['J1']);
	});
});
