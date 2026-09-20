import { describe, expect, it } from 'vitest';
import { dependencyCycleMembers } from './dependency-cycles';

describe('dependency cycles', () => {
	it('excludes acyclic dependants and missing references', () => {
		const graph = new Map([['a', ['b']], ['b', ['a']], ['c', ['a']], ['d', ['missing']]]);
		expect([...dependencyCycleMembers(graph)].sort()).toEqual(['a', 'b']);
	});
	it('finds a complete component even through previously visited edges', () => {
		const graph = new Map([['a', ['b', 'd']], ['b', ['c']], ['c', ['a']], ['d', ['b']]]);
		expect([...dependencyCycleMembers(graph)].sort()).toEqual(['a', 'b', 'c', 'd']);
	});
	it('handles a deep acyclic chain without recursion', () => {
		const graph = new Map(Array.from({ length: 5000 }, (_, i) => [String(i), i < 4999 ? [String(i + 1)] : []]));
		expect(dependencyCycleMembers(graph).size).toBe(0);
	});
	it('detects self dependencies and disconnected cycles', () => {
		expect([...dependencyCycleMembers(new Map([['a', ['a']], ['b', ['c']], ['c', ['b']]]))].sort()).toEqual(['a', 'b', 'c']);
	});
});
