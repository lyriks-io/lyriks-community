import { describe, expect, it } from 'vitest';
import { buildStatusByFeature, buildStatusOf } from './build-status';

describe('the build status of a feature is what the code holds', () => {
	it('reads done when every element is located, in progress when some are, not started when none are', () => {
		expect(buildStatusOf({ found: 4, expected: 4 })).toBe('done');
		expect(buildStatusOf({ found: 1, expected: 4 })).toBe('in-progress');
		expect(buildStatusOf({ found: 0, expected: 4 })).toBe('not-started');
	});

	it('reads not started for a feature the index never located', () => {
		expect(buildStatusOf(undefined)).toBe('not-started');
		expect(buildStatusByFeature(['f1', 'f2'], { f1: { found: 2, expected: 2 } })).toEqual({ f1: 'done', f2: 'not-started' });
	});
});
