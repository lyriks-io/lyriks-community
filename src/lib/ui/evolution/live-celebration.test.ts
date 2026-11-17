import { describe, expect, it } from 'vitest';
import type { ClosingChange } from '$domain/evolution';
import { liveCelebrationOf } from './live-celebration';

/** The success dialog of a live evolution [criterion:ac-leaf-ac-evo-verd-live-celebration]. */

const changes = [
	{ sign: '~', kind: 'Feature', label: 'Manage users', count: 14, noun: 'feature' },
	{ sign: '+', kind: 'Rule', label: 'rules', count: 18, noun: 'rule' },
	{ sign: '~', kind: 'Rule', label: 'rule', count: 1, noun: 'rule' },
	{ sign: '+', kind: 'Action', label: 'action', count: 1, noun: 'action' },
	{ sign: '+', kind: 'Data', label: 'addedByAdmin', count: 1, noun: 'field' }
] satisfies ClosingChange[];
const base = {
	key: 'EVO-001',
	title: 'Fix the problems the retro-spec found',
	changes,
	version: { from: 'v1.0', to: 'v1.1' },
	check: { carried: 143, found: 143, missing: [] },
	merged: { into: 'main', commit: '4426ba511abd' },
	branchLeft: true,
	heldEntries: 0
};

describe('the success dialog of a live evolution [criterion:ac-leaf-ac-evo-verd-live-celebration]', () => {
	it('names the request, the merge and the version it moved the Specification 360° to', () => {
		const c = liveCelebrationOf(base);
		expect(c.title).toBe('EVO-001 is live');
		expect(c.lead).toBe('Merged into main@4426ba5, "Fix the problems the retro-spec found" is now the official specification. It moved the specification from v1.0 to v1.1.');
	});

	it('counts what became official by kind, four kinds at most, in the order of the product', () => {
		expect(liveCelebrationOf(base).figures).toEqual([
			{ value: 14, label: 'features' },
			{ value: 1, label: 'action' },
			{ value: 19, label: 'rules' },
			{ value: 1, label: 'field' }
		]);
	});

	it('says whether everything is in the specification, or how many changes are not', () => {
		expect(liveCelebrationOf(base).check).toEqual({ whole: true, text: 'Checked in Knowledge: all 143 changes are there.' });
		expect(liveCelebrationOf({ ...base, check: { carried: 143, found: 140, missing: [] } }).check).toEqual({
			whole: false,
			text: '3 of 143 changes are not in Knowledge: What happened lists them.'
		});
		expect(liveCelebrationOf({ ...base, check: null }).check).toBeNull();
	});

	it('closed by hand, without a branch, it says so and leaves only the sync to do', () => {
		const c = liveCelebrationOf({ ...base, merged: null, branchLeft: false, version: null, heldEntries: 4 });
		expect(c.lead).toBe('"Fix the problems the retro-spec found" is now the official specification.');
		expect(c.next).toBe('Next: Lyriks syncs the index again, from What comes next.');
	});

	it('never offers the sync the merge report already made [criterion:ac-leaf-ac-evo-branch-merge-syncs]', () => {
		expect(liveCelebrationOf(base).next).toBe('The index is synced. Left to you: delete the merged branch when you like, from What comes next.');
		expect(liveCelebrationOf({ ...base, heldEntries: 3 }).next).toBe('Next: Lyriks syncs the index again and deletes the merged branch, both from What comes next.');
		expect(liveCelebrationOf({ ...base, branchLeft: false }).next).toBe('The index is synced: nothing is left to do.');
	});
});
