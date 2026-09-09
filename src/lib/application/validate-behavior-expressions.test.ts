import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
	CONDITION_KINDS,
	EXPRESSION_KINDS,
	REACHABILITY_GOAL_KINDS,
	expressionKindErrors
} from './validate-behavior-expressions';

/**
 * One of the engine's domain source files, read as TEXT. The application layer
 * may not import the engine (hexagonal boundary), and its published bundle
 * re-exports none of these vocabularies, so every mirror is proven against the
 * source instead. Reading text also keeps the engine's own module graph (and
 * its internal `$shared` aliases) out of our typecheck.
 */
function engineSource(file: string): string {
	const require = createRequire(import.meta.url);
	const enginePkg = require.resolve('unspaghettit/package.json');
	const root = new URL(`file://${enginePkg.replace(/package\.json$/, '')}`);
	const dir = file === 'Expression.ts' || file === 'RuleCondition.ts' ? 'value-objects' : 'entities';
	return readFileSync(
		new URL(`./src/features/behavior-model/domain/${dir}/${file}`, root),
		'utf8'
	);
}

describe('EXPRESSION_KINDS mirror', () => {
	// The application layer may not import the engine (hexagonal boundary — only
	// infrastructure may), and the engine's published bundle does not re-export
	// EXPRESSION_KINDS anyway. So the vocabulary is copied, and this test reads
	// the engine's source as TEXT to prove the copy has not drifted: a kind added
	// upstream must be added here too, or the validator starts rejecting valid
	// expressions. Reading text keeps the engine's own module graph (and its
	// internal `$shared` aliases) out of our typecheck.
	it('matches the engine vocabulary exactly', () => {
		const source = engineSource('Expression.ts');
		const block = /export const EXPRESSION_KINDS = \[([\s\S]*?)\] as const;/.exec(source);
		expect(block, 'EXPRESSION_KINDS not found in the engine source').not.toBeNull();
		const engineKinds = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
		expect(engineKinds.length).toBeGreaterThan(10);
		expect([...EXPRESSION_KINDS].sort()).toEqual(engineKinds.sort());
	});
});

