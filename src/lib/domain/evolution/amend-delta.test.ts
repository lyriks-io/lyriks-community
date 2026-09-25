import { describe, expect, it } from 'vitest';
import { createEvolutionRequest } from './draft';
import { addDraftLeafAct, updateDraftLeafAct, type ActContext } from './acts';
import { editedDescription, materialiseDrafts } from './materialise';

/**
 * An amendment said as a delta.
 *
 * On 2026-09-24 amending a feature of fifty-two criteria meant resending every
 * one of them, and adding two sentences to a description meant copying the
 * whole description back; a wrong copy would have silently changed text nobody
 * asked to change.
 */
let n = 0;
const ctx: ActContext = {
	actor: { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' },
	at: '2026-09-24T00:00:00.000Z',
	newId: () => `id-${++n}`
};
const known = new Set(['feat-controls']);
const base = (leafId: string) =>
	leafId === 'feat-controls'
		? {
				description: 'Keyboard moves the player. E interacts.',
				criteria: [
					{ id: 'c-1', text: 'Arrows walk.' },
					{ id: 'c-2', text: 'E opens the choices.' },
					{ id: 'c-3', text: 'Rain sounds on roofs.' }
				]
			}
		: null;
const request = () => createEvolutionRequest({ id: 'r1', stage: 'specification', leafIds: ['feat-controls'] });

describe('an amendment said as a delta', () => {
	it('retires, rewords and adds criteria without restating the others', () => {
		const drafted = addDraftLeafAct(
			ctx,
			request(),
			{
				kind: 'amend',
				baseLeafId: 'feat-controls',
				acceptanceCriteria: ['A left click walks to the spot.'],
				retireCriteria: ['c-3'],
				changeCriteria: [{ id: 'c-2', text: 'E, or a right click on an element, opens the choices.' }],
				descriptionPatch: [{ find: 'E interacts.', replace: 'E or a right click interacts.' }],
				descriptionAppend: 'The mouse walks the player.'
			},
			known,
			base
		);
		expect(drafted.ok).toBe(true);
		if (!drafted.ok) return;
		const tree = {
			cores: [{ id: 'core' }],
			features: [
				{
					id: 'feat-controls',
					name: 'Controls',
					coreId: 'core',
					parentFamilyId: null,
					description: 'Keyboard moves the player. E interacts.',
					unspaghettitFeatureId: 'feat-controls'
				}
			],
			leafMeta: { 'feat-controls': { acceptanceCriteria: base('feat-controls')!.criteria.map((c) => ({ ...c })) } }
		};
		const written = materialiseDrafts(tree, { ...drafted.request, stage: 'implementation' }, ctx.at);
		expect(written.features.features[0].description).toBe(
			'Keyboard moves the player. E or a right click interacts.\n\nThe mouse walks the player.'
		);
		expect(written.features.leafMeta?.['feat-controls'].acceptanceCriteria).toEqual([
			{ id: 'c-1', text: 'Arrows walk.' },
			{ id: 'c-2', text: 'E, or a right click on an element, opens the choices.' },
			expect.objectContaining({ text: 'A left click walks to the spot.' })
		]);
		expect(written.lines[0]).toContain('1 criteria retired and 1 reworded');
	});

	it('refuses a criterion id the feature does not carry', () => {
		const drafted = addDraftLeafAct(
			ctx,
			request(),
			{ kind: 'amend', baseLeafId: 'feat-controls', retireCriteria: ['c-9'] },
			known,
			base
		);
		expect(drafted.ok).toBe(false);
		expect(!drafted.ok && drafted.reason).toContain('"c-9"');
	});

	it('refuses a patch whose passage is not in the description, or is there twice', () => {
		const missing = addDraftLeafAct(
			ctx,
			request(),
			{ kind: 'amend', baseLeafId: 'feat-controls', descriptionPatch: [{ find: 'Mouse', replace: 'x' }] },
			known,
			base
		);
		expect(missing.ok).toBe(false);
		const twice = addDraftLeafAct(
			ctx,
			request(),
			{ kind: 'amend', baseLeafId: 'feat-controls', descriptionPatch: [{ find: 'e', replace: 'x' }] },
			known,
			base
		);
		expect(!twice.ok && twice.reason).toContain('times');
	});

	it('refuses a delta on an addition', () => {
		const drafted = addDraftLeafAct(ctx, request(), { name: 'New', retireCriteria: ['c-1'] }, known, base);
		expect(drafted.ok).toBe(false);
	});

	it('keeps the delta when an update does not name it, and replaces it when it does', () => {
		const drafted = addDraftLeafAct(
			ctx,
			request(),
			{ kind: 'amend', baseLeafId: 'feat-controls', retireCriteria: ['c-3'] },
			known,
			base
		);
		if (!drafted.ok) throw new Error(drafted.reason);
		const id = drafted.request.drafts[0].id;
		const renamed = updateDraftLeafAct(ctx, drafted.request, id, { name: 'Controls' }, known, base);
		if (!renamed.ok) throw new Error(renamed.reason);
		expect(renamed.request.drafts[0].retireCriteria).toEqual(['c-3']);
		const changed = updateDraftLeafAct(ctx, renamed.request, id, { retireCriteria: ['c-1'] }, known, base);
		if (!changed.ok) throw new Error(changed.reason);
		expect(changed.request.drafts[0].retireCriteria).toEqual(['c-1']);
	});

	it('appends to an empty description without a leading blank line', () => {
		expect(editedDescription('', { descriptionAppend: 'Only line.' })).toBe('Only line.');
	});
});
