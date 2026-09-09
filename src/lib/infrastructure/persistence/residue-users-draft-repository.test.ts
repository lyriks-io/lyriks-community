import { describe, it, expect } from 'vitest';
import type { ProjectResidueRepositoryPort, UsersDraftRepositoryPort } from '$application/ports';
import { createEmptyUsersDraft, createRole, type ProjectUsersDraft } from '$domain/users';
import { ResidueUsersDraftRepository } from './residue-users-draft-repository.server';

class MemResidue implements ProjectResidueRepositoryPort {
	store = new Map<string, unknown>();
	async load(projectId: string, section: string) {
		return this.store.get(`${projectId}/${section}`) ?? null;
	}
	async save(projectId: string, section: string, payload: unknown) {
		this.store.set(`${projectId}/${section}`, payload);
	}
}

const stubUsers = (d: ProjectUsersDraft | null): UsersDraftRepositoryPort => ({
	load: async () => d,
	save: async () => {}
});

function sampleDraft(projectId = 'p1'): ProjectUsersDraft {
	const u = createEmptyUsersDraft(projectId);
	return {
		...u,
		roles: [createRole({ id: 'R1', name: 'Admin' })],
		offStructureCapabilities: [{ id: 'c1', label: 'Export', note: null }],
		permissions: [{ roleId: 'R1', capabilityId: 'c1', capabilitySource: 'off_structure' }],
		lastSavedAt: '2026-01-01T00:00:00.000Z'
	};
}

describe('ResidueUsersDraftRepository (Phase 4 Users flip)', () => {
	it('round-trips a users draft through the residue store', async () => {
		const repo = new ResidueUsersDraftRepository(new MemResidue(), stubUsers(null));
		await repo.save(sampleDraft('p1'));
		const back = (await repo.load('p1'))!;
		expect(back.roles.map((r) => r.name)).toEqual(['Admin']);
		expect(back.offStructureCapabilities.map((c) => c.label)).toEqual(['Export']);
		expect(back.permissions).toEqual(sampleDraft('p1').permissions);
	});

	it('backfills from the legacy SQLite draft on first read', async () => {
		const residue = new MemResidue();
		const repo = new ResidueUsersDraftRepository(residue, stubUsers(sampleDraft('p1')));
		expect(await residue.load('p1', 'users')).toBeNull();
		const back = (await repo.load('p1'))!;
		expect(back.roles.map((r) => r.id)).toEqual(['R1']);
		expect(await residue.load('p1', 'users')).toBeTruthy(); // seeded
	});

	it('returns null when nothing is authored yet', async () => {
		const repo = new ResidueUsersDraftRepository(new MemResidue(), stubUsers(null));
		expect(await repo.load('p1')).toBeNull();
	});
});
