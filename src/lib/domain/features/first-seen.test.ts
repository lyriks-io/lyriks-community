import { describe, expect, it } from 'vitest';
import { EARLIER, isNewSince, newSince, stampFirstSeen } from './first-seen';

const NOW = '2026-10-30T09:00:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('what appeared lately reads New [criterion:2a6bff42]', () => {
	it('keeps the moment a feature first entered the spec, never moved by a later save', () => {
		const first = stampFirstSeen({}, new Set(), ['core-a', 'f1'], NOW);
		expect(first).toEqual({ 'core-a': NOW, f1: NOW });
		const later = stampFirstSeen(first, new Set(['core-a', 'f1']), ['core-a', 'f1', 'f2'], '2026-10-31T10:00:00.000Z');
		expect(later).toEqual({ 'core-a': NOW, f1: NOW, f2: '2026-10-31T10:00:00.000Z' });
	});

	it('never makes new what was there before moments were kept', () => {
		const kept = stampFirstSeen(undefined, new Set(['f1']), ['f1', 'f2'], NOW);
		expect(kept).toEqual({ f1: EARLIER, f2: NOW });
		expect(isNewSince(kept, 'f1', at(NOW), 30)).toBe(false);
	});

	it('reads New less than the setting’s days after it appeared, never with the setting at 0', () => {
		const kept = { f1: NOW, f2: '2026-10-20T09:00:00.000Z' };
		expect(newSince(kept, at('2026-10-30T20:00:00.000Z'), 1)).toEqual({ f1: NOW });
		expect(isNewSince(kept, 'f1', at('2026-10-31T09:00:01.000Z'), 1)).toBe(false);
		expect(isNewSince(kept, 'f2', at(NOW), 30)).toBe(true);
		expect(newSince(kept, at(NOW), 0)).toEqual({});
	});
});
