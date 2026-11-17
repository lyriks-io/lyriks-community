import { describe, expect, it } from 'vitest';
import { fingerprintOf } from './elements';

describe('what an element reads, condensed [criterion:0c87480c]', () => {
	it('is the same whatever order the content was written in', () => {
		expect(fingerprintOf({ name: 'Orders', description: 'All orders' })).toBe(fingerprintOf({ description: 'All orders', name: 'Orders' }));
	});

	it('moves with any word of it', () => {
		expect(fingerprintOf({ name: 'Orders', description: 'All orders' })).not.toBe(fingerprintOf({ name: 'Orders', description: 'All paid orders' }));
	});
});
