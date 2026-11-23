import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, type EvolutionRequest, type Proposal } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';

const scene = vi.hoisted(() => ({ view: null as unknown }));

vi.mock('./evolution-view.server', async (original) => ({
	...(await original<typeof import('./evolution-view.server')>()),
	loadEvolutionView: async () => scene.view
}));
vi.mock('./sync-bus.server', async (original) => ({
	...(await original<typeof import('./sync-bus.server')>()),
	publishSectionChange: vi.fn()
}));

import { applyEvolutionOperations, RETIRED_ACTS } from './evolution-operations.server';

const PROJECT = 'p1';
const saveDossier = vi.fn(async (..._args: unknown[]) => ({ revision: 8, savedAt: '2026-11-23T00:00:00.000Z' }));

const services = {
	clock: { nowIso: () => '2026-11-23T00:00:00.000Z' },
	draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
	sectionDocuments: { currentRevision: async () => 7 },
	saveFeaturesDraft: { execute: vi.fn(async () => ({})) },
	saveDataDraft: { execute: vi.fn(async () => ({})) },
	saveEvolutionDraft: { execute: saveDossier },
	implementationCoverage: { invalidate: () => {} },
	scheduleBackSync: async () => {}
} as unknown as AppServices;

const proposal = {
	id: 'prop-1',
	targetField: '00-need.situation',
	value: 'Two bags a week are never picked up.',
	decision: 'pending',
	proposedBy: 'ai:claude',
	reviewerIds: [],
	verdicts: []
} as unknown as Proposal;

function withSuggestion(): EvolutionRequest {
	const request = { ...createEvolutionRequest({ title: 'Pick-ups' }), id: 'r1', proposals: [proposal] };
	const features = { ...createEmptyFeaturesDraft(PROJECT), features: [], leafMeta: {} };
	const members = [
		{ id: 'ada@example.com', name: 'Ada', role: 'designer' },
		{ id: 'bo@example.com', name: 'Bo', role: 'designer' }
	];
	scene.view = { projectId: PROJECT, draft: { projectId: PROJECT, requests: [request] }, features, data: {}, leaves: [], sources: [], glossaryTerms: [], members, held: {}, coverage: {}, filled: {}, readings: {}, revision: 7, language: 'en' };
	return request;
}

const run = (operations: unknown[]) =>
	applyEvolutionOperations(services, {
		projectId: PROJECT,
		operations,
		actor: { kind: 'person', id: 'ada@example.com', name: 'Ada', role: 'member', channel: 'page' } as never,
		origin: null
	});

describe('rewording a suggestion and asking members to look at it are gone [criterion:6d20bc82]', () => {
	beforeEach(() => {
		saveDossier.mockClear();
		withSuggestion();
	});

	it('refuses tag_reviewers, saying to name the member with @ in a comment, and writes nothing', async () => {
		const outcome = await run([{ op: 'tag_reviewers', requestId: 'r1', proposalId: 'prop-1', reviewerIds: ['bo@example.com'] }]);
		expect(outcome.ok).toBe(false);
		expect(outcome.results[0]).toMatchObject({ ok: false, summary: RETIRED_ACTS.tag_reviewers.reason, detail: RETIRED_ACTS.tag_reviewers.detail });
		expect(RETIRED_ACTS.tag_reviewers.detail).toContain('@');
		expect(saveDossier).not.toHaveBeenCalled();
	});

	it('refuses decide_proposal with decision reword, saying to refuse then write one own answer, and writes nothing', async () => {
		const outcome = await run([{ op: 'decide_proposal', requestId: 'r1', proposalId: 'prop-1', decision: 'reword', value: 'Three bags a week.' }]);
		expect(outcome.ok).toBe(false);
		expect(outcome.results[0]).toMatchObject({ ok: false, summary: RETIRED_ACTS.reword.reason, detail: RETIRED_ACTS.reword.detail });
		expect(saveDossier).not.toHaveBeenCalled();
	});
});
