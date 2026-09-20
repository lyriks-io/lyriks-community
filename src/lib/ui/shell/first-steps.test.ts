import { describe, expect, it } from 'vitest';
import { FIRST_STEPS_URL, firstStepsUrlFor } from './first-steps';

describe('the first-steps link', () => {
	it('carries the installation as a fragment, never as a query', () => {
		const url = firstStepsUrlFor('https://lyriks.example.com');
		expect(url).toBe(`${FIRST_STEPS_URL}#app=https%3A%2F%2Flyriks.example.com`);
		expect(url).not.toContain('?');
	});

	it('trims a trailing slash so the guide can append a path', () => {
		expect(firstStepsUrlFor('http://localhost:5173/')).toBe(`${FIRST_STEPS_URL}#app=http%3A%2F%2Flocalhost%3A5173`);
	});

	it('falls back to the bare guide without a usable origin', () => {
		expect(firstStepsUrlFor(undefined)).toBe(FIRST_STEPS_URL);
		expect(firstStepsUrlFor(null)).toBe(FIRST_STEPS_URL);
		expect(firstStepsUrlFor('')).toBe(FIRST_STEPS_URL);
		expect(firstStepsUrlFor('javascript:alert(1)')).toBe(FIRST_STEPS_URL);
		expect(firstStepsUrlFor('https://a.example.com/path')).toBe(FIRST_STEPS_URL);
	});
});
