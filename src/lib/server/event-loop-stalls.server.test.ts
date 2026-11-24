import { describe, expect, it } from 'vitest';
import { stallLine, stallThreshold, trackRequest } from './event-loop-stalls.server';

describe('a stall of the server thread is logged with the requests it fell in', () => {
	it('names each request once, and says when none was running', () => {
		expect(stallLine(1834.4, 200, ['GET /projects/p/ask (data)', 'GET /api/chrome', 'GET /api/chrome'])).toBe(
			'[stall] 1834ms during GET /projects/p/ask (data), GET /api/chrome'
		);
		expect(stallLine(450, 200, [])).toBe('[stall] 450ms during no request (background work)');
	});

	it('stays quiet on time, and when turned off', () => {
		expect(stallLine(120, 200, ['GET /'])).toBeNull();
		expect(stallLine(5000, 0, ['GET /'])).toBeNull();
	});

	it('reads its threshold from the setting, 200 ms by default', () => {
		expect(stallThreshold(undefined)).toBe(200);
		expect(stallThreshold('')).toBe(200);
		expect(stallThreshold('500')).toBe(500);
		expect(stallThreshold('0')).toBe(0);
		expect(stallThreshold('soon')).toBe(200);
	});

	it('a tracked request is released once', () => {
		const ended = trackRequest('GET /x');
		expect(() => ended()).not.toThrow();
	});
});
