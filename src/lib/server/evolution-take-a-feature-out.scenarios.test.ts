import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { createDraftLeaf, readingsBehindDrafts } from '$domain/evolution';
import { batchScene, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Take a feature out of the change (feat-30, action 98746cb6), every scenario
 * through the real batch of operations. Not tested here: someone outside the
 * workspace (49eb5e9f), answered 404 by the route's access check, which the
 * Enterprise workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:98746cb6:${id}]`;
const takeOut = (draftId = 'draft:r-1') => s.run([{ op: 'remove_draft_leaf', requestId: 'r', draftId }]);
const second = createDraftLeaf({ id: 'draft:r-2', kind: 'add', name: 'Print a receipt' });
const two = { drafts: [draftOn(), second], leafIds: ['feat-1', 'draft:r-1', 'draft:r-2'] };

describe('Take a feature out of the change', () => {
	beforeEach(() => s.show(requestAt('specification')));

	it(`a designer takes the drafted feature out, its behaviour model with it ${T('965f15bf')}`, async () => {
		s.show(requestAt('specification', { drafts: [draftOn({ behaviourModel: { operations: [{ kind: 'add_action', name: 'Save' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' } })] }));
		expect((await takeOut()).ok).toBe(true);
		expect(s.saved().drafts).toEqual([]);
		expect(s.saved().leafIds).not.toContain('draft:r-1');
	});

	it(`taking a feature out stays possible before the Solution is validated ${T('2f6995ee')}`, async () => {
		s.show(requestAt('specification', two));
		expect((await takeOut('draft:r-2')).ok).toBe(true);
		expect(s.saved().drafts.map((d) => d.id)).toEqual(['draft:r-1']);
	});

	it(`a request in Approval keeps its features ${T('36790299')}`, async () => {
		s.show(requestAt('acceptance'));
		expect(s.summaryOf(await takeOut(), 'remove_draft_leaf')).toBe('This request stands in Approval: what it proposes is no longer corrected. Open a new request to change it.');
	});

	it(`a draft the request does not carry cannot be taken out ${T('ced725da')}`, async () => {
		const result = await takeOut('draft:nope-1234');
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`taking a feature out makes the readings due again ${T('115318dd')}`, async () => {
		s.show(requestAt('coherence', { ...two, coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: '2026-11-20T00:00:00Z' }, impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: '2026-11-20T00:00:00Z' } }));
		expect((await takeOut('draft:r-2')).ok).toBe(true);
		expect(s.saved().drafts).toHaveLength(1);
		expect(readingsBehindDrafts(s.saved())).toBe(true);
	});

	it(`in the Build a feature is taken out of the change, opening version N+1 in correction ${T('c9ab6ab1')}`, async () => {
		s.show(requestAt('implementation', two));
		expect((await takeOut('draft:r-2')).ok).toBe(true);
		expect(s.saved().drafts).toHaveLength(1);
		expect(s.saved().correction?.of).toBe(1);
	});
});