describe('expressionKindErrors', () => {
	it('accepts a batch with no expressions at all', () => {
		expect(expressionKindErrors([{ kind: 'add_surface', name: 'Board' }])).toEqual([]);
	});

	it('does not mistake the op kind for an expression kind', () => {
		// Every op is discriminated by a top-level `kind` that is an operation
		// name, never an expression kind.
		expect(expressionKindErrors([{ kind: 'add_effect', effect: { type: 'allow_action' } }])).toEqual([]);
	});

	it('accepts every kind in the vocabulary', () => {
		const ops = EXPRESSION_KINDS.map((kind) => ({
			kind: 'add_effect',
			effect: { type: 'set_state', path: 'a.b', value: { kind } }
		}));
		expect(expressionKindErrors(ops)).toEqual([]);
	});

	it('accepts a real nested arithmetic tree', () => {
		const ops = [
			{
				kind: 'add_effect',
				effect: {
					type: 'set_state',
					path: 'player.points',
					value: {
						kind: 'max',
						left: { kind: 'literal', value: 0 },
						right: {
							kind: 'sub',
							left: { kind: 'state', path: 'player.points' },
							right: { kind: 'param', name: 'cost' }
						}
					}
				}
			}
		];
		expect(expressionKindErrors(ops)).toEqual([]);
	});

	// The exact defect from the retrospectives.
	it('rejects "subtract" and points at "sub"', () => {
		const ops = [
			{
				kind: 'add_effect',
				effect: {
					type: 'set_state',
					path: 'x',
					value: {
						kind: 'max',
						left: { kind: 'literal', value: 0 },
						right: {
							kind: 'subtract',
							left: { kind: 'state', path: 'x' },
							right: { kind: 'literal', value: 1 }
						}
					}
				}
			}
		];
		const errors = expressionKindErrors(ops);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('unknown expression kind "subtract"');
		expect(errors[0]).toContain('Did you mean "sub"?');
		// The path locates it inside the tree, so a 50-op batch is actionable.
		expect(errors[0]).toContain('op[0].effect.value.right.kind');
	});

	it('names every offending op in a batch', () => {
		const bad = (kind: string) => ({
			kind: 'add_effect',
			effect: { type: 'set_state', path: 'x', value: { kind } }
		});
		const errors = expressionKindErrors([bad('subtract'), bad('multiply'), { kind: 'add_surface' }]);
		expect(errors).toHaveLength(2);
		expect(errors[0]).toContain('op[0]');
		expect(errors[1]).toContain('op[1]');
		expect(errors[1]).toContain('Did you mean "mul"?');
	});

	it('reports the outermost bad kind once instead of cascading', () => {
		const ops = [
			{
				kind: 'add_effect',
				effect: {
					type: 'set_state',
					path: 'x',
					value: { kind: 'subtract', left: { kind: 'alsoWrong' }, right: { kind: 'wrongToo' } }
				}
			}
		];
		expect(expressionKindErrors(ops)).toHaveLength(1);
	});

	it('checks condition comparands, not just effect values', () => {
		const ops = [
			{
				kind: 'add_surface_invariant',
				invariant: {
					name: 'cadence stays playable',
					condition: {
						left: 'game.tick',
						operator: 'greater_than',
						right: { kind: 'subtract', left: { kind: 'literal', value: 300 }, right: { kind: 'literal', value: 10 } }
					}
				}
			}
		];
		expect(expressionKindErrors(ops)).toHaveLength(1);
	});

	it('checks list-effect comparands and items', () => {
		const ops = [
			{
				kind: 'add_effect',
				effect: {
					type: 'update_list_item',
					path: 'cart.lines',
					where: { field: 'id', equals: { kind: 'parameter', name: 'id' } },
					field: 'qty',
					value: { kind: 'param', name: 'qty' }
				}
			}
		];
		const errors = expressionKindErrors(ops);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('Did you mean "param"?');
	});

	it('leaves a literal payload opaque, so a literal object with a kind key is legal', () => {
		// The engine documents wrapping exactly this case: a literal state value
		// that happens to look like an expression must be storable.
		const ops = [
			{
				kind: 'add_effect',
				effect: {
					type: 'set_state',
					path: 'x',
					value: { kind: 'literal', value: { kind: 'not-an-expression', foo: 1 } }
				}
			}
		];
		expect(expressionKindErrors(ops)).toEqual([]);
	});

	it('checks an update_effect patch, which the engine applies WITHOUT normalising it', () => {
		// `add_effect` runs the payload through the engine's `buildEffect` (which
		// normalises expression trees); `update_effect` merges `patch` in raw. So a
		// bad kind in a patch is even more dangerous than in an add.
		const ops = [
			{
				kind: 'update_effect',
				surfaceId: 'srf-1',
				actionId: 'act-1',
				effectId: 'eff-1',
				patch: { value: { kind: 'subtract', left: { kind: 'state', path: 'x' }, right: { kind: 'literal', value: 1 } } }
			}
		];
		const errors = expressionKindErrors(ops);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('op[0].patch.value.kind');
	});

	it('walks into arrays, so a switch case is checked', () => {
		const ops = [
			{
				kind: 'add_effect',
				effect: {
					type: 'set_state',
					path: 'x',
					value: {
						kind: 'switch',
						cases: [{ when: { left: 'a', operator: 'equals', right: 1 }, then: { kind: 'minus' } }],
						default: { kind: 'literal', value: 0 }
					}
				}
			}
		];
		const errors = expressionKindErrors(ops);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('op[0].effect.value.cases[0].then.kind');
	});
});

