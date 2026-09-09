import { describe, expect, it } from 'vitest';
import { GraphBuilder } from './graph';
import { graphOverview, scopeGraph } from './scope';
import type { GraphContext, GraphNode, GraphNodeKind } from './graph';

const node = (
	id: string,
	kind: GraphNodeKind = 'feature',
	context: GraphContext = 'features',
	detail?: string
): GraphNode => ({ id, kind, context, label: id.split(':')[1] ?? id, detail });

/**
 * project:p ── contains ─▶ feature:a ── writes ─▶ entity:e
 *                └─ contains ─▶ feature:b            ▲
 *                                └───── writes ──────┘
 * screen:s (experience) floats unconnected.
 */
const fixture = () => {
	const builder = new GraphBuilder();
	builder.addNode(node('project:p', 'project', 'project'));
	builder.addNode(node('feature:a', 'feature', 'features', 'checkout flow'));
	builder.addNode(node('feature:b'));
	builder.addNode(node('entity:e', 'entity', 'data'));
	builder.addNode(node('screen:s', 'screen', 'experience'));
	builder.addEdge({ id: 'e1', from: 'project:p', to: 'feature:a', kind: 'contains' });
	builder.addEdge({ id: 'e2', from: 'project:p', to: 'feature:b', kind: 'contains' });
	builder.addEdge({ id: 'e3', from: 'feature:a', to: 'entity:e', kind: 'writes' });
	builder.addEdge({ id: 'e4', from: 'feature:b', to: 'entity:e', kind: 'writes' });
	return builder.build('p', '2026-07-21T00:00:00.000Z');
};

describe('scopeGraph', () => {
	it('returns the whole graph for an empty scope', () => {
		const scoped = scopeGraph(fixture(), {});
		expect(scoped.nodes).toHaveLength(5);
		expect(scoped.edges).toHaveLength(4);
		expect(scoped.matchedNodeCount).toBe(5);
		expect(scoped.truncated).toBe(false);
	});

	it('filters by context and keeps only inner edges', () => {
		const scoped = scopeGraph(fixture(), { contexts: ['features'] });
		expect(scoped.nodes.map((n) => n.id).sort()).toEqual(['feature:a', 'feature:b']);
		expect(scoped.edges).toEqual([]);
	});

	it('filters by kind', () => {
		const scoped = scopeGraph(fixture(), { kinds: ['entity', 'screen'] });
		expect(scoped.nodes.map((n) => n.id).sort()).toEqual(['entity:e', 'screen:s']);
	});

	it('matches q against label, id and detail, case-insensitively', () => {
		expect(scopeGraph(fixture(), { q: 'CHECKOUT' }).nodes.map((n) => n.id)).toEqual(['feature:a']);
		expect(scopeGraph(fixture(), { q: 'entity:' }).nodes.map((n) => n.id)).toEqual(['entity:e']);
	});

	it('expands an undirected neighborhood around focus', () => {
		const oneHop = scopeGraph(fixture(), { focus: 'entity:e' });
		expect(oneHop.nodes.map((n) => n.id).sort()).toEqual(['entity:e', 'feature:a', 'feature:b']);

		const twoHops = scopeGraph(fixture(), { focus: 'entity:e', depth: 2 });
		expect(twoHops.nodes.map((n) => n.id).sort()).toEqual([
			'entity:e',
			'feature:a',
			'feature:b',
			'project:p'
		]);
		expect(twoHops.nodes.map((n) => n.id)).not.toContain('screen:s');
	});

	it('intersects focus with filters', () => {
		const scoped = scopeGraph(fixture(), { focus: 'entity:e', kinds: ['feature'] });
		expect(scoped.nodes.map((n) => n.id).sort()).toEqual(['feature:a', 'feature:b']);
	});

	it('resolves focus by raw id and by label, reporting the landing node', () => {
		const byRawId = scopeGraph(fixture(), { focus: 'e' });
		expect(byRawId.focusNodeId).toBe('entity:e');
		expect(byRawId.nodes.map((n) => n.id).sort()).toEqual(['entity:e', 'feature:a', 'feature:b']);

		const byLabel = scopeGraph(fixture(), { focus: ' S ' }); // label match is trimmed + case-insensitive
		expect(byLabel.focusNodeId).toBe('screen:s');
	});

	it('lands an ambiguous label on the best-connected candidate', () => {
		const builder = new GraphBuilder();
		builder.addNode({ id: 'feature:x1', kind: 'feature', context: 'features', label: 'Queue' });
		builder.addNode({ id: 'screen:x2', kind: 'screen', context: 'experience', label: 'Queue' });
		builder.addNode({ id: 'step:x3', kind: 'step', context: 'experience', label: 'Open' });
		builder.addEdge({ id: 'e1', from: 'screen:x2', to: 'step:x3', kind: 'shows' });
		const scoped = scopeGraph(builder.build('p', 'now'), { focus: 'Queue' });
		expect(scoped.focusNodeId).toBe('screen:x2'); // degree 1 beats the isolated feature
	});

	it('flags an unresolvable focus instead of silently returning an empty graph', () => {
		const scoped = scopeGraph(fixture(), { focus: 'screen:does-not-exist' });
		expect(scoped.focusNodeId).toBeNull();
		expect(scoped.nodes).toEqual([]);
		// no focus in the scope -> the flag stays absent
		expect(scopeGraph(fixture(), {}).focusNodeId).toBeUndefined();
	});

	it('caps nodes at limit keeping the best-connected, and flags truncation', () => {
		const scoped = scopeGraph(fixture(), { limit: 2 });
		expect(scoped.truncated).toBe(true);
		expect(scoped.matchedNodeCount).toBe(5);
		expect(scoped.nodes).toHaveLength(2);
		// entity:e (degree 2) and one of the degree-2 hubs beat the isolated screen.
		expect(scoped.nodes.map((n) => n.id)).not.toContain('screen:s');
		expect(scoped.stats.nodeCount).toBe(2);
	});
});

describe('graphOverview', () => {
	it('keeps whole-graph stats but only the hub nodes', () => {
		const overview = graphOverview(fixture(), 2);
		expect(overview.stats.nodeCount).toBe(5);
		expect(overview.topNodes).toHaveLength(2);
		expect(overview.topNodes.map((n) => n.id)).not.toContain('screen:s');
	});
});
