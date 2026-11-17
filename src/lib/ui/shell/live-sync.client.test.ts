import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ to: null as unknown }));
vi.mock('$app/state', () => ({ navigating: state }));
vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), invalidateAll: vi.fn(async () => {}) }));
import { invalidate, invalidateAll } from '$app/navigation';
import { startLiveSync } from './live-sync.client';

class Stream extends EventTarget {
	static latest: Stream;
	closed = false;
	constructor(_url: string) { super(); Stream.latest = this; }
	close() { this.closed = true; }
	change(section?: string) { this.dispatchEvent(new MessageEvent('change', { data: JSON.stringify(section ? { section } : {}) })); }
}
let stop: (() => void) | undefined;
beforeEach(() => {
	vi.useFakeTimers(); vi.clearAllMocks(); state.to = null;
	vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('EventSource', Stream);
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('live refreshes yield to requested navigation [criterion:6787a611]', () => {
	it('preserves all section keys until navigation settles [unspa:be506881:0b13fd55:00367c59]', async () => {
		stop = startLiveSync('p'); state.to = { url: '/destination' };
		Stream.latest.change('features'); await vi.advanceTimersByTimeAsync(1000);
		Stream.latest.change('foundation.identity'); await vi.advanceTimersByTimeAsync(1000);
		expect(invalidate).not.toHaveBeenCalled(); expect(invalidateAll).not.toHaveBeenCalled();
		state.to = null; await vi.advanceTimersByTimeAsync(1000);
		expect(vi.mocked(invalidate).mock.calls.map(([key]) => key)).toEqual(expect.arrayContaining([
			'lyriks:project:p', 'lyriks:project:p:section:features', 'lyriks:project:p:section:foundation.identity', 'lyriks:project:p:section:foundation'
		]));
		const count = vi.mocked(invalidate).mock.calls.length;
		await vi.advanceTimersByTimeAsync(5000); expect(invalidate).toHaveBeenCalledTimes(count);
	});
	it('keeps a full refresh pending and drains it only once [unspa:be506881:0b13fd55:133acc43]', async () => {
		stop = startLiveSync('p'); state.to = { url: '/destination' };
		Stream.latest.change(); Stream.latest.change(); await vi.advanceTimersByTimeAsync(2000);
		expect(invalidateAll).not.toHaveBeenCalled();
		state.to = null; await vi.advanceTimersByTimeAsync(1000);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000); expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
	it('tears down an old project queue instead of refreshing a different project', async () => {
		stop = startLiveSync('old'); state.to = { url: '/projects/new' }; Stream.latest.change('features');
		stop(); state.to = null; await vi.advanceTimersByTimeAsync(5000);
		expect(Stream.latest.closed).toBe(true); expect(invalidate).not.toHaveBeenCalled();
	});
});
