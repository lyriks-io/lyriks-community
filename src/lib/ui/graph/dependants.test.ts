import { describe, expect, it, vi } from 'vitest';
import type { GraphEdge, GraphNode } from '$domain/graph';
import { collectDependants, describeDependants, fetchDependants } from './dependants';

const node = (id: string, label = id.split(':')[1] ?? id): GraphNode => ({
	id,
	kind: id.split(':')[0] as GraphNode['kind'],
	context: 'features',
	label
});
const edge = (from: string, to: string, kind: GraphEdge['kind']): GraphEdge => ({
	id: `${from}->${to}`,
	from,
	to,
	kind
});

/** Everything the graph could put around a feature about to be deleted. */
const source = () => ({
	nodes: [
		node('feature:f', 'Checkout'),
		node('core:c', 'Shop'),
		node('role:r', 'Merchant'),
		node('screen:s1', 'Cart'),
		node('screen:s2', 'Payment'),
		node('rule:x', 'Refund window'),
		node('gap:g', 'Feature with no user right'),
		node('entity:e', 'Order')
	],
	edges: [
		edge('core:c', 'feature:f', 'contains'),
		edge('role:r', 'feature:f', 'accesses'),
		edge('screen:s1', 'feature:f', 'shows'),
		edge('screen:s2', 'feature:f', 'shows'),
		edge('rule:x', 'feature:f', 'derives'),
		edge('gap:g', 'feature:f', 'flags'),
		edge('feature:f', 'entity:e', 'writes')
	],
	focusNodeId: 'feature:f'
});

describe('collectDependants', () => {
	it('keeps what rests on the node and drops its holder, its gaps and what it points at', () => {
		const reading = collectDependants(source(), 'feature:f');
		expect(reading.total).toBe(4);
		expect(reading.groups.map((g) => [g.kind, g.label, g.names])).toEqual([
			['screen', '2 screens', ['Cart', 'Payment']],
			['role', '1 role with access', ['Merchant']],
			['rule', '1 rule', ['Refund window']]
		]);
	});

	it('answers an unknown or isolated focus with nothing', () => {
		expect(collectDependants(source(), 'entity:e')).toEqual({
			total: 1,
			groups: [{ kind: 'feature', label: '1 feature', names: ['Checkout'] }]
		});
		expect(collectDependants(source(), 'ghost:1')).toEqual({ total: 0, groups: [] });
	});
});

describe('describeDependants', () => {
	it('reads as one sentence, with or without the names', () => {
		const reading = collectDependants(source(), 'feature:f');
		expect(describeDependants(reading)).toBe('2 screens, 1 role with access and 1 rule rest on it.');
		expect(describeDependants(reading, { withNames: true })).toBe(
			'2 screens (Cart, Payment), 1 role with access (Merchant) and 1 rule (Refund window) rest on it.'
		);
		expect(describeDependants({ total: 0, groups: [] })).toBe('Nothing else in the spec rests on it.');
		expect(describeDependants({ total: 1, groups: [{ kind: 'screen', label: '1 screen', names: ['Cart'] }] })).toBe(
			'1 screen rests on it.'
		);
	});

	it('caps the names it lists and says how many more there are', () => {
		const names = ['A', 'B', 'C', 'D', 'E', 'F'];
		const reading = { total: 6, groups: [{ kind: 'screen' as const, label: '6 screens', names }] };
		expect(describeDependants(reading, { withNames: true, maxNames: 2 })).toBe('6 screens (A, B, +4) rest on it.');
	});
});

describe('fetchDependants', () => {
	it('asks the graph for what points at the node and lands on the resolved focus', async () => {
		const fetchFn = vi.fn(async (url: string | URL | Request) => {
			expect(String(url)).toBe('/api/graph?projectId=p1&focus=feature%3Af&depth=1&direction=in');
			return new Response(JSON.stringify(source()), { status: 200 });
		});
		const reading = await fetchDependants('p1', 'feature:f', fetchFn as unknown as typeof fetch);
		expect(reading.total).toBe(4);
	});

	it('throws when the graph cannot be read, instead of claiming nothing rests on the node', async () => {
		const fetchFn = vi.fn(async () => new Response('nope', { status: 503 }));
		await expect(fetchDependants('p1', 'feature:f', fetchFn as unknown as typeof fetch)).rejects.toThrow(
			'503'
		);
	});
});
