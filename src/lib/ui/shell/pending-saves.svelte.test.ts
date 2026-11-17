import { describe, expect, it, vi } from 'vitest';
import { pendingSaves, trackSave } from './pending-saves.svelte';

describe('pending saves (criterion 27bbfacd)', () => {
	it('counts an act from the moment it is sent until it settles, then reads Saved for a moment', async () => {
		vi.useFakeTimers();
		let resolve!: (ok: boolean) => void;
		const first = trackSave(new Promise<boolean>((r) => (resolve = r)));
		const second = trackSave(Promise.resolve(true));
		expect(pendingSaves.waiting).toBe(2);
		await second;
		expect(pendingSaves.waiting).toBe(1);
		expect(pendingSaves.justSaved).toBe(false);
		resolve(true);
		await first;
		expect(pendingSaves.waiting).toBe(0);
		expect(pendingSaves.justSaved).toBe(true);
		vi.advanceTimersByTime(2000);
		expect(pendingSaves.justSaved).toBe(false);
		vi.useRealTimers();
	});

	it('a refused or failed act stops counting without reading Saved', async () => {
		await trackSave(Promise.resolve(false));
		await expect(trackSave(Promise.reject(new Error('down')))).rejects.toThrow('down');
		expect(pendingSaves.waiting).toBe(0);
		expect(pendingSaves.justSaved).toBe(false);
	});
});
