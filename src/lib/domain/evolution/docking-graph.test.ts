import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '$domain/graph';
import { dockingGraphOf } from './docking-graph';
import type { LocalGraph, LocalNode } from './local-graph';

/**
 * Where the request's changes dock on the product (302d93bf, d2477e20): the
 * changes keep their colours with the nodes that hold them, and the existing
 * elements the changes touch at one hop come from the knowledge graph.
 */

const node = (id: string, kind: LocalNode['kind'], parentId: string | null, status: LocalNode['status'] = 'existing', label = id): LocalNode => ({
	id,
	kind,
	label,
	status,
	parentId,
	folded: false,
	featureId: null,
	variant: null
});

const local: LocalGraph = {
	nodes: [
		node('core:c1', 'core', null),
		node('feature:f1', 'feature', 'core:c1', 'changed'),
		node('surface:s1', 'surface', 'feature:f1'),
		node('action:a1', 'action', 'surface:s1', 'changed'),
		node('action:a2', 'action', 'surface:s1'),
		node('rule:r1', 'rule', 'action:a1', 'added'),
		node('state:st1', 'state', 'surface:s1', 'added', 'order.status'),
		node('table:e1', 'table', null, 'changed', 'Order')
	],
	counts: { existing: 4, added: 2, changed: 3, removed: 0, reached: 0 }
};

const kg: { nodes: GraphNode[]; edges: Omit<GraphEdge, 'id'>[] } = {
	nodes: [
		{ id: 'project:p', kind: 'project', context: 'project', label: 'P' },
		{ id: 'core:c1', kind: 'core', context: 'features', label: 'Core' },
		{ id: 'feature:f1', kind: 'feature', context: 'features', label: 'F1' },
		{ id: 'feature:f2', kind: 'feature', context: 'features', label: 'F2' },
		{ id: 'surface:s1', kind: 'surface', context: 'behavior', label: 'S1' },
		{ id: 'action:a1', kind: 'action', context: 'behavior', label: 'A1' },
		{ id: 'action:a2', kind: 'action', context: 'behavior', label: 'A2' },
		{ id: 'journey:j1', kind: 'journey', context: 'experience', label: 'Buy' },
		{ id: 'rule:beh:f1:r1', kind: 'rule', context: 'behavior', label: 'R1' },
		{ id: 'state:order.status', kind: 'state', context: 'behavior', label: 'order.status' },
		{ id: 'entity:e1', kind: 'entity', context: 'data', label: 'Order' },
		{ id: 'role:buyer', kind: 'role', context: 'users', label: 'Buyer' },
		{ id: 'screen:checkout', kind: 'screen', context: 'experience', label: 'Checkout' },
		{ id: 'gap:g1', kind: 'gap', context: 'coherence', label: 'Gap' },
		{ id: 'scenario:sc1', kind: 'scenario', context: 'behavior', label: 'Places an order' }
	],
	edges: [
		{ from: 'project:p', to: 'core:c1', kind: 'contains' },
		{ from: 'core:c1', to: 'feature:f2', kind: 'contains' },
		{ from: 'role:buyer', to: 'feature:f1', kind: 'accesses' },
		{ from: 'role:buyer', to: 'surface:s1', kind: 'accesses' },
		{ from: 'screen:checkout', to: 'surface:s1', kind: 'binds' },
		{ from: 'action:a1', to: 'entity:e1', kind: 'writes' },
		{ from: 'journey:j1', to: 'action:a1', kind: 'triggers' },
		{ from: 'screen:checkout', to: 'action:a2', kind: 'binds' },
		{ from: 'gap:g1', to: 'feature:f1', kind: 'flags' },
		{ from: 'scenario:sc1', to: 'action:a1', kind: 'tests' }
	]
};

describe('the request docked on the product', () => {
	it('lands each request node on the knowledge graph node it stands for, and keeps its colour', () => {
		const docked = dockingGraphOf(local, kg);
		const byId = new Map(docked.nodes.map((n) => [n.id, n]));
		expect(byId.get('rule:beh:f1:r1')?.local?.status).toBe('added');
		expect(byId.get('state:order.status')?.local?.status).toBe('added');
		expect(byId.get('entity:e1')?.local?.status).toBe('changed');
		expect(docked.edges).toContainEqual({ from: 'action:a1', to: 'entity:e1', kind: 'writes' });
		expect(docked.edges).toContainEqual({ from: 'action:a1', to: 'rule:beh:f1:r1', kind: 'contains' });
	});

	it('docks the changes on the existing elements they touch at one hop, never the root, a computed gap or a test [criterion:d2477e20]', () => {
		const docked = dockingGraphOf(local, kg);
		const existing = docked.nodes.filter((n) => !n.local).map((n) => n.id).sort();
		expect(existing).toEqual(['journey:j1', 'role:buyer']);
		expect(docked.dockCount).toBe(2);
		expect(docked.omitted).toBe(0);
	});

	it('docks nothing from a node drawn only to place a change, and draws nothing the request leaves untouched [criterion:302d93bf]', () => {
		const docked = dockingGraphOf(local, kg);
		const ids = docked.nodes.map((n) => n.id);
		// The surface and the core only hold a change: what touches them alone is not a docking point.
		expect(ids).not.toContain('screen:checkout');
		expect(ids).not.toContain('feature:f2');
		// An untouched sibling of a change is not drawn at all.
		expect(ids).not.toContain('action:a2');
		expect(docked.nodes.find((n) => n.id === 'surface:s1')?.local?.status).toBe('existing');
	});

	it('keeps the neighbours touching the changes most once the cap is reached', () => {
		const docked = dockingGraphOf(local, kg, 1);
		expect(docked.nodes.filter((n) => !n.local)).toHaveLength(1);
		expect(docked.omitted).toBe(1);
	});
});
