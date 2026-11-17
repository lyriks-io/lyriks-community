import { describe, expect, it } from 'vitest';
import { graphStats, type GraphEdge, type GraphNode, type KnowledgeGraph } from '$domain/graph';
import { collapseKernelTwins } from './collapse-kernel-twins';

function graph(nodes: GraphNode[], edges: GraphEdge[]): KnowledgeGraph {
	return { projectId: 'p1', generatedAt: 'now', nodes, edges, stats: graphStats(nodes, edges) };
}

const canonicalUser: GraphNode = { id: 'entity:user', kind: 'entity', context: 'data', label: 'User' };
const canonicalEmail: GraphNode = { id: 'field:email', kind: 'field', context: 'data', label: 'email' };
const behFeature: GraphNode = {
	id: 'feature:beh:feat-login',
	kind: 'feature',
	context: 'behavior',
	label: 'Login'
};

describe('collapseKernelTwins', () => {
	it('folds an entity mirror into its canonical twin and re-points edges', () => {
		const g = graph(
			[
				canonicalUser,
				canonicalEmail,
				behFeature,
				{ id: 'entity:beh:ent-user', kind: 'entity', context: 'behavior', label: 'User' },
				{ id: 'field:beh:fld-email', kind: 'field', context: 'behavior', label: 'email' }
			],
			[
				{ id: 'e:ent-field', from: 'entity:user', to: 'field:email', kind: 'contains' },
				{ id: 'e:feat-ent', from: 'feature:beh:feat-login', to: 'entity:beh:ent-user', kind: 'contains' },
				{ id: 'e:beh-ent-field', from: 'entity:beh:ent-user', to: 'field:beh:fld-email', kind: 'contains' },
				{ id: 'e:bind:entity:user', from: 'entity:user', to: 'entity:beh:ent-user', kind: 'binds' },
				{ id: 'e:bind:field:email', from: 'field:email', to: 'field:beh:fld-email', kind: 'binds' }
			]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes.map((n) => n.id).sort()).toEqual(['entity:user', 'feature:beh:feat-login', 'field:email']);
		expect(out.stats.byKind.entity).toBe(1);
		expect(out.stats.byKind.field).toBe(1);
		// the feature now USES the canonical entity instead of containing a twin
		expect(out.edges).toContainEqual({
			id: 'e:feat-ent',
			from: 'feature:beh:feat-login',
			to: 'entity:user',
			kind: 'uses'
		});
		// no binds self-loops, no duplicated entity→field containment
		expect(out.edges.filter((e) => e.kind === 'binds')).toEqual([]);
		expect(out.edges.filter((e) => e.from === 'entity:user' && e.to === 'field:email')).toHaveLength(1);
	});

	it('matches an engine-authored entity to its canonical twin by normalized name', () => {
		const g = graph(
			[
				canonicalUser,
				behFeature,
				{ id: 'entity:beh:9c8b7a6d', kind: 'entity', context: 'behavior', label: '  user ' }
			],
			[{ id: 'e:feat-ent', from: 'feature:beh:feat-login', to: 'entity:beh:9c8b7a6d', kind: 'contains' }]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes.map((n) => n.id)).not.toContain('entity:beh:9c8b7a6d');
		expect(out.edges).toContainEqual({
			id: 'e:feat-ent',
			from: 'feature:beh:feat-login',
			to: 'entity:user',
			kind: 'uses'
		});
	});

	it('drops a Lyriks-minted mirror whose canonical entity was deleted, with its fields', () => {
		const g = graph(
			[
				canonicalUser,
				behFeature,
				{ id: 'entity:beh:ent-ghost', kind: 'entity', context: 'behavior', label: 'Ghost' },
				{ id: 'field:beh:fld-ghost-name', kind: 'field', context: 'behavior', label: 'name' }
			],
			[
				{ id: 'e:feat-ghost', from: 'feature:beh:feat-login', to: 'entity:beh:ent-ghost', kind: 'contains' },
				{ id: 'e:ghost-field', from: 'entity:beh:ent-ghost', to: 'field:beh:fld-ghost-name', kind: 'contains' }
			]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes.map((n) => n.id).sort()).toEqual(['entity:user', 'feature:beh:feat-login']);
		expect(out.edges).toEqual([]);
	});

	it('keeps a genuinely behavior-only, engine-authored entity', () => {
		const engineEntity: GraphNode = {
			id: 'entity:beh:1a2b3c4d',
			kind: 'entity',
			context: 'behavior',
			label: 'Dunning note'
		};
		const g = graph(
			[canonicalUser, behFeature, engineEntity],
			[{ id: 'e:feat-ent', from: 'feature:beh:feat-login', to: 'entity:beh:1a2b3c4d', kind: 'contains' }]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes).toContainEqual(engineEntity);
		expect(out.edges).toContainEqual({
			id: 'e:feat-ent',
			from: 'feature:beh:feat-login',
			to: 'entity:beh:1a2b3c4d',
			kind: 'contains'
		});
	});

	it('is a no-op when there are no binds pairs and no canonical data entities', () => {
		const g = graph(
			[behFeature, { id: 'entity:beh:ent-user', kind: 'entity', context: 'behavior', label: 'User' }],
			[{ id: 'e:feat-ent', from: 'feature:beh:feat-login', to: 'entity:beh:ent-user', kind: 'contains' }]
		);
		expect(collapseKernelTwins(g)).toBe(g);
	});

	it('collapses a mirror field to a canonical field by name within the matched entity', () => {
		const g = graph(
			[
				canonicalUser,
				canonicalEmail,
				{ id: 'entity:beh:9c8b7a6d', kind: 'entity', context: 'behavior', label: 'User' },
				{ id: 'field:beh:fld-other', kind: 'field', context: 'behavior', label: 'Email' }
			],
			[
				{ id: 'e:ent-field', from: 'entity:user', to: 'field:email', kind: 'contains' },
				{ id: 'e:beh-ent-field', from: 'entity:beh:9c8b7a6d', to: 'field:beh:fld-other', kind: 'contains' }
			]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes.map((n) => n.id).sort()).toEqual(['entity:user', 'field:email']);
		expect(out.edges.filter((e) => e.from === 'entity:user' && e.to === 'field:email')).toHaveLength(1);
	});

	it('folds a feature twin into the wizard feature, keeping its behavior structure', () => {
		const g = graph(
			[
				{ id: 'project:p1', kind: 'project', context: 'project', label: 'P1' },
				{ id: 'feature:feat-login', kind: 'feature', context: 'features', label: 'Login' },
				behFeature,
				{ id: 'surface:srf-x', kind: 'surface', context: 'behavior', label: 'Login flow' }
			],
			[
				{ id: 'e:root-feat', from: 'project:p1', to: 'feature:feat-login', kind: 'contains' },
				{ id: 'e:root-beh', from: 'project:p1', to: 'feature:beh:feat-login', kind: 'contains' },
				{ id: 'e:bind:feature', from: 'feature:feat-login', to: 'feature:beh:feat-login', kind: 'binds' },
				{ id: 'e:feat-surface', from: 'feature:beh:feat-login', to: 'surface:srf-x', kind: 'contains' }
			]
		);

		const out = collapseKernelTwins(g);

		expect(out.stats.byKind.feature).toBe(1);
		// project root containment deduped to the wizard edge; surface kept under the feature
		expect(out.edges.filter((e) => e.from === 'project:p1')).toHaveLength(1);
		expect(out.edges).toContainEqual({
			id: 'e:feat-surface',
			from: 'feature:feat-login',
			to: 'surface:srf-x',
			kind: 'contains'
		});
	});

	it('folds screen/step/role/database twins: hierarchy dedupes, consumption demotes to uses', () => {
		const g = graph(
			[
				{ id: 'journey:J1', kind: 'journey', context: 'experience', label: 'Checkout' },
				{ id: 'step:S1', kind: 'step', context: 'experience', label: 'Pay' },
				{ id: 'screen:SC1', kind: 'screen', context: 'experience', label: 'Payment' },
				{ id: 'role:admin', kind: 'role', context: 'users', label: 'Admin' },
				{ id: 'database:db1', kind: 'database', context: 'data', label: 'Main DB' },
				behFeature,
				{ id: 'surface:srf-J1', kind: 'surface', context: 'behavior', label: 'Checkout' },
				{ id: 'surface:srf-screen-SC1', kind: 'surface', context: 'behavior', label: 'Payment' },
				{ id: 'action:act-S1', kind: 'action', context: 'behavior', label: 'Pay' },
				{ id: 'persona:beh:per-admin', kind: 'persona', context: 'behavior', label: 'Admin' },
				{ id: 'resource:beh:res-db-db1', kind: 'resource', context: 'behavior', label: 'Main DB' },
				{ id: 'state:cart.total', kind: 'state', context: 'behavior', label: 'cart.total' }
			],
			[
				{ id: 'e:j-step', from: 'journey:J1', to: 'step:S1', kind: 'contains' },
				{ id: 'e:bind:journey', from: 'journey:J1', to: 'surface:srf-J1', kind: 'binds' },
				{ id: 'e:bind:screen', from: 'screen:SC1', to: 'surface:srf-screen-SC1', kind: 'binds' },
				{ id: 'e:bind:action', from: 'step:S1', to: 'action:act-S1', kind: 'binds' },
				{ id: 'e:bind:role', from: 'role:admin', to: 'persona:beh:per-admin', kind: 'binds' },
				{ id: 'e:bind:db', from: 'database:db1', to: 'resource:beh:res-db-db1', kind: 'binds' },
				{ id: 'e:surf-action', from: 'surface:srf-J1', to: 'action:act-S1', kind: 'contains' },
				{ id: 'e:feat-persona', from: 'feature:beh:feat-login', to: 'persona:beh:per-admin', kind: 'contains' },
				{ id: 'e:feat-res', from: 'feature:beh:feat-login', to: 'resource:beh:res-db-db1', kind: 'contains' },
				{ id: 'e:feat-surf', from: 'feature:beh:feat-login', to: 'surface:srf-screen-SC1', kind: 'contains' },
				{ id: 'e:action-state', from: 'action:act-S1', to: 'state:cart.total', kind: 'writes' },
				{ id: 'e:action-nav', from: 'action:act-S1', to: 'surface:srf-screen-SC1', kind: 'transitions' }
			]
		);

		const out = collapseKernelTwins(g);
		const ids = out.nodes.map((n) => n.id);

		// every twin gone, wizard nodes + kernel-only state survive
		expect(ids.sort()).toEqual([
			'database:db1',
			'feature:beh:feat-login',
			'journey:J1',
			'role:admin',
			'screen:SC1',
			'state:cart.total',
			'step:S1'
		]);
		// journey contains step exactly once (behavior duplicate deduped)
		expect(out.edges.filter((e) => e.from === 'journey:J1' && e.to === 'step:S1')).toHaveLength(1);
		// consumption edges demoted to uses on the wizard nodes
		expect(out.edges).toContainEqual({ id: 'e:feat-persona', from: 'feature:beh:feat-login', to: 'role:admin', kind: 'uses' });
		expect(out.edges).toContainEqual({ id: 'e:feat-res', from: 'feature:beh:feat-login', to: 'database:db1', kind: 'uses' });
		expect(out.edges).toContainEqual({ id: 'e:feat-surf', from: 'feature:beh:feat-login', to: 'screen:SC1', kind: 'uses' });
		// behavior detail re-pointed: the STEP now writes state and navigates to the SCREEN
		expect(out.edges).toContainEqual({ id: 'e:action-state', from: 'step:S1', to: 'state:cart.total', kind: 'writes' });
		expect(out.edges).toContainEqual({ id: 'e:action-nav', from: 'step:S1', to: 'screen:SC1', kind: 'transitions' });
	});

	it('folds the generated aux features into the project root, keeping their structure', () => {
		const g = graph(
			[
				{ id: 'project:p1', kind: 'project', context: 'project', label: 'P1' },
				canonicalUser,
				{ id: 'feature:beh:p1__data_model', kind: 'feature', context: 'behavior', label: 'Data Model' },
				{ id: 'feature:beh:p1__experience', kind: 'feature', context: 'behavior', label: 'Experience' },
				{ id: 'entity:beh:ent-user', kind: 'entity', context: 'behavior', label: 'User' },
				{ id: 'surface:srf-x', kind: 'surface', context: 'behavior', label: 'Login flow' }
			],
			[
				{ id: 'e:root-dm', from: 'project:p1', to: 'feature:beh:p1__data_model', kind: 'contains' },
				{ id: 'e:root-exp', from: 'project:p1', to: 'feature:beh:p1__experience', kind: 'contains' },
				{ id: 'e:bind:entity:user', from: 'entity:user', to: 'entity:beh:ent-user', kind: 'binds' },
				{ id: 'e:dm-ent', from: 'feature:beh:p1__data_model', to: 'entity:beh:ent-user', kind: 'contains' },
				{ id: 'e:exp-surf', from: 'feature:beh:p1__experience', to: 'surface:srf-x', kind: 'contains' }
			]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes.map((n) => n.id).sort()).toEqual(['entity:user', 'project:p1', 'surface:srf-x']);
		// the root (not a phantom "Data Model" feature) holds the canonical entity and the surface
		expect(out.edges).toContainEqual({ id: 'e:dm-ent', from: 'project:p1', to: 'entity:user', kind: 'contains' });
		expect(out.edges).toContainEqual({ id: 'e:exp-surf', from: 'project:p1', to: 'surface:srf-x', kind: 'contains' });
	});

	it('drops a Lyriks-minted persona mirror whose role was deleted, keeps engine personas', () => {
		const enginePersona: GraphNode = {
			id: 'persona:beh:9f8e7d6c',
			kind: 'persona',
			context: 'behavior',
			label: 'Power user'
		};
		const g = graph(
			[
				{ id: 'role:admin', kind: 'role', context: 'users', label: 'Admin' },
				behFeature,
				{ id: 'persona:beh:per-ghost', kind: 'persona', context: 'behavior', label: 'Ghost' },
				enginePersona
			],
			[
				{ id: 'e:feat-ghost', from: 'feature:beh:feat-login', to: 'persona:beh:per-ghost', kind: 'contains' },
				{ id: 'e:feat-power', from: 'feature:beh:feat-login', to: 'persona:beh:9f8e7d6c', kind: 'contains' }
			]
		);

		const out = collapseKernelTwins(g);

		expect(out.nodes.map((n) => n.id)).not.toContain('persona:beh:per-ghost');
		expect(out.nodes).toContainEqual(enginePersona);
	});
});
