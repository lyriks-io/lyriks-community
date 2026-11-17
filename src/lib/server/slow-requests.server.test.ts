import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
const { slowRequestLine, slowRequestThreshold } = await import('./slow-requests.server');

describe('a slow request is written to the server log', () => {
	it('writes the method, the path and the duration past the threshold, never the query string', () => {
		expect(slowRequestLine('GET', '/projects/p/spec/__data.json', 4210.4, 3000)).toBe('[slow] GET /projects/p/spec/__data.json 4210ms');
		expect(slowRequestLine('GET', '/projects/p/spec', 2999, 3000)).toBeNull();
	});

	it('reads its threshold from the environment, 3 s by default, 0 to turn it off', () => {
		expect(slowRequestThreshold(undefined)).toBe(3000);
		expect(slowRequestThreshold('1500')).toBe(1500);
		expect(slowRequestThreshold('nope')).toBe(3000);
		expect(slowRequestLine('GET', '/x', 99_999, slowRequestThreshold('0'))).toBeNull();
	});
});

describe('timedPart', () => {
	it('resolves and rejects as the part does, naming a slow one', async () => {
		const { timedPart } = await import('./slow-requests.server');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(timedPart('fast', Promise.resolve(1), 3000)).resolves.toBe(1);
		await expect(timedPart('broken', Promise.reject(new Error('x')), 3000)).rejects.toThrow('x');
		expect(warn).not.toHaveBeenCalled();
		await timedPart('slow', new Promise((r) => setTimeout(() => r(2), 520)), 3000);
		expect(warn.mock.calls[0][0]).toMatch(/^\[slow-part\] slow \d+ms$/);
		warn.mockRestore();
	});
});
