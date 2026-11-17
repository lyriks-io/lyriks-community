import { describe, expect, it } from 'vitest';
import { EARLIER } from './first-seen';
import { recentChanges } from './recent-changes';

const cores = [
	{ id: 'c1', name: 'Short links', features: [{ id: 'f1', name: 'Shorten a link' }, { id: 'f2', name: 'Edit a link' }] },
	{ id: 'c2', name: 'Statistics', features: [{ id: 'f3', name: 'Count the clicks' }] }
];

describe('the empty search lists what was added or changed lately [criterion:e11bf80b]', () => {
	it('names each element once, at its latest moment, newest first', () => {
		const list = recentChanges({
			cores,
			firstSeen: { c1: EARLIER, f1: EARLIER, f2: '2026-11-01T10:00:00.000Z', c2: '2026-11-03T10:00:00.000Z', f3: '2026-11-03T10:00:05.000Z' },
			changedAt: { f1: '2026-11-04T09:00:00.000Z', f2: '2026-11-01T10:00:20.000Z', f3: '2026-11-03T10:00:30.000Z' }
		});
		expect(list.map((c) => `${c.change} ${c.name}`)).toEqual(['changed Shorten a link', 'added Count the clicks', 'added Statistics', 'added Edit a link']);
		// What was there before Lyriks kept moments, and never written since, is not listed.
		expect(list.find((c) => c.id === 'c1')).toBeUndefined();
	});

	it('reads a write within a minute of the arrival as the arrival itself', () => {
		const [only] = recentChanges({ cores, firstSeen: { f2: '2026-11-01T10:00:00.000Z' }, changedAt: { f2: '2026-11-01T10:00:50.000Z' } });
		expect(only).toMatchObject({ id: 'f2', change: 'added', at: '2026-11-01T10:00:00.000Z' });
	});

	it('names none of the features one save of the section rewrote at the same moment', () => {
		const at = '2026-11-04T23:06:02.717Z';
		const list = recentChanges({ cores, firstSeen: {}, changedAt: { f1: at, f2: at, f3: at } });
		expect(list).toEqual([]);
	});

	it('keeps five at most', () => {
		const many = [{ id: 'c', name: 'Core', features: Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, name: `Feature ${i}` })) }];
		const firstSeen = Object.fromEntries(many[0].features.map((f, i) => [f.id, `2026-11-0${i + 1}T10:00:00.000Z`]));
		expect(recentChanges({ cores: many, firstSeen, changedAt: {} }).map((c) => c.id)).toEqual(['f7', 'f6', 'f5', 'f4', 'f3']);
	});
});
