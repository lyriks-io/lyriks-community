import { describe, expect, it } from 'vitest';
import { requestStanding } from './request-standing';

describe('the header of a request in Build [criterion:ac-leaf-d9a4be34-310c-4d61-b7e4-d3bcd396fdcf]', () => {
	it('reads Version N+1 in correction while a correction is open', () => {
		expect(requestStanding({ version: 2 }, 'Build', 5, 7)).toBe('Version 2 in correction · Stands at Build · 5 of 7 steps done');
	});

	it('reads where it stands alone otherwise', () => {
		expect(requestStanding(null, 'Build', 5, 7)).toBe('Stands at Build · 5 of 7 steps done');
	});
});
