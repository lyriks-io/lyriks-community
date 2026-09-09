import { describe, expect, it } from 'vitest';

import { createEmptyExperienceDraft, type ProjectExperienceDraft } from './draft';
import { createElementNode, type InputType } from './builder';
import { detectStateTypeConflicts } from './state-type-conflicts';

function withScreens(d: ProjectExperienceDraft, screens: { id: string; name: string }[]) {
	d.screens = screens as ProjectExperienceDraft['screens'];
}

/** An input element on `surfaceId`, optionally bound to a state `path` + `inputType`. */
function input(surfaceId: string, label: string, path: string | null, inputType?: InputType) {
	const n = createElementNode(surfaceId, 'root', 'input');
	n.label = label;
	if (path) n.wiring.binding = { targetKind: 'state', targetRef: path };
	if (inputType) n.wiring.inputType = inputType;
	return n;
}

function add(d: ProjectExperienceDraft, ...nodes: ReturnType<typeof input>[]) {
	for (const n of nodes) d.builder.nodes[n.id] = n;
}

describe('detectStateTypeConflicts', () => {
	it('flags two inputs binding the same state path with conflicting types', () => {
		const d = createEmptyExperienceDraft('p1');
		withScreens(d, [
			{ id: 's1', name: 'New expense' },
			{ id: 's2', name: 'Receipt scan' }
		]);
		add(d, input('s1', 'Date', 'exp.date', 'date'), input('s2', 'Detected date', 'exp.date')); // string

		const conflicts = detectStateTypeConflicts(d);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].path).toBe('exp.date');
		expect(new Set(conflicts[0].types)).toEqual(new Set(['date', 'string']));
		expect(conflicts[0].entries.map((e) => e.screenLabel)).toContain('Receipt scan');
	});

	it('judges a select by what it projects: literal options make it an enum, a text input stays a string', () => {
		const d = createEmptyExperienceDraft('p1');
		withScreens(d, [
			{ id: 's1', name: 'Dashboard' },
			{ id: 's2', name: 'Filters' }
		]);
		const pick = createElementNode('s1', 'root', 'select');
		pick.label = 'Period';
		pick.options = ['7d', '30d', '90d'];
		pick.wiring.binding = { targetKind: 'state', targetRef: 'dashboard.period' };
		add(d, pick, input('s2', 'Period (typed)', 'dashboard.period'));

		const conflicts = detectStateTypeConflicts(d);
		expect(conflicts).toHaveLength(1);
		expect(new Set(conflicts[0].types)).toEqual(new Set(['enum', 'string']));

		// Fed from a collection, the select offers whatever the rows hold: a string, no conflict.
		pick.optionsFrom = { collection: 'Period', field: 'code' };
		expect(detectStateTypeConflicts(d)).toHaveLength(0);
	});

	it('no conflict when both inputs agree on the type', () => {
		const d = createEmptyExperienceDraft('p1');
		withScreens(d, [
			{ id: 's1', name: 'A' },
			{ id: 's2', name: 'B' }
		]);
		add(d, input('s1', 'Date', 'exp.date', 'date'), input('s2', 'Date too', 'exp.date', 'date'));
		expect(detectStateTypeConflicts(d)).toHaveLength(0);
	});

	it('ignores unbound inputs (each gets a unique synthetic path, never collides)', () => {
		const d = createEmptyExperienceDraft('p1');
		withScreens(d, [{ id: 's1', name: 'A' }]);
		add(d, input('s1', 'X', null, 'number'), input('s1', 'Y', null, 'date'));
		expect(detectStateTypeConflicts(d)).toHaveLength(0);
	});
});
