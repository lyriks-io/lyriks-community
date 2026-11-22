import { describe, expect, it } from 'vitest';
import { GraphBuilder } from './graph';
import type { GraphContext, GraphNode, GraphNodeKind } from './graph';
import {
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

describe('graph queries', () => {
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
		expect([...reachableIds(graph, 'entity:e', { depth: 0 })]).toEqual(['entity:e']);
	});

	it('builds the index once per graph object', () => {
		const graph = fixture();
		expect(indexOf(graph)).toBe(indexOf(graph));
		expect(indexOf(indexOf(graph))).toBe(indexOf(graph));
		expect(indexOf(fixture())).not.toBe(indexOf(graph));
	});
});
