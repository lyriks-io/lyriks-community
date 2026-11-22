import { describe, expect, it } from 'vitest';
import { parseExpectedRevision, revisionConflictBody, revisionConflictMessage, unitsReplacedBy, unitsWrittenSince } from './index';

describe('the revision of an implementation index', () => {
	it('reads an expected revision as given, absent, or not a revision', () => {
		expect(parseExpectedRevision(undefined)).toBeNull();
		expect(parseExpectedRevision(null)).toBeNull();
		expect(parseExpectedRevision(0)).toBe(0);
		expect(parseExpectedRevision(12)).toBe(12);
		for (const wrong of [-1, 1.5, '3', true]) expect(parseExpectedRevision(wrong)).toBe('invalid');
	});

	it('takes the actions, surfaces and criteria a sync replaces, never a child alone', () => {
		expect(unitsReplacedBy(['action:a1', 'rule:r1', 'surface:s1', 'state:cart.total', 'criterion:c1', 'event:x.y', 'action:a1'])).toEqual([
			'action:a1',
			'surface:s1',
			'criterion:c1'
		]);
	});

	it('finds only the units written after the revision named [criterion:93abb7df]', () => {
		const lastWritten = new Map([
			['action:a1', 4],
			['surface:s1', 2]
		]);
		expect(unitsWrittenSince(['action:a1', 'surface:s1', 'action:never'], lastWritten, 3)).toEqual(['action:a1']);
		expect(unitsWrittenSince(['surface:s1'], lastWritten, 3)).toEqual([]);
	});

	it('names the first fifty units, keeps the total and says which revision to send again with [criterion:93abb7df]', () => {
		const units = Array.from({ length: 60 }, (_, i) => `action:a${i}`);
		const message = revisionConflictMessage({ expected: 3, current: 9, units });
		expect(message).toContain('The index of this project changed since revision 3: 60 of the units sent were written since by another sync or report');
		expect(message).toContain('action:a49 and 10 more');
		expect(message).not.toContain('action:a50,');
		expect(message).toContain('Nothing was written. Read them back, keep what is still true, and send again with expected_revision 9.');
		const body = revisionConflictBody({ expected: 3, current: 9, units });
		expect(body).toMatchObject({ expectedRevision: 3, currentRevision: 9, total: 60 });
		expect(body.units).toHaveLength(50);
	});
});