describe('CONDITION_KINDS mirror', () => {
	// Same anti-corruption copy as EXPRESSION_KINDS, read from the engine's
	// source as text. Two declarations own the vocabulary: the composite guard
	// and the quantifier type. A naive scan of the file would also pick up the
	// `{ kind:'param' }` LEFT OPERAND, which is not a condition, so both are
	// extracted precisely.
	it('matches the engine vocabulary exactly', () => {
		const source = engineSource('RuleCondition.ts');
		// The guard opens with an early `return false`, so match the discriminating
		// return, not the first one.
		const guard = /export const isCompositeCondition[\s\S]*?return (k === [^;]+);/.exec(source);
		expect(guard, 'isCompositeCondition not found in the engine source').not.toBeNull();
		const quantifier = /export type QuantifierCondition = \{\s*readonly kind: ([^;]+);/.exec(
			source
		);
		expect(quantifier, 'QuantifierCondition not found in the engine source').not.toBeNull();
		const kinds = [...guard![1].matchAll(/'([a-z_]+)'/g), ...quantifier![1].matchAll(/'([a-z_]+)'/g)]
			.map((m) => m[1])
			.sort();
		expect([...CONDITION_KINDS].sort()).toEqual(kinds);
	});
});

describe('REACHABILITY_GOAL_KINDS mirror', () => {
	it('matches the engine vocabulary exactly', () => {
		const source = engineSource('ReachabilityGoal.ts');
		const block = /export type ReachabilityGoalKind = ([^;]+);/.exec(source);
		expect(block, 'ReachabilityGoalKind not found in the engine source').not.toBeNull();
		const kinds = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
		expect([...REACHABILITY_GOAL_KINDS].sort()).toEqual(kinds);
	});
});

describe('conditions are not expressions', () => {
	// Every case here was rejected by the validator before the walk learned the
	// three grammars, on a real 83-feature build. The compound invariant is the
	// one that mattered: it is how an ordering guarantee is written at all.
	const invariant = (condition: unknown) => [
		{ kind: 'add_feature_invariant', invariant: { name: 'ordered', condition } }
	];

	it('accepts a compound invariant', () => {
		expect(
			expressionKindErrors(
				invariant({
					kind: 'all',
					conditions: [
						{ left: 'doc.hashedAt', operator: 'is_not_null' },
						{ left: 'doc.strippedAt', operator: 'is_null' }
					]
				})
			)
		).toEqual([]);
	});

	it('accepts any, not, and both quantifiers', () => {
		for (const condition of [
			{ kind: 'any', conditions: [{ left: 'a', operator: 'equals', right: 1 }] },
			{ kind: 'not', condition: { left: 'a', operator: 'equals', right: 1 } },
			{ kind: 'all_match', overPath: 'lines', as: 'item', where: { left: 'item.qty', operator: 'greater_than', right: 0 } },
			{ kind: 'any_match', overPath: 'lines', as: 'item', where: { left: 'item.qty', operator: 'equals', right: 0 } }
		]) {
			expect(expressionKindErrors(invariant(condition))).toEqual([]);
		}
	});

	it('accepts a param left operand inside a condition', () => {
		expect(
			expressionKindErrors(
				invariant({ left: { kind: 'param', name: 'amount' }, operator: 'greater_than', right: 0 })
			)
		).toEqual([]);
	});

	it('still rejects a typo inside the condition vocabulary, and points at the fix', () => {
		const errors = expressionKindErrors(invariant({ kind: 'and', conditions: [] }));
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('unknown condition kind "and"');
		expect(errors[0]).toContain('Did you mean "all"?');
	});

	it('names the encoding for implication, which has no node of its own', () => {
		const errors = expressionKindErrors(invariant({ kind: 'implies', conditions: [] }));
		expect(errors[0]).toContain('There is no implication node');
		expect(errors[0]).toContain('kind:"not"');
	});

	it('returns to the expression vocabulary inside a condition operand', () => {
		const errors = expressionKindErrors(
			invariant({ left: 'total', operator: 'equals', right: { kind: 'subtract', left: 1, right: 2 } })
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('unknown expression kind "subtract"');
		expect(errors[0]).toContain('Did you mean "sub"?');
	});

	it('reads a switch case guard as a condition', () => {
		expect(
			expressionKindErrors([
				{
					kind: 'add_effect',
					effect: {
						type: 'set_state',
						value: {
							kind: 'switch',
							cases: [{ when: { kind: 'any', conditions: [] }, then: { kind: 'literal', value: 1 } }],
							default: { kind: 'literal', value: 0 }
						}
					}
				}
			])
		).toEqual([]);
	});
});

describe('reachability goals', () => {
	it('accepts a nested goal body', () => {
		expect(
			expressionKindErrors([
				{
					kind: 'add_reachability_goal',
					goal: {
						name: 'closable',
						kind: 'always_reachable',
						condition: { kind: 'any', conditions: [{ left: 'case.state', operator: 'equals', right: 'closed' }] }
					}
				}
			])
		).toEqual([]);
	});

	it('rejects a goal kind the model checker would never match', () => {
		const errors = expressionKindErrors([
			{ kind: 'add_reachability_goal', goal: { name: 'x', kind: 'liveness', condition: {} } }
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('unknown reachability goal kind "liveness"');
		expect(errors[0]).toContain('never actually verified');
	});

	it('reads an update patch as a goal body too', () => {
		const errors = expressionKindErrors([
			{ kind: 'update_reachability_goal', goalId: 'g1', patch: { kind: 'sometimes' } }
		]);
		expect(errors[0]).toContain('unknown reachability goal kind "sometimes"');
	});
});
