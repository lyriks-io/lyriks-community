import { describe, expect, it } from 'vitest';
import { actionEditOp, editShapeOf } from './edits';

describe('an action is renamed and described in place [criterion:701caee5]', () => {
	it('offers its name and what it is for, written into its feature behavior model', () => {
		expect(editShapeOf('action:f1:a1')).toEqual({ section: 'behavior', text: 'Name', desc: 'What it is for', tags: null });
		expect(actionEditOp('action:f1:a1', 's1', 'selectRoom', { text: ' Select a room ', desc: ' Pick a room from the results. ' })).toEqual({
			kind: 'update_action',
			surfaceId: 's1',
			actionId: 'a1',
			name: 'Select a room',
			intent: 'Pick a room from the results.'
		});
	});

	it('keeps the name before when the new one is blank, and names no action otherwise', () => {
		expect(actionEditOp('action:f1:a1', 's1', 'selectRoom', { text: '  ' })).toEqual({ kind: 'update_action', surfaceId: 's1', actionId: 'a1', name: 'selectRoom' });
		expect(actionEditOp('feature:f1', 's1', 'x', { text: 'y' })).toBeNull();
	});

	it('keeps the stored identifier when only what it is for changed [criterion:ac-leaf-ac-tree-readable-actions]', () => {
		// The field starts from the name read in words: left as it was, it renames nothing.
		expect(actionEditOp('action:f1:a1', 's1', 'await_risk_inputs', { text: 'Await Risk Inputs', desc: 'Wait for the indicators.' })).toEqual({
			kind: 'update_action',
			surfaceId: 's1',
			actionId: 'a1',
			name: 'await_risk_inputs',
			intent: 'Wait for the indicators.'
		});
	});
});
