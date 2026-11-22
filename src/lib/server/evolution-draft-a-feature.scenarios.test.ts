import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));

import { batchScene, claude, draftOn, requestAt } from './evolution-batch-scene.fixture';

/**
 * Draft a feature to add, amend or remove (feat-30, action d648da68), every
 * scenario through the real batch of operations. Not tested here: the viewer
 * (b7a704ba), refused by the route's access check, which the Enterprise
 * workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:d648da68:${id}]`;
const drafted = (request = s.current()) => request.drafts.filter((d) => d.id !== 'draft:r-1');
const add = (fields: Record<string, unknown>) => s.run([{ op: 'add_draft_leaf', requestId: 'r', ...fields }]);
const specify = (over = {}) => requestAt('specification', { drafts: [], leafIds: ['feat-1'], ...over });

describe('Draft a feature to add, amend or remove', () => {
	beforeEach(() => s.show(specify()));

	it(`a designer adds a missing feature, counted as touched and waiting for a validation ${T('8087e9af')}`, async () => {
		expect((await add({ kind: 'add', name: 'Export the report' })).ok).toBe(true);
		const [draft] = s.saved().drafts;
		expect(draft).toMatchObject({ kind: 'add', name: 'Export the report' });
		expect(s.saved().leafIds).toContain(draft.id);
		expect(s.saved().history.at(-1)?.type).toBe('draft_change');
	});

	it(`an AI client drafts the amendment of an existing feature ${T('90d04451')}`, async () => {
		const result = await s.run([{ op: 'add_draft_leaf', requestId: 'r', kind: 'amend', baseLeafId: 'feat-1', descriptionAppend: 'It keeps a cart for later.' }], claude);
		expect(result.ok).toBe(true);
		expect(s.saved().drafts[0]).toMatchObject({ kind: 'amend', baseLeafId: 'feat-1', name: '' });
	});

	it(`a feature is drafted before anyone validated the Solution ${T('bb97dd52')}`, async () => {
		expect(s.current().stepValidations.length).toBe(0);
		expect((await add({ kind: 'add', name: 'Export the report' })).ok).toBe(true);
		expect(s.saved().drafts).toHaveLength(1);
	});

	it(`a request in Approval drafts nothing ${T('91635163')}`, async () => {
		s.show(requestAt('acceptance'));
		const result = await add({ kind: 'add', name: 'Export the report' });
		expect(result.ok).toBe(false);
		expect(s.summaryOf(result, 'add_draft_leaf')).toBe('This request stands in Approval: what it proposes is no longer corrected. Open a new request to change it.');
	});

	it(`a feature moves one way per request ${T('aae3cff1')}`, async () => {
		s.show(specify({ drafts: [draftOn()], leafIds: ['feat-1', 'draft:r-1'] }));
		const result = await add({ kind: 'remove', baseLeafId: 'feat-1' });
		expect(s.summaryOf(result, 'add_draft_leaf')).toBe('This request already carries a draft for "feat-1".');
	});

	it(`a new feature needs a name ${T('0659557b')}`, async () => {
		const result = await add({ kind: 'add', name: '' });
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`an amendment names the feature it stands for ${T('bd752d1b')}`, async () => {
		const result = await add({ kind: 'amend' });
		expect(result.ok).toBe(false);
		expect(s.summaryOf(result, 'add_draft_leaf')).toContain('baseLeafId');
	});

	it(`a removal of a feature that does not exist is refused ${T('b5716f14')}`, async () => {
		const result = await add({ kind: 'remove', baseLeafId: 'feat-zzz' });
		expect(result.ok).toBe(false);
		expect(s.summaryOf(result, 'add_draft_leaf')).toContain('feat-zzz');
	});

	it(`an addition carries no patch of a description ${T('55d3f394')}`, async () => {
		const result = await add({ kind: 'add', name: 'Export the report', descriptionAppend: 'More.' });
		expect(s.summaryOf(result, 'add_draft_leaf')).toBe('retireCriteria, changeCriteria, descriptionPatch and descriptionAppend amend an existing feature.');
	});

	it(`a patch of a passage the description does not hold is refused ${T('779ac3cd')}`, async () => {
		const result = await add({ kind: 'amend', baseLeafId: 'feat-1', descriptionPatch: { find: 'a passage nobody wrote', replace: 'x' } });
		expect(result.ok).toBe(false);
		expect(s.summaryOf(result, 'add_draft_leaf')).toContain('does not contain');
	});

	it(`a closed request drafts nothing ${T('dee1971a')}`, async () => {
		s.show(specify({ status: 'closed' }));
		expect(s.summaryOf(await add({ kind: 'add', name: 'Export the report' }), 'add_draft_leaf')).toBe('This request is closed.');
	});

	it(`in the Build a missing feature is drafted, opening version N+1 in correction ${T('b893078b')}`, async () => {
		s.show(requestAt('implementation'));
		expect((await add({ kind: 'add', name: 'Export the report' })).ok).toBe(true);
		expect(drafted()).toHaveLength(1);
		expect(s.saved().correction?.of).toBe(1);
	});
});
