import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';

const scene = vi.hoisted(() => ({
	view: null as unknown,
	beforeRead: (() => {}) as () => void,
	publish: vi.fn()
}));

vi.mock('./evolution-view.server', async (original) => ({
	...(await original<typeof import('./evolution-view.server')>()),
	loadEvolutionView: async () => {
		scene.beforeRead();
		return scene.view;
	}
}));
vi.mock('./sync-bus.server', async (original) => ({
	...(await original<typeof import('./sync-bus.server')>()),
	publishSectionChange: scene.publish
}));

import { applyEvolutionOperations } from './evolution-operations.server';

const PROJECT = 'p1';
let revisions: Record<string, number>;
let dossierRevision: number;
const saves = {
	features: vi.fn(async () => ({})),
	data: vi.fn(async () => ({})),
	dossier: vi.fn(async () => ({ revision: 8, savedAt: '2026-11-09T00:00:00.000Z' }))
};
const rollback = vi.fn(async () => {});

const services = {
	clock: { nowIso: () => '2026-11-09T00:00:00.000Z' },
	draftLock: {
		current: async (_project: string, section: string) => revisions[section] ?? 0,
		commit: async (_project: string, section: string, expected: number | null) => {
			if (expected !== null && expected !== (revisions[section] ?? 0)) return null;
			revisions[section] = (revisions[section] ?? 0) + 1;
			return revisions[section];
		},
		rollback
	},
	sectionDocuments: { currentRevision: async () => dossierRevision },
	saveFeaturesDraft: { execute: saves.features },
	saveDataDraft: { execute: saves.data },
	saveEvolutionDraft: { execute: saves.dossier },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {}
} as unknown as AppServices;

/** A request whose deletion prunes a row from the features section, so the batch has that section to save. */
function requestHoldingARow() {
	const request = createEvolutionRequest({ title: 'A change', drafts: [{ id: 'draft-1', dependsOn: [] }] as never });
	scene.view = {
		projectId: PROJECT,
		draft: { projectId: PROJECT, requests: [request] },
		features: { ...createEmptyFeaturesDraft(PROJECT), leafMeta: { 'draft-1': { acceptanceCriteria: [] } } },
		data: {},
		leaves: [],
		sources: [],
		glossaryTerms: [],
		members: [],
		held: {},
		coverage: {},
		filled: {},
		readings: {},
		revision: 7,
		language: 'en'
	};
	return request;
}

const deleteIt = (requestId: string) =>
	applyEvolutionOperations(services, {
		projectId: PROJECT,
		operations: [{ op: 'delete_request', requestId }],
		actor: { kind: 'person', id: 'ada@example.com', name: 'Ada' } as never,
		origin: null
	});

describe('a batch saves a section only as it read it [criterion:d9c67477]', () => {
	beforeEach(() => {
		revisions = { features: 4, data: 2 };
		dossierRevision = 7;
		scene.beforeRead = () => {};
		scene.publish.mockClear();
		rollback.mockClear();
		Object.values(saves).forEach((s) => s.mockClear());
	});

	it('takes a new revision for the section it writes and tells the pages showing it', async () => {
		const outcome = await deleteIt(requestHoldingARow().id);
		expect(outcome.ok).toBe(true);
		expect(saves.features).toHaveBeenCalledOnce();
		expect(revisions.features).toBe(5);
		expect(scene.publish).toHaveBeenCalledWith({ projectId: PROJECT, section: 'features', origin: null });
		expect(saves.dossier).toHaveBeenCalledOnce();
	});

	it('is held, with nothing written, when someone saved the section after the batch read its revision', async () => {
		const request = requestHoldingARow();
		scene.beforeRead = () => {
			revisions.features = 5;
		};
		const outcome = await deleteIt(request.id);
		expect(outcome).toMatchObject({ ok: false, status: 409 });
		expect(JSON.stringify(outcome)).toContain('features section was changed by someone else');
		expect(saves.features).not.toHaveBeenCalled();
		expect(saves.dossier).not.toHaveBeenCalled();
		expect(revisions.features).toBe(5);
	});

	it('is held, with nothing written, when someone saved the dossier meanwhile', async () => {
		const request = requestHoldingARow();
		dossierRevision = 9;
		const outcome = await deleteIt(request.id);
		expect(outcome).toMatchObject({ ok: false, status: 409 });
		expect(saves.features).not.toHaveBeenCalled();
		expect(saves.dossier).not.toHaveBeenCalled();
		expect(revisions.features).toBe(4);
	});

	it('gives the revision back when the save of the section fails', async () => {
		const request = requestHoldingARow();
		saves.features.mockRejectedValueOnce(new Error('disk full'));
		await expect(deleteIt(request.id)).rejects.toThrow('disk full');
		expect(rollback).toHaveBeenCalledWith(PROJECT, 'features', 5);
		expect(scene.publish).not.toHaveBeenCalled();
		expect(saves.dossier).not.toHaveBeenCalled();
	});
});
