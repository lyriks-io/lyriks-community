import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { readingsBehindDrafts } from '$domain/evolution';
import { batchScene, claude, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Change a drafted feature (feat-30, action 1d57eff0), every scenario through
 * the real batch of operations. Not tested here: the viewer (1cd721aa),
 * refused by the route's access check, which the Enterprise workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:1d57eff0:${id}]`;
const update = (fields: Record<string, unknown>, actor = claude) => s.run([{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:r-1', ...fields }], actor);
const modelled = () => draftOn({ behaviourModel: { operations: [{ kind: 'add_action', name: 'Save for later' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' } });

describe('Change a drafted feature', () => {
	beforeEach(() => s.show(requestAt('specification')));

	it(`the AI rewords a drafted feature ${T('be17eed5')}`, async () => {
		expect((await update({ objective: 'Keep a cart for later, with its prices.' })).ok).toBe(true);
		expect(s.saved().drafts).toHaveLength(1);
		expect(s.saved().drafts[0].objective).toBe('Keep a cart for later, with its prices.');
	});

	it(`a draft the request does not carry is refused ${T('8502acef')}`, async () => {
		const result = await s.run([{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:nope-1234', objective: 'x' }], claude);
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a draft with a behaviour model keeps its kind ${T('42490829')}`, async () => {
		s.show(requestAt('specification', { drafts: [modelled()] }));
		const result = await update({ kind: 'remove' });
		expect(s.summaryOf(result, 'update_draft_leaf')).toContain('carries a behaviour model written over');
	});

	it(`a draft no longer changes in Approval ${T('2fe57843')}`, async () => {
		s.show(requestAt('acceptance'));
		const result = await update({ objective: 'x' });
		expect(s.summaryOf(result, 'update_draft_leaf')).toBe('This request stands in Approval: what it proposes is no longer corrected. Open a new request to change it.');
	});

	it(`a reworked draft makes the readings due again ${T('4b570e5a')}`, async () => {
		s.show(requestAt('coherence', { coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: '2026-11-20T00:00:00Z' }, impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: '2026-11-20T00:00:00Z' } }));
		expect(readingsBehindDrafts(s.current())).toBe(false);
		expect((await update({ objective: 'Keep a cart, and print it.' })).ok).toBe(true);
		expect(s.saved().history.at(-1)?.type).toBe('draft_change');
		expect(readingsBehindDrafts(s.saved())).toBe(true);
	});

	it(`in the Build a drafted feature is reworded, opening version N+1 in correction ${T('cb8735be')}`, async () => {
		s.show(requestAt('implementation'));
		expect((await update({ objective: 'Keep a cart, and print it.' })).ok).toBe(true);
		expect(s.saved().stage).toBe('implementation');
		expect(s.saved().correction?.of).toBe(1);
	});
});
