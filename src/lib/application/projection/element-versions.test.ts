import { describe, expect, it } from 'vitest';
import { elementDigests, nextElementVersions, stable } from './element-versions';

describe('element stamps mirrored from the engine [criterion:ac-leaf-ac-trace-drift-own-change]', () => {
	const feature = (ruleText: string, scenarios = [{ id: 'sc1', name: 'ok' }]) => ({
		id: 'f1',
		surfaces: [{ id: 's1', name: 'S', rules: [], actions: [{ id: 'a1', name: 'Act', rules: [{ id: 'r1', description: ruleText }], scenarios }] }],
		resources: [{ id: 'res1', name: 'DB' }],
		updatedAt: '2026-01-01T00:00:00.000Z'
	});

	it('keys every element like the index, a parent digest leaving its keyed children out', () => {
		const digests = elementDigests(feature('A'));
		expect([...digests.keys()].sort()).toEqual(['action:a1', 'resource:res1', 'rule:r1', 'scenario:sc1', 'surface:s1']);
		expect(elementDigests(feature('B')).get('action:a1')).toBe(digests.get('action:a1'));
		expect(elementDigests(feature('B')).get('rule:r1')).not.toBe(digests.get('rule:r1'));
	});

	it('serialises the same content the same way whatever its key order', () => {
		expect(stable({ b: 1, a: [{ d: 2, c: undefined }] })).toBe(stable({ a: [{ d: 2 }], b: 1 }));
	});

	it('dates the changed and new elements, keeps the others, drops the removed ones', () => {
		const previous = { ...feature('A'), elementVersions: { 'rule:r1': '2026-01-02T00:00:00.000Z', 'scenario:sc1': '2026-01-03T00:00:00.000Z' } };
		const next = feature('B', [{ id: 'sc2', name: 'new' }]);
		expect(nextElementVersions(previous, next, '2026-02-01T00:00:00.000Z')).toEqual({
			'surface:s1': '2026-01-01T00:00:00.000Z',
			'action:a1': '2026-01-01T00:00:00.000Z',
			'resource:res1': '2026-01-01T00:00:00.000Z',
			'rule:r1': '2026-02-01T00:00:00.000Z',
			'scenario:sc2': '2026-02-01T00:00:00.000Z'
		});
	});

	it('dates every element of a new feature at the write', () => {
		expect(Object.values(nextElementVersions(null, feature('A'), 'now'))).toEqual(['now', 'now', 'now', 'now', 'now']);
	});
});
