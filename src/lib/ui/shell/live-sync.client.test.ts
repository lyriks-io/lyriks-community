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
	it('re-runs only the loads that read the Evolution document when a request moves', async () => {
		stop = startLiveSync('p');
		Stream.latest.change('evolution'); await vi.advanceTimersByTimeAsync(1000);
		const keys = vi.mocked(invalidate).mock.calls.map(([key]) => key);
		expect(keys).toEqual(['lyriks:project:p:section:evolution']);
		expect(invalidateAll).not.toHaveBeenCalled();
	});
	it('tears down an old project queue instead of refreshing a different project', async () => {
		stop = startLiveSync('old'); state.to = { url: '/projects/new' }; Stream.latest.change('features');
		stop(); state.to = null; await vi.advanceTimersByTimeAsync(5000);
		expect(Stream.latest.closed).toBe(true); expect(invalidate).not.toHaveBeenCalled();
	});
});

/** A tab whose visibility the test moves: hidden is a tab behind another one or a minimized window. */
class Page extends EventTarget {
	visibilityState: 'visible' | 'hidden' = 'visible';
	show(state: 'visible' | 'hidden') { this.visibilityState = state; this.dispatchEvent(new Event('visibilitychange')); }
}

describe('a page out of sight refreshes once it shows again [criterion:adc3750f]', () => {
	let page: Page;
	beforeEach(() => { page = new Page(); vi.stubGlobal('document', page); });

	it('waits while out of sight [unspa:2d523fef:c31ce887:aecc219a]', async () => {
		stop = startLiveSync('p'); page.show('hidden');
		Stream.latest.change('features'); await vi.advanceTimersByTimeAsync(5000);
		expect(invalidate).not.toHaveBeenCalled(); expect(invalidateAll).not.toHaveBeenCalled();
	});
	it('goes out of sight behind another tab [unspa:2d523fef:4cf8e9ef:bfd95ca7]', async () => {
		stop = startLiveSync('p'); page.show('hidden');
		Stream.latest.change('glossary'); await vi.advanceTimersByTimeAsync(1000);
		expect(invalidate).not.toHaveBeenCalled();
	});
	it('refreshes what it heard once, as soon as it shows [unspa:2d523fef:abdfb2d2:8f487f59]', async () => {
		stop = startLiveSync('p'); page.show('hidden');
		Stream.latest.change('features'); Stream.latest.change('glossary'); await vi.advanceTimersByTimeAsync(5000);
		page.show('visible'); await vi.advanceTimersByTimeAsync(0);
		const keys = vi.mocked(invalidate).mock.calls.map(([key]) => key);
		expect(keys).toEqual(expect.arrayContaining(['lyriks:project:p', 'lyriks:project:p:section:features', 'lyriks:project:p:section:glossary']));
		const count = keys.length;
		await vi.advanceTimersByTimeAsync(5000); expect(invalidate).toHaveBeenCalledTimes(count);
	});
	it('does not refresh when it heard nothing [unspa:2d523fef:abdfb2d2:c5afcbca]', async () => {
		stop = startLiveSync('p'); page.show('hidden'); page.show('visible');
		await vi.advanceTimersByTimeAsync(5000);
		expect(invalidate).not.toHaveBeenCalled(); expect(invalidateAll).not.toHaveBeenCalled();
	});
	it('tells the stores what moved only once it shows again', async () => {
		const heard: string[] = [];
		window.addEventListener('lyriks:section-change', (e) => heard.push((e as CustomEvent<string>).detail));
		stop = startLiveSync('p'); page.show('hidden');
		Stream.latest.change('evolution'); Stream.latest.change('evolution');
		expect(heard).toEqual([]);
		page.show('visible'); expect(heard).toEqual(['evolution']);
	});
	it('out of sight, then back: one refresh [unspa:2d523fef:c31ce887:f112667b]', async () => {
		stop = startLiveSync('p'); page.show('hidden');
		Stream.latest.change(); await vi.advanceTimersByTimeAsync(5000);
		expect(invalidateAll).not.toHaveBeenCalled();
		page.show('visible'); await vi.advanceTimersByTimeAsync(5000);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
	it('stops listening to the tab once torn down', async () => {
		stop = startLiveSync('p'); page.show('hidden'); Stream.latest.change('features');
		stop(); stop = undefined; page.show('visible'); await vi.advanceTimersByTimeAsync(5000);
		expect(invalidate).not.toHaveBeenCalled();
	});
});
