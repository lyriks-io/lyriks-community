import { describe, expect, it } from 'vitest';
import { GraphBuilder, nodeId, type GraphNode } from '$domain/graph';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { buildBehaviorGraphElements } from './build-behavior-knowledge-graph';

const snapshot = (feature: Record<string, unknown>): UnspaFeatureSnapshot => ({
	format: 'unspaghettit',
	version: 1,
	feature
});

describe('buildBehaviorGraphElements — Lyriks bindings', () => {
	it('connects canonical behavior objects to their Lyriks counterparts', () => {
		const root = nodeId('project', 'p1');
		const graph = new GraphBuilder();
		([
			{ id: root, kind: 'project', context: 'project', label: 'Project' },
			{ id: nodeId('feature', 'feat-1'), kind: 'feature', context: 'features', label: 'Returns' },
			{ id: nodeId('journey', 'journey-1'), kind: 'journey', context: 'experience', label: 'Return flow' },
			{ id: nodeId('screen', 'screen-1'), kind: 'screen', context: 'experience', label: 'Return form' },
			{ id: nodeId('step', 'step-1'), kind: 'step', context: 'experience', label: 'Submit return' },
			{ id: nodeId('role', 'role-1'), kind: 'role', context: 'users', label: 'Merchant' },
			{ id: nodeId('database', 'db-1'), kind: 'database', context: 'data', label: 'Main DB' },
			{ id: nodeId('entity', 'entity-1'), kind: 'entity', context: 'data', label: 'Return' },
			{ id: nodeId('field', 'field-1'), kind: 'field', context: 'data', label: 'status' }
		] satisfies GraphNode[]).forEach((node) => graph.addNode(node));

		const elements = buildBehaviorGraphElements(root, [
			snapshot({
				id: 'feat-1',
				name: 'Returns',
				personas: [{ id: 'per-role-1', name: 'Merchant' }],
				dependencies: [
					{
						id: 'payments-api',
						name: 'Payments API',
						kind: 'api',
						operations: [{ id: 'refund-op', name: 'create refund' }]
					}
				],
				resources: [{ id: 'res-db-db-1', name: 'Main DB', type: 'database' }],
				entities: [
					{
						id: 'ent-entity-1',
						name: 'Return',
						resourceId: 'res-db-db-1',
						fields: [{ id: 'fld-field-1', name: 'status', type: 'string' }]
					}
				],
				surfaces: [
					{
						id: 'srf-journey-1',
						name: 'Return flow',
						type: 'workflow',
						stateDefinitions: [{ id: 'state-1', path: 'return.status', type: 'string' }],
						rules: [
							{
								id: 'surface-rule-1',
								description: 'Only submitted returns can be approved',
								condition: { left: 'return.status', operator: 'equals', right: 'submitted' }
							}
						],
						transitions: [{ toSurface: 'srf-screen-screen-1' }],
						actions: [
							{
								id: 'act-step-1',
								name: 'Submit return',
								emittedEvents: ['return.submitted'],
								parameters: [{ id: 'parameter-1', name: 'status', bindToStatePath: 'return.status' }],
								effects: [
									{ id: 'effect-1', type: 'set_state', path: 'return.status' },
									{ id: 'effect-2', type: 'emit_event', event: 'return.submitted' },
									{
										id: 'effect-3',
										type: 'invoke_operation',
										dependencyId: 'payments-api',
										operation: 'create refund',
										resultPath: 'refund.status'
									}
								],
								scenarios: [
									{
										id: 'scenario-1',
										name: 'Submit succeeds',
										stateOverrides: [{ path: 'return.status', value: 'draft' }],
										expectedAssertions: [{ path: 'return.status', operator: 'equals', value: 'submitted' }]
									}
								],
								transitions: [{ toSurface: 'srf-screen-screen-1' }]
							}
						]
					},
					{ id: 'srf-screen-screen-1', name: 'Return form', type: 'screen', actions: [] }
				]
			})
		]);
		elements.nodes.forEach((node) => graph.addNode(node));
		elements.edges.forEach((edge) => graph.addEdge(edge));
		const built = graph.build('p1', '2026-07-16T00:00:00.000Z');
		expect(built.nodes.some((node) => node.kind === 'effect')).toBe(false);

		expect(built.edges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ from: nodeId('feature', 'feat-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('journey', 'journey-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('screen', 'screen-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('step', 'step-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('role', 'role-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('database', 'db-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('entity', 'entity-1'), kind: 'binds' }),
				expect.objectContaining({ from: nodeId('field', 'field-1'), kind: 'binds' }),
				expect.objectContaining({
					from: nodeId('action', 'act-step-1'),
					to: nodeId('surface', 'srf-screen-screen-1'),
					kind: 'transitions'
				}),
				expect.objectContaining({
					from: nodeId('action', 'act-step-1'),
					to: nodeId('state', 'return.status'),
					kind: 'writes'
				}),
				expect.objectContaining({
					from: nodeId('rule', 'beh:feat-1:surface-rule-1'),
					to: nodeId('state', 'return.status'),
					kind: 'reads'
				}),
				expect.objectContaining({
					from: nodeId('scenario', 'beh:feat-1:scenario-1'),
					to: nodeId('state', 'return.status'),
					kind: 'tests'
				}),
				expect.objectContaining({
					from: nodeId('action', 'act-step-1'),
					to: nodeId('event', 'return.submitted'),
					kind: 'emits'
				}),
				expect.objectContaining({
					from: nodeId('action', 'act-step-1'),
					to: nodeId('dependency', 'beh:payments-api'),
					kind: 'uses'
				}),
				expect.objectContaining({
					from: nodeId('action', 'act-step-1'),
					to: nodeId('state', 'refund.status'),
					kind: 'writes'
				})
			])
		);
	});

	it('collapses an effect repeated by feature snapshots into a direct semantic edge', () => {
		const root = nodeId('project', 'p1');
		const repeatedSurface = {
			id: 'surface-1',
			name: 'Expense form',
			actions: [
				{
					id: 'action-1',
					name: 'Submit',
					effects: [{ id: 'effect-1', type: 'emit_event', event: 'expense.submitted' }]
				}
			]
		};
		const elements = buildBehaviorGraphElements(root, [
			snapshot({ id: 'feature-1', name: 'Create expense', surfaces: [repeatedSurface] }),
			snapshot({ id: 'feature-2', name: 'Submit report', surfaces: [repeatedSurface] })
		]);

		expect(elements.nodes.filter((candidate) => candidate.kind === 'effect')).toEqual([]);

		const graph = new GraphBuilder();
		graph.addNode({ id: root, kind: 'project', context: 'project', label: 'Project' });
		elements.nodes.forEach((candidate) => graph.addNode(candidate));
		elements.edges.forEach((edge) => graph.addEdge(edge));
		const built = graph.build('p1', '2026-07-21T00:00:00.000Z');
		expect(
			built.edges.some(
				(edge) => edge.from === 'action:action-1' && edge.to === 'event:expense.submitted'
			)
		).toBe(true);
		expect(
			built.edges.filter(
				(edge) => edge.from === 'action:action-1' && edge.to === 'event:expense.submitted'
			)
		).toHaveLength(1);
	});

	it('keeps one reads edge per feature when two features reuse a rule id', () => {
		// Rule ids are unique within a feature, never across features. The rule NODES
		// are already feature-scoped, so an edge id that is not loses one of them to
		// the builder's dedupe, and a feature silently stops reading its own state.
		const root = nodeId('project', 'p1');
		const surface = (sid: string) => ({
			id: sid,
			name: 'Order form',
			rules: [
				{
					id: 'shared-rule',
					name: 'Only paid orders ship',
					condition: { left: 'order.status', operator: 'equals', right: 'paid' }
				}
			],
			actions: []
		});
		const elements = buildBehaviorGraphElements(root, [
			snapshot({ id: 'feat-1', name: 'Checkout', surfaces: [surface('srf-1')] }),
			snapshot({ id: 'feat-2', name: 'Fulfilment', surfaces: [surface('srf-2')] })
		]);

		const graph = new GraphBuilder();
		graph.addNode({ id: root, kind: 'project', context: 'project', label: 'Project' });
		elements.nodes.forEach((node) => graph.addNode(node));
		elements.edges.forEach((edge) => graph.addEdge(edge));
		const built = graph.build('p1', '2026-09-20T00:00:00.000Z');

		const reads = built.edges.filter(
			(edge) => edge.kind === 'reads' && edge.to === nodeId('state', 'order.status')
		);
		expect(reads.map((edge) => edge.from).sort()).toEqual([
			nodeId('rule', 'beh:feat-1:shared-rule'),
			nodeId('rule', 'beh:feat-2:shared-rule')
		]);
	});
});

