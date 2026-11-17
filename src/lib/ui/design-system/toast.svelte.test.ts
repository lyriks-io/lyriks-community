import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissAllToasts, dismissToast, holdToast, lingerOf, pushToast, releaseToast, toasts } from './toast.svelte';

describe('a message stays while it is read [criterion:8613eec9]', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		for (const t of toasts()) dismissToast(t.id);
		vi.useRealTimers();
	});

	it('waits while the pointer or the keyboard is in it, then counts its whole time again', () => {
		const id = pushToast({ level: 'success', message: 'Copied' });
		const linger = lingerOf({ level: 'success' });
		vi.advanceTimersByTime(linger - 100);
		holdToast(id);
		vi.advanceTimersByTime(linger * 3);
		expect(toasts().some((t) => t.id === id)).toBe(true);
		releaseToast(id);
		vi.advanceTimersByTime(linger - 1);
		expect(toasts().some((t) => t.id === id)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(toasts().some((t) => t.id === id)).toBe(false);
	});

	it('keeps a failure longer than the other messages, then lets it leave on its own', () => {
		const id = pushToast({ level: 'error', message: 'Could not save' });
		const failure = lingerOf({ level: 'error' });
		expect(failure).toBeGreaterThan(lingerOf({ level: 'success' }));
		vi.advanceTimersByTime(failure - 1);
		expect(toasts().some((t) => t.id === id)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(toasts().some((t) => t.id === id)).toBe(false);
	});

	it('gives a toast that offers an act longer to be reached', () => {
		expect(lingerOf({ level: 'info', action: { label: 'Open', run: () => {} } })).toBeGreaterThan(lingerOf({ level: 'info' }));
	});
});

describe('messages never pile up [criterion:cb973a27]', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		dismissAllToasts();
		vi.useRealTimers();
	});

	it('shows the same message once, counted, its time started again', () => {
		const message = 'The evolution was not opened. Nothing left to settle.';
		const first = pushToast({ level: 'error', message });
		vi.advanceTimersByTime(lingerOf({ level: 'error' }) - 100);
		const again = pushToast({ level: 'error', message });
		expect(again).toBe(first);
		expect(toasts()).toHaveLength(1);
		expect(toasts()[0].count).toBe(2);
		vi.advanceTimersByTime(200);
		expect(toasts()).toHaveLength(1);
	});

	it('keeps different messages apart', () => {
		pushToast({ level: 'error', message: 'One' });
		pushToast({ level: 'error', message: 'Two' });
		pushToast({ level: 'success', message: 'One' });
		expect(toasts()).toHaveLength(3);
	});

	it('lets every message go at once', () => {
		pushToast({ level: 'error', message: 'One' });
		pushToast({ level: 'error', message: 'Two' });
		dismissAllToasts();
		expect(toasts()).toEqual([]);
	});
});
