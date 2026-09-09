import { describe, it, expect } from 'vitest';
import type {
	BehaviorRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	ProjectResidueRepositoryPort
} from '$application/ports';
import type { ProjectDataDraft } from '$domain/data';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import {
	createDataRead,
	createEmptyExperienceDraft,
	createJourney,
	createStep,
	type ProjectExperienceDraft
} from '$domain/experience';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalBehaviorPort } from './local-behavior-port.server';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';
import { KernelDataDraftRepository } from './kernel-data-draft-repository.server';

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

const stubDefinition: FoundationDefinitionRepositoryPort = { load: async () => null, save: async () => {} };
const stubExperience = (d: ProjectExperienceDraft | null = null): ExperienceDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});
const stubFeatures = (d: ProjectFeaturesDraft | null = null): FeaturesDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});

function sampleDataDraft(projectId: string): ProjectDataDraft {
	return {
		projectId,
		hosts: [{ id: 'h1', name: 'AWS eu', kind: 'cloud', provider: 'AWS', region: 'eu-west-3', description: '' }],
		databases: [{ id: 'db1', hostId: 'h1', name: 'Core DB', engine: 'postgres', description: 'main' }],
		entities: [
			{ id: 'e1', name: 'User', databaseId: 'db1', description: 'a user', derivedFrom: 'manual', sourceRefId: null },
			{ id: 'e2', name: 'Order', databaseId: 'db1', description: '', derivedFrom: 'journey', sourceRefId: 's-x' }
		],
		fields: [
			{ id: 'f1', entityId: 'e1', parentFieldId: null, name: 'id', type: 'uuid', isId: true, isUnique: true, isRequired: true, isList: false, defaultValue: '', relationTargetEntityId: null },
			{ id: 'f2', entityId: 'e2', parentFieldId: null, name: 'owner', type: 'relation', isId: false, isUnique: false, isRequired: true, isList: false, defaultValue: '', relationTargetEntityId: 'e1' }
		],
		interfaces: [{ id: 'i1', protocol: 'rest', fromBrick: 'app', toBrick: 'stripe', operation: 'charge', description: '' }],
		derivedEntities: [],
		lastSavedAt: '2026-01-01T00:00:00.000Z'
	};
}

function makeRepo(opts: {
	experience?: ProjectExperienceDraft | null;
	features?: ProjectFeaturesDraft | null;
} = {}) {
	const mem = new MemRepo();
	const port = new LocalBehaviorPort(mem, { nowIso: () => '2026-01-01T00:00:00.000Z' });
	const residue = new MemResidue();
	const repo = new KernelDataDraftRepository(
		port,
		residue,
		stubDefinition,
		stubExperience(opts.experience ?? null),
		stubFeatures(opts.features ?? null)
	);
	return { mem, residue, repo };
}

describe('KernelDataDraftRepository (Phase 2 Data flip)', () => {
	it('round-trips a data draft through the kernel + residue', async () => {
		const { repo } = makeRepo();
		await repo.save(sampleDataDraft('p1'));
		const back = (await repo.load('p1'))!;

		expect(back.entities).toEqual(sampleDataDraft('p1').entities);
		expect(back.fields).toEqual(sampleDataDraft('p1').fields);
		expect(back.databases).toEqual(sampleDataDraft('p1').databases);
		expect(back.interfaces).toEqual(sampleDataDraft('p1').interfaces);
	});

	it('writes the central Data Model feature and lists it in the project', async () => {
		const { mem, repo } = makeRepo();
		await repo.save(sampleDataDraft('p1'));
		const dm = mem.features.get('p1/p1__data_model')!.feature as Record<string, unknown>;
		expect(dm.name).toBe('Data Model');
		expect((dm.entities as unknown[]).length).toBe(2);
		expect((dm.resources as unknown[]).length).toBe(2); // db + interface
		expect(dm.featureInvariants).toEqual([]);
		expect(mem.projects.get('p1')!.project.featureIds).toContain('p1__data_model');
	});

	it('mirrors consumed entities into the leaf feature via the Core bridge', async () => {
		const features = createEmptyFeaturesDraft('p1');
		features.cores = [{ id: 'coreA', name: 'Core A', description: '', tone: 'custom' }];
		features.features = [
			{ id: 'leaf1', name: 'L1', coreId: 'coreA', parentFamilyId: null, description: '', unspaghettitFeatureId: 'leaf1' }
		];
		const exp = createEmptyExperienceDraft('p1');
		exp.journeys = [createJourney('coreA', 0, { id: 'J1' })];
		exp.steps = [createStep('J1', 0, { id: 'S1' })];
		exp.stepDataReads = [createDataRead('S1', 0, { entityName: 'User' })];

		const { mem, repo } = makeRepo({ experience: exp, features });
		// The leaf shell must already exist — mirror enriches, never creates.
		mem.features.set('p1/leaf1', {
			format: 'unspaghettit',
			version: 1,
			feature: { id: 'leaf1', name: 'L1', surfaces: [], entities: [], resources: [], featureInvariants: [] }
		});
		await repo.save(sampleDataDraft('p1'));

		const leaf = mem.features.get('p1/leaf1')!.feature as { entities: { namespace: string }[] };
		expect(leaf.entities.map((e) => e.namespace)).toEqual(['User']);
	});

	it('returns null when nothing is authored yet', async () => {
		const { repo } = makeRepo();
		expect(await repo.load('p1')).toBeNull();
	});

	it('MAP end-to-end: a save writes the .feature.json on fs, engine-off, and loads back', async () => {
		const root = mkdtempSync(join(tmpdir(), 'kdata-'));
		const port = new LocalBehaviorPort(new LocalFsBehaviorRepository(root), {
			nowIso: () => '2026-01-01T00:00:00.000Z'
		});
		const repo = new KernelDataDraftRepository(
			port,
			new MemResidue(),
			stubDefinition,
			stubExperience(),
			stubFeatures()
		);

		await repo.save(sampleDataDraft('p1'));
		expect(existsSync(join(root, 'p1', 'p1__data_model.feature.json'))).toBe(true);

		const back = (await repo.load('p1'))!;
		expect(back.entities.map((e) => e.id)).toEqual(['e1', 'e2']);
		expect(back.entities.find((e) => e.id === 'e1')!.databaseId).toBe('db1');
	});
});