describe('buildBehaviorGraphElements, what a feature promises', () => {
	const root = nodeId('project', 'p1');
	const build = (features: Record<string, unknown>[]) =>
		buildBehaviorGraphElements(root, features.map(snapshot));
	const edgeBetween = (
		elements: ReturnType<typeof buildBehaviorGraphElements>,
		from: string,
		to: string
	) => elements.edges.filter((edge) => edge.from === from && edge.to === to);

	it('projects an acceptance criterion with its prose, its surface and what it relates to', () => {
		const elements = build([
			{
				id: 'feat-1',
				name: 'Footsteps',
				acceptanceCriteria: [
					{
						id: 'crit-1',
						title: 'Silent in deep water',
						given: 'the player is swimming',
						when: 'they move',
						then: 'no footstep is heard',
						expectedOutcome: 'success',
						status: 'active',
						relatedSurfaceId: 'srf-1',
						relations: [
							{ kind: 'supersedes', criterionId: 'crit-0' },
							{ kind: 'exception_to', criterionId: 'crit-far', featureId: 'feat-2' }
						]
					},
					{ id: 'crit-0', title: 'Always audible', given: 'g', when: 'w', then: 't' }
				],
				surfaces: [{ id: 'srf-1', name: 'Terrain', actions: [] }]
			},
			{ id: 'feat-2', name: 'Water', acceptanceCriteria: [{ id: 'crit-far', title: 'Splashes' }] }
		]);

		const criterion = elements.nodes.find((node) => node.id === nodeId('criterion', 'beh:feat-1:crit-1'));
		expect(criterion).toMatchObject({
			kind: 'criterion',
			context: 'behavior',
			label: 'Silent in deep water',
			// The prose is the detail, so searching its words finds the criterion.
			detail: 'the player is swimming · they move · no footstep is heard',
			meta: { status: 'active', expectedOutcome: 'success' }
		});

		const criterionId = nodeId('criterion', 'beh:feat-1:crit-1');
		expect(edgeBetween(elements, nodeId('feature', 'beh:feat-1'), criterionId)[0]).toMatchObject({ kind: 'contains' });
		expect(edgeBetween(elements, criterionId, nodeId('surface', 'srf-1'))[0]).toMatchObject({ kind: 'relates', label: 'about' });
		expect(edgeBetween(elements, criterionId, nodeId('criterion', 'beh:feat-1:crit-0'))[0]).toMatchObject({
			kind: 'relates',
			label: 'supersedes'
		});
		// A relation naming another feature resolves there, not here.
		expect(edgeBetween(elements, criterionId, nodeId('criterion', 'beh:feat-2:crit-far'))[0]).toMatchObject({
			kind: 'relates',
			label: 'exception to'
		});

		// Every one of them survives a real build: no endpoint is dangling.
		const graph = new GraphBuilder();
		graph.addNode({ id: root, kind: 'project', context: 'project', label: 'Project' });
		elements.nodes.forEach((node) => graph.addNode(node));
		elements.edges.forEach((edge) => graph.addEdge(edge));
		const built = graph.build('p1', '2026-09-20T00:00:00.000Z');
		expect(built.edges.filter((edge) => edge.from === criterionId)).toHaveLength(3);
	});

	it('projects feature invariants and reachability goals as rules that read their states', () => {
		const elements = build([
			{
				id: 'feat-1',
				name: 'Cart',
				featureInvariants: [
					{ id: 'fi-1', name: 'Never negative', condition: { left: 'cart.total', operator: 'gte', right: 0 } }
				],
				reachabilityGoals: [
					{
						id: 'goal-1',
						name: 'Checkout always completes',
						kind: 'always_reachable',
						condition: { left: 'order.placed', operator: 'equals', right: true }
					}
				]
			}
		]);

		expect(elements.nodes.find((node) => node.id === nodeId('rule', 'beh:feat-1:fi-1'))).toMatchObject({
			kind: 'rule',
			label: 'Never negative',
			detail: 'feature invariant'
		});
		expect(elements.nodes.find((node) => node.id === nodeId('rule', 'beh:feat-1:goal-1'))).toMatchObject({
			kind: 'rule',
			label: 'Checkout always completes',
			detail: 'reachability goal · always_reachable'
		});
		expect(edgeBetween(elements, nodeId('rule', 'beh:feat-1:fi-1'), nodeId('state', 'cart.total'))[0]).toMatchObject({ kind: 'reads' });
		expect(edgeBetween(elements, nodeId('rule', 'beh:feat-1:goal-1'), nodeId('state', 'order.placed'))[0]).toMatchObject({ kind: 'reads' });
		expect(edgeBetween(elements, nodeId('feature', 'beh:feat-1'), nodeId('rule', 'beh:feat-1:goal-1'))[0]).toMatchObject({ kind: 'contains' });
	});

	it('projects a constant and every rule, invariant and effect that reads it', () => {
		const constant = { kind: 'const', name: 'freeShippingFrom' };
		const elements = build([
			{
				id: 'feat-1',
				name: 'Shipping',
				constants: [{ id: 'const-1', name: 'freeShippingFrom', value: 50, description: 'Order total above which shipping is free' }],
				featureInvariants: [{ id: 'fi-1', name: 'Threshold is respected', condition: { left: 'cart.total', operator: 'gte', right: constant } }],
				surfaces: [
					{
						id: 'srf-1',
						name: 'Cart',
						rules: [{ id: 'sr-1', name: 'Free over threshold', condition: { left: 'cart.total', operator: 'gte', right: constant } }],
						actions: [
							{
								id: 'act-1',
								name: 'Recompute',
								effects: [
									{
										id: 'eff-1',
										type: 'set_state',
										path: 'cart.shipping',
										value: { kind: 'switch', cases: [{ when: { left: 'cart.total', operator: 'gte', right: constant }, then: { kind: 'literal', value: 0 } }], default: constant }
									}
								]
							}
						]
					}
				]
			}
		]);

		const constantNodeId = nodeId('constant', 'beh:feat-1:freeShippingFrom');
		expect(elements.nodes.find((node) => node.id === constantNodeId)).toMatchObject({
			kind: 'constant',
			label: 'freeShippingFrom',
			detail: 'Order total above which shipping is free',
			meta: { value: 50 }
		});
		for (const from of [
			nodeId('feature', 'beh:feat-1'),
			nodeId('rule', 'beh:feat-1:fi-1'),
			nodeId('rule', 'beh:feat-1:sr-1'),
			nodeId('action', 'act-1')
		]) {
			expect(edgeBetween(elements, from, constantNodeId), from).toHaveLength(1);
		}
		expect(edgeBetween(elements, nodeId('action', 'act-1'), constantNodeId)[0]).toMatchObject({ kind: 'reads' });
		expect(edgeBetween(elements, nodeId('feature', 'beh:feat-1'), constantNodeId)[0]).toMatchObject({ kind: 'contains' });
	});

	it('never draws an edge to a constant the feature never declared', () => {
		const elements = build([
			{
				id: 'feat-1',
				name: 'Shipping',
				featureInvariants: [
					{ id: 'fi-1', name: 'Typo', condition: { left: 'cart.total', operator: 'gte', right: { kind: 'const', name: 'freeShipingFrom' } } }
				]
			}
		]);
		expect(elements.nodes.some((node) => node.kind === 'constant')).toBe(false);
		expect(elements.edges.some((edge) => edge.to.startsWith('constant:'))).toBe(false);
	});

	it('projects a value set and what points at it', () => {
		const elements = build([
			{
				id: 'feat-1',
				name: 'Orders',
				valueSets: [{ id: 'vs-status', name: 'Order status', values: ['draft', 'paid', 'shipped'] }],
				surfaces: [
					{
						id: 'srf-1',
						name: 'Order',
						stateDefinitions: [{ id: 'st-1', path: 'order.status', type: 'enum', valueSetId: 'vs-status' }],
						actions: [{ id: 'act-1', name: 'Set status', parameters: [{ id: 'p-1', name: 'status', valueSetId: 'vs-status' }] }]
					}
				]
			}
		]);

		const valueSetNodeId = nodeId('valueSet', 'beh:feat-1:vs-status');
		expect(elements.nodes.find((node) => node.id === valueSetNodeId)).toMatchObject({
			kind: 'valueSet',
			label: 'Order status',
			// The allowed values, so a search for one of them finds the set.
			detail: 'draft | paid | shipped'
		});
		expect(edgeBetween(elements, nodeId('feature', 'beh:feat-1'), valueSetNodeId)[0]).toMatchObject({ kind: 'contains' });
		expect(edgeBetween(elements, nodeId('state', 'order.status'), valueSetNodeId)[0]).toMatchObject({ kind: 'uses' });
		expect(edgeBetween(elements, nodeId('action', 'act-1'), valueSetNodeId)[0]).toMatchObject({ kind: 'uses' });
	});

	it('reads the states nested in an effect value, beside the state it writes', () => {
		const elements = build([
			{
				id: 'feat-1',
				name: 'Cart',
				surfaces: [
					{
						id: 'srf-1',
						name: 'Cart',
						actions: [
							{
								id: 'act-1',
								name: 'Recompute total',
								effects: [
									{
										id: 'eff-1',
										type: 'set_state',
										path: 'cart.total',
										value: {
											kind: 'add',
											left: { kind: 'state', path: 'cart.subtotal' },
											right: { kind: 'mul', left: { kind: 'state', path: 'cart.taxRate' }, right: { kind: 'literal', value: 100 } }
										}
									}
								]
							}
						]
					}
				]
			}
		]);

		expect(edgeBetween(elements, nodeId('action', 'act-1'), nodeId('state', 'cart.total'))[0]).toMatchObject({ kind: 'writes' });
		// Both operands, one of them two levels down, which nothing projected before.
		for (const path of ['cart.subtotal', 'cart.taxRate']) {
			expect(edgeBetween(elements, nodeId('action', 'act-1'), nodeId('state', path))[0], path).toMatchObject({ kind: 'reads' });
		}
	});

	it('reads the states a derived formula computes from', () => {
		const elements = build([
			{
				id: 'feat-1',
				name: 'Cart',
				constants: [{ id: 'c-1', name: 'taxRate', value: 0.2, description: 'VAT' }],
				surfaces: [
					{
						id: 'srf-1',
						name: 'Cart',
						stateDefinitions: [
							{
								id: 'st-1',
								path: 'cart.total',
								derived: {
									kind: 'mul',
									left: { kind: 'state', path: 'cart.subtotal' },
									right: { kind: 'const', name: 'taxRate' }
								}
							}
						],
						actions: []
					}
				]
			}
		]);

		expect(edgeBetween(elements, nodeId('state', 'cart.total'), nodeId('state', 'cart.subtotal'))[0]).toMatchObject({ kind: 'reads' });
		expect(edgeBetween(elements, nodeId('state', 'cart.total'), nodeId('constant', 'beh:feat-1:taxRate'))[0]).toMatchObject({ kind: 'reads' });
	});

	it('builds an older snapshot exactly as it did before any of this', () => {
		// Locked against the pre-change builder: the same feature, run through both,
		// produced these same ids (the rule->state edge apart, which fix 6 scoped).
		const elements = build([
			{
				id: 'feat-1',
				name: 'Returns',
				description: 'Return handling',
				personas: [{ id: 'per-role-1', name: 'Merchant' }],
				events: [{ id: 'ev1', name: 'return.submitted' }],
				surfaces: [
					{
						id: 'srf-journey-1',
						name: 'Flow',
						type: 'workflow',
						stateDefinitions: [{ id: 's1', path: 'return.status', type: 'string' }],
						rules: [{ id: 'sr1', name: 'R', condition: { left: 'return.status', operator: 'equals', right: 'paid' } }],
						actions: [
							{
								id: 'act-step-1',
								name: 'Submit',
								parameters: [{ id: 'p1', name: 'status', bindToStatePath: 'return.status' }],
								emittedEvents: ['return.submitted'],
								effects: [{ id: 'e1', type: 'set_state', path: 'return.total' }],
								scenarios: [{ id: 'sc1', name: 'S', expectedAssertions: [{ path: 'return.total' }] }]
							}
						]
					}
				]
			}
		]);

		expect(elements.nodes.map((node) => node.id).sort()).toEqual([
			'action:act-step-1',
			'event:return.submitted',
			'feature:beh:feat-1',
			'persona:beh:per-role-1',
			'rule:beh:feat-1:sr1',
			'scenario:beh:feat-1:sc1',
			'state:return.status',
			'state:return.total',
			'surface:srf-journey-1'
		]);
		expect(elements.edges.map((edge) => edge.id).sort()).toEqual([
			'e:beh:act-step-1->parameter-state:p1:return.status',
			'e:beh:act-step-1:emits:return.submitted',
			'e:beh:act-step-1:writes:return.total',
			'e:beh:feat-1->event:return.submitted',
			'e:beh:feat-1->persona:per-role-1',
			'e:beh:feat-1->srf-journey-1',
			'e:beh:feat-1:rule:sr1->state:return.status',
			'e:beh:project:p1->feat-1',
			'e:beh:scenario:sc1->act-step-1',
			'e:beh:scenario:sc1->state:return.total',
			'e:beh:srf-journey-1->act-step-1',
			'e:beh:srf-journey-1->rule:sr1',
			'e:beh:srf-journey-1->state:return.status',
			'e:bind:element:step-1',
			'e:bind:feature:feat-1',
			'e:bind:journey:journey-1',
			'e:bind:role:role-1',
			'e:bind:step:step-1'
		]);
		// None of the newer kinds appears for a snapshot that carries none of them.
		expect(elements.nodes.some((node) => ['criterion', 'constant', 'valueSet'].includes(node.kind))).toBe(false);
	});
});
