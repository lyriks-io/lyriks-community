import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPageReadRecovery } from './page-read-recovery';
afterEach(() => vi.useRealTimers());
describe('automatic recovery repeats only reads [criterion:f090189e]', () => {
	it('waits for navigation and recovers without a manual reload, one read at a time', async () => {
		vi.useFakeTimers(); let unavailable = true; let navigating = true;
		let finish: (() => void) | undefined;
		const read = vi.fn(() => new Promise<void>((resolve) => { finish = () => { unavailable = false; resolve(); }; }));
		const recovery = startPageReadRecovery(() => unavailable, () => navigating, read);
		await vi.advanceTimersByTimeAsync(3000); expect(read).not.toHaveBeenCalled();
		navigating = false; await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(1);
		void recovery.retry(); await vi.advanceTimersByTimeAsync(3000); expect(read).toHaveBeenCalledTimes(1);
		finish?.(); await vi.advanceTimersByTimeAsync(3000); expect(read).toHaveBeenCalledTimes(1); recovery.stop();
	});
	it('a failed recovery read stays retryable and teardown stops further requests', async () => {
		vi.useFakeTimers(); const read = vi.fn(async () => { throw new Error('503'); });
		const recovery = startPageReadRecovery(() => true, () => false, read);
		await vi.advanceTimersByTimeAsync(2000); expect(read).toHaveBeenCalledTimes(2);
		recovery.stop(); await vi.advanceTimersByTimeAsync(3000); expect(read).toHaveBeenCalledTimes(2);
	});
});
