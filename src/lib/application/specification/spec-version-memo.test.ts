import { describe, expect, it } from 'vitest';
import { SpecVersionMemo, specVersionOf } from './spec-version-memo';

describe('SpecVersionMemo', () => {
	it('answers only for the exact spec version it remembered', () => {
		const memo = new SpecVersionMemo<string>();
		memo.set('p/feat-a', '2026-08-26T10:00:00Z', 'verdict');

		expect(memo.get('p/feat-a', '2026-08-26T10:00:00Z')).toBe('verdict');
		expect(memo.get('p/feat-a', '2026-08-26T10:05:00Z')).toBeUndefined(); // spec moved
		expect(memo.get('p/feat-b', '2026-08-26T10:00:00Z')).toBeUndefined();
	});

	it('remembers a null reading as a reading, not as a miss', () => {
		const memo = new SpecVersionMemo<string | null>();
		memo.set('p/feat-a', 'v1', null);
		expect(memo.get('p/feat-a', 'v1')).toBeNull();
	});

	it('forgets a reading once its clock ran out, whatever the version says', () => {
		let now = 1_000;
		const memo = new SpecVersionMemo<string>(500, 100, () => now);
		memo.set('p/feat-a', 'v1', 'verdict');
		now += 400;
		expect(memo.get('p/feat-a', 'v1')).toBe('verdict');
		now += 200;
		expect(memo.get('p/feat-a', 'v1')).toBeUndefined();
	});

	it('drops the oldest readings past its size', () => {
		const memo = new SpecVersionMemo<number>(60_000, 2);
		memo.set('a', 'v', 1);
		memo.set('b', 'v', 2);
		memo.set('c', 'v', 3);
		expect(memo.get('a', 'v')).toBeUndefined();
		expect(memo.get('b', 'v')).toBe(2);
		expect(memo.get('c', 'v')).toBe(3);
	});

	it('reads the version off the kernel feature stamp', () => {
		expect(specVersionOf({ feature: { updatedAt: '2026-08-26T10:00:00Z' } })).toBe('2026-08-26T10:00:00Z');
		expect(specVersionOf({ feature: {} })).toBeNull();
		expect(specVersionOf(null)).toBeNull();
	});
});
