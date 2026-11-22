import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import type { FindingDraft } from '$domain/evolution';
import { batchScene, claude, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Name a finding of Project health the change settles (feat-30, action
 * 06a5962f), every scenario through the real batch of operations, the finding
 * read from Project health. Not tested here: the viewer (d0ed3e47), refused
 * by the route's access check, which the Enterprise workspace adapter decides.
 */
const GAPS = [
	{ id: 'gap-1', severity: 'major', title: 'Checkout has no refusal for an empty cart', detail: '', sourceStep: 'features', blocking: false, featureRef: 'feat-1' },
	{ id: 'gap-2', severity: 'blocking', title: 'Two ways to pay', detail: '', sourceStep: 'features', blocking: true, featureRef: 'feat-1' }
];
const s = batchScene(scene, GAPS);
const T = (id: string) => `[unspa:ead2111a:06a5962f:${id}]`;
const line = (over: Partial<FindingDraft> = {}): FindingDraft => ({ id: 'finding:f-1', findingId: 'gap-1', title: GAPS[0].title, featureRef: 'feat-1', blocking: false, outcome: 'undecided', reason: '', sourceIds: [], materialisedAt: null, ...over });
const name = (fields: Record<string, unknown>) => s.run([{ op: 'add_finding_draft', requestId: 'r', ...fields }], claude);

describe('Name a finding of Project health the change settles', () => {
	beforeEach(() => s.show(requestAt('specification')));

	it(`a finding is named with no outcome yet, waiting for a person ${T('8e04abea')}`, async () => {
		expect((await name({ findingId: 'gap-1' })).ok).toBe(true);
		expect(s.saved().findingDrafts).toHaveLength(1);
		expect(s.saved().findingDrafts?.[0]).toMatchObject({ findingId: 'gap-1' });
		expect(s.saved().findingDrafts?.[0].outcome).toBe('undecided');
	});

	it(`a blocking finding cannot be kept ${T('8e6bb55b')}`, async () => {
		expect((await name({ findingId: 'gap-2', outcome: 'kept', reason: 'We live with it.' })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a finding kept as it is needs its reason ${T('7a962ed4')}`, async () => {
		expect((await name({ findingId: 'gap-1', outcome: 'kept' })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a finding another request settles is refused ${T('088be3f7')}`, async () => {
		const other = { ...requestAt('specification'), id: 'other-request', title: 'Settle the empty cart', findingDrafts: [line()] };
		s.show(requestAt('specification'), [], [other]);
		expect((await name({ findingId: 'gap-1' })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a finding no longer listed is refused ${T('78060869')}`, async () => {
		expect((await name({ findingId: 'gap-gone' })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a settled finding is not taken off ${T('1e67bf3b')}`, async () => {
		s.show(requestAt('specification', { drafts: [draftOn({ materialisedAt: '2026-11-19T00:00:00Z', materialisedAs: 'feat-1' })], findingDrafts: [line({ outcome: 'fixed', materialisedAt: '2026-11-19T00:00:00Z' })] }));
		expect((await s.run([{ op: 'remove_finding_draft', requestId: 'r', findingDraftId: 'finding:f-1' }], claude)).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a finding is taken off the request ${T('60a0bdfc')}`, async () => {
		s.show(requestAt('specification', { findingDrafts: [line()] }));
		expect((await s.run([{ op: 'remove_finding_draft', requestId: 'r', findingDraftId: 'finding:f-1' }], claude)).ok).toBe(true);
		expect(s.saved().findingDrafts ?? []).toEqual([]);
	});

	it(`in the Build a finding is named, opening version N+1 in correction ${T('54f44abe')}`, async () => {
		s.show(requestAt('implementation'));
		expect((await name({ findingId: 'gap-1' })).ok).toBe(true);
		expect(s.saved().findingDrafts).toHaveLength(1);
		expect(s.saved().correction?.of).toBe(1);
	});
});
