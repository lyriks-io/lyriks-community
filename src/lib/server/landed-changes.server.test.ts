import { describe, expect, it, vi } from 'vitest';
import { createEmptyEvolutionDraft, type ProjectEvolutionDraft } from '$domain/evolution';
import { LandedChangesReader } from './landed-changes.server';

/** A project whose Evolution document and revision the test moves. */
function project() {
	let revision = 7;
	let draft: ProjectEvolutionDraft = createEmptyEvolutionDraft('p');
	const load = vi.fn(async () => draft);
	const services = {
		sectionDocuments: { currentRevision: async () => revision },
		loadEvolutionDraft: { execute: load }
	} as unknown as Parameters<LandedChangesReader['read']>[0];
	return { services, load, move: (next: ProjectEvolutionDraft) => { draft = next; revision += 1; } };
}

describe('the Knowledge layout reads what landed once per revision of the Evolution document', () => {
	it('loads the document once while its revision stays', async () => {
		const p = project();
		const reader = new LandedChangesReader();
		await reader.read(p.services, 'p');
		await reader.read(p.services, 'p');
		await reader.read(p.services, 'p');
		expect(p.load).toHaveBeenCalledTimes(1);
	});

	it('reads it again once a write moved its revision, and says what landed then', async () => {
		const p = project();
		const reader = new LandedChangesReader();
		expect(await reader.read(p.services, 'p')).toEqual([]);
		const landed = {
			...createEmptyEvolutionDraft('p'),
			requests: [{ id: 'r1', status: 'open', deployment: { declaredAt: '2026-11-20T10:00:00.000Z' }, drafts: [{ kind: 'amend', baseLeafId: 'feat-1' }] }]
		} as unknown as ProjectEvolutionDraft;
		p.move(landed);
		const changes = await reader.read(p.services, 'p');
		expect(p.load).toHaveBeenCalledTimes(2);
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({ at: '2026-11-20T10:00:00.000Z', added: [], changed: ['feat-1'] });
	});
});
