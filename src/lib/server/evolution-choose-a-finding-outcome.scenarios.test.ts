import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import type { FindingDraft } from '$domain/evolution';
import { batchScene, claude, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Choose what becomes of a finding (feat-30, action 7dc574da), every scenario
 * through the real batch of operations. Not tested here: the viewer
 * (81c3f4d6), refused by the route's access check, which the Enterprise
 * workspace adapter decides.
 */
const GAPS = [
	{ id: 'gap-1', severity: 'major', title: 'Checkout has no refusal for an empty cart', detail: '', sourceStep: 'features', blocking: false, featureRef: 'feat-1' },
	{ id: 'gap-2', severity: 'blocking', title: 'Two ways to pay', detail: '', sourceStep: 'features', blocking: true, featureRef: 'feat-1' }
];
const s = batchScene(scene, GAPS);
const T = (id: string) => `[unspa:ead2111a:7dc574da:${id}]`;
const line = (over: Partial<FindingDraft> = {}): FindingDraft => ({ id: 'finding:f-1', findingId: 'gap-1', title: GAPS[0].title, featureRef: 'feat-1', blocking: false, outcome: 'undecided', reason: '', sourceIds: [], materialisedAt: null, ...over });
const blockingLine = line({ id: 'finding:f-2', findingId: 'gap-2', title: GAPS[1].title, blocking: true });
const choose = (fields: Record<string, unknown>, id = 'finding:f-1') => s.run([{ op: 'update_finding_draft', requestId: 'r', findingDraftId: id, ...fields }], claude);
const at = (stage: Parameters<typeof requestAt>[0], over = {}) => requestAt(stage, { findingDrafts: [line(), blockingLine], ...over });

describe('Choose what becomes of a finding', () => {
	beforeEach(() => s.show(at('specification')));

	it(`a designer says the change fixes the finding ${T('e0c40022')}`, async () => {
		expect((await choose({ outcome: 'fixed' })).ok).toBe(true);
		expect(s.saved().findingDrafts?.[0].outcome).toBe('fixed');
	});

	it(`a finding is kept as it is with its reason ${T('86f6f848')}`, async () => {
		expect((await choose({ outcome: 'kept', reason: 'The empty cart is refused by the page already.' })).ok).toBe(true);
		expect(s.saved().findingDrafts?.[0]).toMatchObject({ outcome: 'kept', reason: 'The empty cart is refused by the page already.' });
	});

	it(`keeping a finding needs its reason ${T('e32ab325')}`, async () => {
		expect((await choose({ outcome: 'kept' })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a blocking finding cannot be kept as it is ${T('1c7c72a7')}`, async () => {
		expect((await choose({ outcome: 'kept', reason: 'We live with it.' }, 'finding:f-2')).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a finding settled at the landing no longer changes ${T('c5db64af')}`, async () => {
		s.show(at('specification', { drafts: [draftOn({ materialisedAt: '2026-11-19T00:00:00Z', materialisedAs: 'feat-1' })], findingDrafts: [line({ outcome: 'fixed', materialisedAt: '2026-11-19T00:00:00Z' })] }));
		expect((await choose({ outcome: 'kept', reason: 'x' })).ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a request in Approval keeps what becomes of its findings ${T('d2a2463b')}`, async () => {
		s.show(at('acceptance'));
		expect(s.summaryOf(await choose({ outcome: 'fixed' }), 'update_finding_draft')).toBe('This request stands in Approval: what it proposes is no longer corrected. Open a new request to change it.');
	});

	it(`in the Build what becomes of a finding is chosen, opening version N+1 in correction ${T('746993ce')}`, async () => {
		s.show(at('implementation'));
		expect((await choose({ outcome: 'fixed' })).ok).toBe(true);
		expect(s.saved().findingDrafts?.[0].outcome).toBe('fixed');
		expect(s.saved().correction?.of).toBe(1);
	});
});
