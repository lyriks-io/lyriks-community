import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
	CONDITION_KINDS,
	EXPRESSION_KINDS,
	REACHABILITY_GOAL_KINDS,
	expressionKindErrors
} from './validate-behavior-expressions';

/**
 * The vocabularies the engine publishes, read from its shipped type
 * declarations through the TypeScript checker. The application layer may not
 * import the engine (hexagonal boundary) and its bundle re-exports none of
 * them, so each mirror below is proven against the declared types: a kind the
 * engine adds or drops fails the comparison.
 */
function engineDeclarations(file: string): { checker: ts.TypeChecker; source: ts.SourceFile } {
	const require = createRequire(import.meta.url);
	const root = require.resolve('unspaghettit/package.json').replace(/package\.json$/, '');
	const path = `${root}dist/types/features/behavior-model/domain/${file}`;
	const program = ts.createProgram([path], { noEmit: true, skipLibCheck: true });
	const source = program.getSourceFile(path);
	if (!source) throw new Error(`${file} is not in the engine's declarations`);
	return { checker: program.getTypeChecker(), source };
}

const literals = (type: ts.Type): string[] =>
	(type.isUnion() ? type.types : [type]).flatMap((t) => (t.isStringLiteral() ? [t.value] : []));

/** The string literals of a declared const tuple (`readonly ['a', 'b']`). */
function tupleKinds(file: string, name: string): string[] {
	const { checker, source } = engineDeclarations(file);
	const declaration = source.statements
		.filter(ts.isVariableStatement)
		.flatMap((s) => [...s.declarationList.declarations])
		.find((d) => ts.isIdentifier(d.name) && d.name.text === name);
	if (!declaration) throw new Error(`${name} is not declared in ${file}`);
	const tuple = checker.getTypeAtLocation(declaration.name) as ts.TypeReference;
	return checker.getTypeArguments(tuple).flatMap(literals).sort();
}

/** The `kind` literals of every member of a declared type alias, or its own literals. */
function aliasKinds(file: string, name: string): string[] {
	const { checker, source } = engineDeclarations(file);
	const alias = source.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === name);
	if (!alias) throw new Error(`${name} is not declared in ${file}`);
	const type = checker.getTypeAtLocation(alias.name);
	const members = type.isUnion() ? type.types : [type];
	const kinds = members.flatMap((member) => {
		if (member.isStringLiteral()) return [member.value];
		const kind = member.getProperty('kind');
		return kind ? literals(checker.getTypeOfSymbol(kind)) : [];
	});
	return [...new Set(kinds)].sort();
}

describe('EXPRESSION_KINDS mirror', () => {
	// The engine treats an object whose kind is not in its vocabulary as a
	// literal; a kind it adds must be added here too, or the validator starts
	// rejecting valid expressions.
	it('matches the engine vocabulary exactly', () => {
		const engineKinds = tupleKinds('value-objects/Expression.d.ts', 'EXPRESSION_KINDS');
		expect(engineKinds.length).toBeGreaterThan(10);
		expect([...EXPRESSION_KINDS].sort()).toEqual(engineKinds);
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

	it('accepts complete nodes for every kind in the vocabulary', () => {
		const ops = EXPRESSION_KINDS.map((kind) => ({
			kind: 'add_effect',
			effect: { type: 'set_state', path: 'a.b', value: {
				kind, value: 0, path: 'records', name: 'amount', left: 0, right: 1,
				operand: [], field: 'status', equals: 'ready', cases: [], default: 0
			} }
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
	// The composite and quantifier conditions own the vocabulary; a leaf
	// condition carries no kind, and its `{ kind: 'param' }` left operand is
	// not a condition.
	it('matches the engine vocabulary exactly', () => {
		const kinds = [
			...aliasKinds('value-objects/RuleCondition.d.ts', 'CompositeRuleCondition'),
			...aliasKinds('value-objects/RuleCondition.d.ts', 'QuantifierCondition')
		].sort();
		expect(kinds.length).toBeGreaterThan(3);
		expect([...CONDITION_KINDS].sort()).toEqual(kinds);
	});
});

describe('REACHABILITY_GOAL_KINDS mirror', () => {
	it('matches the engine vocabulary exactly', () => {
		expect([...REACHABILITY_GOAL_KINDS].sort()).toEqual(aliasKinds('entities/ReachabilityGoal.d.ts', 'ReachabilityGoalKind'));
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

describe('domain payloads are not read as expressions', () => {
	// Each of these was refused in production by a message listing arithmetic
	// kinds, on an operation written exactly as the engine's reference documents.
	it('accepts an acceptance criterion relation', () => {
		expect(
			expressionKindErrors([
				{
					kind: 'add_acceptance_criterion',
					title: 'Wild fruit trees stay rare',
					status: 'draft',
					relations: [{ kind: 'refines', criterionId: '8da2756a' }]
				}
			])
		).toEqual([]);
	});

	it('accepts the nested resource form the engine calls preferred', () => {
		expect(
			expressionKindErrors([
				{
					kind: 'add_resource',
					resource: { name: 'Tide table', kind: 'datastore', provider: 'local' }
				}
			])
		).toEqual([]);
	});

	it("does not read a constant's author payload", () => {
		expect(
			expressionKindErrors([
				{ kind: 'add_constant', name: 'tideCurve', value: { kind: 'sinusoid', period: 12 } }
			])
		).toEqual([]);
	});

	it('reads an update patch as domain data too', () => {
		expect(
			expressionKindErrors([
				{
					kind: 'update_acceptance_criterion',
					criterionId: 'c1',
					patch: { relations: [{ kind: 'supersedes', criterionId: 'c0' }] }
				},
				{ kind: 'update_resource', resourceId: 'r1', patch: { kind: 'service' } }
			])
		).toEqual([]);
	});

	it('still catches a mistyped expression kind in the same batch', () => {
		const errors = expressionKindErrors([
			{ kind: 'add_resource', resource: { kind: 'datastore' } },
			{
				kind: 'add_effect',
				effect: { type: 'set_state', value: { kind: 'subtract', left: 1, right: 2 } }
			}
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('unknown expression kind "subtract"');
		expect(errors[0]).toContain('Did you mean "sub"?');
	});
});
