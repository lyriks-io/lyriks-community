import { describe, expect, it, vi } from 'vitest';
import { shortMemo } from './short-memo.server';

describe('shortMemo', () => {
	it('reads once per key within the window, again after it', async () => {
		const memo = shortMemo<number>(1000);
		const read = vi.fn(async () => 1);
		await memo('k', read, 0);
		await memo('k', read, 500);
		await memo('other', read, 500);
		expect(read).toHaveBeenCalledTimes(2);
		await memo('k', read, 1500);
		expect(read).toHaveBeenCalledTimes(3);
	});
	it('never keeps a failed read', async () => {
		const memo = shortMemo<number>(1000);
		await expect(memo('k', async () => { throw new Error('down'); }, 0)).rejects.toThrow('down');
		await Promise.resolve();
		await expect(memo('k', async () => 2, 10)).resolves.toBe(2);
	});
});
