import { describe, expect, it } from 'vitest';
import { GraphBuilder } from './graph';
import type { GraphContext, GraphNode, GraphNodeKind } from './graph';
import {
	dependantsOf,
	dependenciesOf,
	edgesInto,
	edgesOutOf,
	indexOf,
	reachableIds,
	walk
} from './queries';

const node = (
	id: string,
	kind: GraphNodeKind = 'feature',
	context: GraphContext = 'features'
): GraphNode => ({ id, kind, context, label: id.split(':')[1] ?? id });

/**
 * project:p -contains-> feature:a -writes-> entity:e <-reads- step:s
 *          -contains-> feature:b -writes-> entity:e
 * screen:x floats unconnected.
 */
const fixture = () => {
	const builder = new GraphBuilder();
	builder.addNode(node('project:p', 'project', 'project'));
	builder.addNode(node('feature:a'));
	builder.addNode(node('feature:b'));
	builder.addNode(node('entity:e', 'entity', 'data'));
	builder.addNode(node('step:s', 'step', 'experience'));
	builder.addNode(node('screen:x', 'screen', 'experience'));
	builder.addEdge({ id: 'e1', from: 'project:p', to: 'feature:a', kind: 'contains' });
	builder.addEdge({ id: 'e2', from: 'project:p', to: 'feature:b', kind: 'contains' });
	builder.addEdge({ id: 'e3', from: 'feature:a', to: 'entity:e', kind: 'writes' });
	builder.addEdge({ id: 'e4', from: 'feature:b', to: 'entity:e', kind: 'writes' });
	builder.addEdge({ id: 'e5', from: 'step:s', to: 'entity:e', kind: 'reads' });
	return builder.build('p', '2026-09-11T00:00:00.000Z');
};

const ids = (reached: { node: GraphNode; hops: number }[]) =>
	reached.map((r) => `${r.node.id}@${r.hops}`);

describe('graph queries', () => {
	it('lists what points at a node and what it points at', () => {
		const graph = fixture();
		expect(edgesInto(graph, 'entity:e').map((e) => e.id)).toEqual(['e3', 'e4', 'e5']);
		expect(edgesInto(graph, 'entity:e', ['writes']).map((e) => e.id)).toEqual(['e3', 'e4']);
		expect(edgesOutOf(graph, 'project:p').map((e) => e.id)).toEqual(['e1', 'e2']);
		expect(edgesOutOf(graph, 'screen:x')).toEqual([]);
		expect(edgesInto(graph, 'nope')).toEqual([]);
	});

	it('finds the dependants of a node, nearest first, up to the asked depth', () => {
		const graph = fixture();
		expect(ids(dependantsOf(graph, 'entity:e'))).toEqual(['feature:a@1', 'feature:b@1', 'step:s@1']);
		expect(ids(dependantsOf(graph, 'entity:e', { depth: 2 }))).toEqual([
			'feature:a@1',
			'feature:b@1',
			'step:s@1',
			'project:p@2'
		]);
		expect(ids(dependantsOf(graph, 'entity:e', { depth: 2, edgeKinds: ['writes'] }))).toEqual([
			'feature:a@1',
			'feature:b@1'
		]);
	});

	it('finds the dependencies of a node the same way, following edges outward', () => {
		const graph = fixture();
		expect(ids(dependenciesOf(graph, 'project:p'))).toEqual(['feature:a@1', 'feature:b@1']);
		expect(ids(dependenciesOf(graph, 'project:p', { depth: 2 }))).toEqual([
			'feature:a@1',
			'feature:b@1',
			'entity:e@2'
		]);
		expect(dependenciesOf(graph, 'entity:e')).toEqual([]);
	});

	it('walks both directions for the undirected neighbourhood, start included', () => {
		const graph = fixture();
		expect([...reachableIds(graph, 'feature:a')].sort()).toEqual(['entity:e', 'feature:a', 'project:p']);
		expect([...reachableIds(graph, 'feature:a', { depth: 2 })].sort()).toEqual([
			'entity:e',
			'feature:a',
			'feature:b',
			'project:p',
			'step:s'
		]);
		expect(walk(graph, 'feature:a', { depth: 2 }).get('step:s')).toBe(2);
	});

	it('records a node at the first hop it is met, never revisiting it', () => {
		const graph = fixture();
		const hops = walk(graph, 'project:p', { depth: 5 });
		expect(hops.get('entity:e')).toBe(2);
		expect(hops.get('step:s')).toBe(3);
		expect(hops.size).toBe(5);
	});

	it('answers an unknown start with the start alone and a depth of zero with no move', () => {
		const graph = fixture();
		expect([...reachableIds(graph, 'ghost:1')]).toEqual(['ghost:1']);
		expect(dependantsOf(graph, 'ghost:1')).toEqual([]);
		expect([...reachableIds(graph, 'entity:e', { depth: 0 })]).toEqual(['entity:e']);
	});

	it('builds the index once per graph object', () => {
		const graph = fixture();
		expect(indexOf(graph)).toBe(indexOf(graph));
		expect(indexOf(indexOf(graph))).toBe(indexOf(graph));
		expect(indexOf(fixture())).not.toBe(indexOf(graph));
	});
});
