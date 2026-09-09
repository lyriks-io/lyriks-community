import { describe, expect, it } from 'vitest';
import { normalizeFeatureCollections } from './normalize-feature-collections';

describe('normalizeFeatureCollections', () => {
	it('gives a surface the arrays the scorer walks', () => {
		const normalized = normalizeFeatureCollections({
			id: 'f1',
			surfaces: [{ id: 's1', name: 'Board' }]
		}) as { surfaces: Record<string, unknown>[] };

		expect(normalized.surfaces[0]).toMatchObject({
			rules: [],
			actions: [],
			stateDefinitions: [],
			invariants: [],
			transitions: []
		});
	});

	it('reaches actions nested inside surfaces', () => {
		const normalized = normalizeFeatureCollections({
			surfaces: [{ actions: [{ id: 'a1', name: 'Publish' }] }]
		}) as { surfaces: { actions: Record<string, unknown>[] }[] };

		expect(normalized.surfaces[0].actions[0]).toMatchObject({
			rules: [],
			effects: [],
			parameters: [],
			emittedEvents: [],
			requiredStates: [],
			invariants: []
		});
	});

	it('keeps what is already there', () => {
		const normalized = normalizeFeatureCollections({
			name: 'Publish a Zap',
			surfaces: [{ rules: [{ id: 'r1' }], actions: [{ effects: [{ type: 'set_state' }] }] }]
		}) as { name: string; surfaces: { rules: unknown[]; actions: { effects: unknown[] }[] }[] };

		expect(normalized.name).toBe('Publish a Zap');
		expect(normalized.surfaces[0].rules).toEqual([{ id: 'r1' }]);
		expect(normalized.surfaces[0].actions[0].effects).toEqual([{ type: 'set_state' }]);
	});

	it('replaces a collection that is not a list at all', () => {
		const normalized = normalizeFeatureCollections({ surfaces: [{ rules: 'none' }] }) as {
			surfaces: { rules: unknown }[];
		};

		expect(normalized.surfaces[0].rules).toEqual([]);
	});

	it('never edits the snapshot it was given', () => {
		const original = { surfaces: [{ id: 's1' }] };

		normalizeFeatureCollections(original);

		expect(original.surfaces[0]).toEqual({ id: 's1' });
	});

	it('passes a non-object through untouched', () => {
		expect(normalizeFeatureCollections(null)).toBeNull();
		expect(normalizeFeatureCollections('nope')).toBe('nope');
	});
});
