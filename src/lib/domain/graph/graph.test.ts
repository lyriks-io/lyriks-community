import { describe, expect, it } from 'vitest';
import { GraphBuilder, type GraphNode } from './graph';

const node = (id: string): GraphNode => ({
	id,
	kind: 'feature',
	context: 'features',
	label: id
});

describe('GraphBuilder', () => {
	it('keeps a relationship whose endpoints are added later', () => {
		const graph = new GraphBuilder();
		graph.addEdge({ id: 'e:later', from: 'feature:a', to: 'feature:b', kind: 'contains' });
		graph.addNode(node('feature:a'));
		graph.addNode(node('feature:b'));

		expect(graph.build('p1', '2026-07-21T00:00:00.000Z').edges).toEqual([
			{ id: 'e:later', from: 'feature:a', to: 'feature:b', kind: 'contains' }
		]);
	});

	it('drops a relationship that is still dangling at build time', () => {
		const graph = new GraphBuilder();
		graph.addNode(node('feature:a'));
		graph.addEdge({ id: 'e:dangling', from: 'feature:a', to: 'feature:missing', kind: 'contains' });

		expect(graph.build('p1', '2026-07-21T00:00:00.000Z').edges).toEqual([]);
	});
});
