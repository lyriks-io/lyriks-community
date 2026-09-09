import { describe, expect, it } from 'vitest';
import type { GraphEdge } from '$domain/graph';
import { edgePresentation, summarizeEdgeKinds } from './edge-presentation';

describe('edge presentation', () => {
	it('summarizes only relationship types that occur in the graph', () => {
		const edges: GraphEdge[] = [
			{ id: '1', from: 'a', to: 'b', kind: 'relates' },
			{ id: '2', from: 'b', to: 'c', kind: 'contains' },
			{ id: '3', from: 'c', to: 'd', kind: 'relates' }
		];

		expect(summarizeEdgeKinds(edges).map(({ kind, count }) => ({ kind, count }))).toEqual([
			{ kind: 'contains', count: 1 },
			{ kind: 'relates', count: 2 }
		]);
	});

	it('gives relationship kinds readable UI copy', () => {
		expect(edgePresentation('scheduled')).toMatchObject({ label: 'Scheduled for' });
	});
});
