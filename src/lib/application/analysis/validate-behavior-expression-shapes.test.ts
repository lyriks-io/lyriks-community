import { describe, expect, it } from 'vitest';
import { expressionKindErrors } from './validate-behavior-expressions';

const effect = (value: unknown) => [{ kind: 'add_effect', effect: { type: 'set_state', path: 'total', value } }];

describe('behavior expression structure', () => {
	it('rejects a count path shorthand before the engine can store an inert expression', () => {
		const errors = expressionKindErrors(effect({ kind: 'count', path: 'records' }));
		expect(errors.join(' ')).toContain('op[0].effect.value.operand');
		expect(errors.join(' ')).toContain('kind:"state"');
	});

	it.each(['neg', 'not', 'sum', 'count', 'sum_pluck', 'count_where'])('requires the operand of %s', (kind) => {
		expect(expressionKindErrors(effect({ kind, field: 'status', equals: 'ready' })).join(' ')).toContain('.operand');
	});

	it.each(['add', 'sub', 'mul', 'div', 'mod', 'min', 'max'])('requires both operands of %s', (kind) => {
		expect(expressionKindErrors(effect({ kind, left: 0 })).join(' ')).toContain('.right');
	});

	it.each([{ kind: 'state', path: '' }, { kind: 'param' }, { kind: 'const', name: 7 }, { kind: 'literal' }])('rejects an incomplete reference or literal: %j', (value) => {
		expect(expressionKindErrors(effect(value)).length).toBeGreaterThan(0);
	});

	it('validates switch cases and the fallback with precise paths', () => {
		const errors = expressionKindErrors(effect({ kind: 'switch', cases: [{ then: 0 }] }));
		expect(errors.join(' ')).toContain('.cases[0].when');
		expect(errors.join(' ')).toContain('.default');
	});

	it('validates composite condition structure in guards, including updates', () => {
		const errors = expressionKindErrors([{ kind: 'update_surface_invariant', patch: { condition: { kind: 'all', conditions: {} } } }]);
		expect(errors.join(' ')).toContain('op[0].patch.condition.conditions');
	});

	it('keeps raw literals, null, false, zero, empty lists and opaque payloads valid', () => {
		for (const value of [0, false, null, [], { kind: 'count', operand: [] }, { kind: 'add', left: 0, right: 1 }, { kind: 'literal', value: { kind: 'count' } }]) {
			expect(expressionKindErrors(effect(value))).toEqual([]);
		}
	});

	it('accepts the corrected nested aggregate in an invariant', () => {
		expect(expressionKindErrors([{ kind: 'add_surface_invariant', invariant: { condition: { left: 'total', operator: 'equals', right: { kind: 'count', operand: { kind: 'state', path: 'records' } } } } }])).toEqual([]);
	});
});
