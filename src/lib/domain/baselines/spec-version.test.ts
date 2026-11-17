import { describe, expect, it } from 'vitest';
import type { Baseline } from './draft';
import { specVersionOf } from './spec-version';

const baseline = (id: string, createdAt: string): Baseline => ({
	id,
	name: id,
	note: '',
	createdAt,
	readiness: 0,
	coherence: 0,
	featureCount: 0,
	content: ''
});

describe('specVersionOf', () => {
	it('has no version while the specification is a draft', () => {
		expect(specVersionOf([baseline('b1', '2026-10-01T00:00:00Z')], null)).toBeNull();
	});

	it('reads v1.0 on the baseline the validation captured', () => {
		const version = specVersionOf([baseline('early', '2026-09-01T00:00:00Z'), baseline('v', '2026-10-01T00:00:00Z')], 'v');
		expect(version).toEqual({ label: 'v1.0', previous: null, baselineId: 'v' });
	});

	it('moves one minor step per baseline captured after the validation, whatever the stored order', () => {
		const version = specVersionOf(
			[baseline('b3', '2026-10-20T00:00:00Z'), baseline('v', '2026-10-01T00:00:00Z'), baseline('b2', '2026-10-10T00:00:00Z')],
			'v'
		);
		expect(version).toEqual({ label: 'v1.2', previous: 'v1.1', baselineId: 'b3' });
	});

	it('has no version when the validation baseline is gone', () => {
		expect(specVersionOf([baseline('b1', '2026-10-01T00:00:00Z')], 'missing')).toBeNull();
	});
});
