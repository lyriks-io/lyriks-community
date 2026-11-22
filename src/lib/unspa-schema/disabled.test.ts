import { describe, expect, it } from 'vitest';
import { disabledMarkerOf, operativeSnapshotFeature } from './disabled';

const marker = { by: 'Sam', at: '2026-11-18T10:00:00.000Z', reason: 'Testing without it' };
const feature = (over: Record<string, unknown> = {}) => ({
	id: 'f',
	surfaces: [
		{
			id: 's',
			rules: [],
			invariants: [{ id: 'inv-surface' }],
			actions: [
				{ id: 'a', rules: [{ id: 'r1' }, { id: 'r2', disabled: marker }], invariants: [], scenarios: [{ id: 'sc1' }] },
				{ id: 'b', disabled: marker, rules: [{ id: 'r3' }], invariants: [], scenarios: [{ id: 'sc2' }] },
				{ id: 'c', rules: [], invariants: [], scenarios: [{ id: 'sc3', steps: [{ actionId: 'b' }] }] }
			]
		}
	],
	featureInvariants: [{ id: 'inv', disabled: marker }],
	reachabilityGoals: [{ id: 'goal' }],
	...over
});

describe('the disabled marker read off a snapshot', () => {
	it('reads who, when and why, and nothing from a malformed marker', () => {
		expect(disabledMarkerOf({ disabled: marker })).toEqual(marker);
		expect(disabledMarkerOf({ disabled: { by: 'x' } })).toBeNull();
		expect(disabledMarkerOf({})).toBeNull();
	});

	it('leaves the disabled elements out of the model a reading takes [criterion:ac-leaf-fdd4a79e-cc1f-44bd-a1a7-4cc6f31a5a26]', () => {
		const operative = operativeSnapshotFeature(feature());
		const actions = operative.surfaces[0]!.actions as { id: string; rules: { id: string }[]; scenarios?: { id: string }[] }[];
		expect(actions.map((a) => a.id)).toEqual(['a', 'c']);
		expect(actions[0]!.rules.map((r) => r.id)).toEqual(['r1']);
		// A scenario replaying a disabled action goes with it.
		expect(actions[1]!.scenarios).toEqual([]);
		expect(operative.featureInvariants).toEqual([]);
		expect(operative.reachabilityGoals).toEqual([{ id: 'goal' }]);
	});

	it('empties a disabled feature of its behaviour, and leaves a feature in force as it was', () => {
		const off = operativeSnapshotFeature(feature({ disabled: marker }));
		expect(off.surfaces[0]!.actions).toEqual([]);
		expect(off.reachabilityGoals).toEqual([]);
		const inForce = { id: 'g', surfaces: [{ id: 's', actions: [{ id: 'a', rules: [] }] }] };
		expect(operativeSnapshotFeature(inForce)).toBe(inForce);
	});
});
