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
});
