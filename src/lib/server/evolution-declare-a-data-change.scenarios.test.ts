import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import type { DataDraft } from '$domain/evolution';
import { batchScene, claude, requestAt } from './evolution-batch-scene.fixture';

/**
 * Declare a data change (feat-30, action 34fc470f), every scenario through
 * the real batch of operations. Not tested here: the viewer (f1dddd9d),
 * refused by the route's access check, which the Enterprise workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:34fc470f:${id}]`;
const table = (over: Partial<DataDraft>): DataDraft => ({ id: 'data:t-1', kind: 'add', entityId: null, name: 'Saved cart', description: '', addFields: [], changeFields: [], removeFields: [], materialisedAs: null, materialisedAt: null, ...over });
const declare = (fields: Record<string, unknown>, actor = claude) => s.run([{ op: 'add_data_draft', requestId: 'r', ...fields }], actor);

describe('Declare a data change', () => {
	beforeEach(() => s.show(requestAt('specification')));

	it(`the AI declares a new table, waiting for a person ${T('37dde213')}`, async () => {
		expect((await declare({ kind: 'add', name: 'Saved cart', addFields: [{ name: 'savedAt', type: 'datetime' }] })).ok).toBe(true);
		expect(s.saved().dataDrafts).toHaveLength(1);
		expect(s.saved().dataDrafts[0]).toMatchObject({ kind: 'add', name: 'Saved cart' });
	});

	it(`a data change is taken out before the Solution is validated ${T('c63b6cd2')}`, async () => {
		s.show(requestAt('specification', { dataDrafts: [table({})] }));
		expect((await s.run([{ op: 'remove_data_draft', requestId: 'r', dataDraftId: 'data:t-1' }], claude)).ok).toBe(true);
		expect(s.saved().dataDrafts).toEqual([]);
	});

	it(`a new table needs a name ${T('985ee265')}`, async () => {
		const unnamed = await declare({ kind: 'add', name: '' });
		expect(s.summaryOf(unnamed, 'add_data_draft')).toBe('A new table needs a name.');
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a table that does not exist cannot be amended ${T('1adad7b2')}`, async () => {
		const result = await declare({ kind: 'amend', entityId: 'ent-zzz' });
		expect(result.ok).toBe(false);
		expect(s.summaryOf(result, 'add_data_draft')).toContain('ent-zzz');
	});

	it(`a table moves one way per request ${T('6aa7142f')}`, async () => {
		s.show(requestAt('specification', { dataDrafts: [table({ kind: 'remove', entityId: 'ent-1', name: '' })] }));
		const moved = await declare({ kind: 'amend', entityId: 'ent-1', addFields: [{ name: 'note', type: 'string' }] });
		expect(s.summaryOf(moved, 'add_data_draft')).toBe('This request already carries a change for that table.');
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a field of an unknown type is refused ${T('9fc59e18')}`, async () => {
		const result = await declare({ kind: 'add', name: 'Saved cart', addFields: [{ name: 'blob', type: 'teleport' }] });
		expect(result.ok).toBe(false);
		expect(s.summaryOf(result, 'add_data_draft')).toContain('teleport');
	});

	it(`a new table another change points at stays ${T('886133d3')}`, async () => {
		const pointing = table({ id: 'data:t-2', name: 'Saved line', addFields: [{ name: 'cart', type: 'relation', required: false, list: false, relationTo: 'data:t-1' }] as DataDraft['addFields'] });
		s.show(requestAt('specification', { dataDrafts: [table({}), pointing] }));
		const result = await s.run([{ op: 'remove_data_draft', requestId: 'r', dataDraftId: 'data:t-1' }], claude);
		expect(s.summaryOf(result, 'remove_data_draft')).toBe('Another data change of this request points at this new table.');
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a data change is declared before anyone validated the Solution ${T('0b1202ce')}`, async () => {
		expect(s.current().stepValidations).toEqual([]);
		expect((await declare({ kind: 'add', name: 'Saved cart' })).ok).toBe(true);
	});

	it(`a request in Approval declares no data change ${T('d14befc5')}`, async () => {
		s.show(requestAt('acceptance'));
		expect(s.summaryOf(await declare({ kind: 'add', name: 'Saved cart' }), 'add_data_draft')).toBe('This request stands in Approval: what it proposes is no longer corrected. Open a new request to change it.');
	});

	it(`in the Build the AI declares a data change, opening version N+1 in correction ${T('290008ef')}`, async () => {
		s.show(requestAt('implementation'));
		expect((await declare({ kind: 'add', name: 'Saved cart' })).ok).toBe(true);
		expect(s.saved().dataDrafts).toHaveLength(1);
		expect(s.saved().correction?.of).toBe(1);
	});
});
