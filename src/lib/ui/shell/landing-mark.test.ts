import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING_CLASS, LANDING_MS, landOn } from './landing-mark';

/**
 * A page scrolling in one scroller whose top sits 56 px down the window, `room` px of it showing, its sticky
 * head `head` px tall, scrolled `scrollTop` px; the element to land on sits `at` px down the window, `height` px tall.
 */
function page({ room = 664, head = 74, scrollTop = 36, at = 1260, height = 240, reduced = false } = {}) {
	const scroller = {
		scrollTop,
		clientHeight: room,
		scrollHeight: 5000,
		clientTop: 0,
		parentElement: null,
		getBoundingClientRect: () => ({ top: 56 }),
		querySelector: () => (head ? { getBoundingClientRect: () => ({ bottom: 56 + head }) } : null),
		scrollTo: vi.fn()
	};
	const classes = new Set<string>();
	const el = {
		parentElement: scroller,
		classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
		offsetWidth: 0,
		getBoundingClientRect: () => ({ top: at, height })
	};
	vi.stubGlobal('getComputedStyle', (node: unknown) => ({ overflowY: node === scroller ? 'auto' : 'visible' }));
	vi.stubGlobal('document', { scrollingElement: null });
	vi.stubGlobal('window', { innerHeight: 720, matchMedia: () => ({ matches: reduced }), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });
	return { scroller, el: el as unknown as HTMLElement, marked: () => classes.has(LANDING_CLASS) };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('a link to a conversation lands on it, in view, marked for three seconds [criterion:0bdc1d4f]', () => {
	it('scrolls its own scroller, smoothly, to put the message in the middle of what shows under the head', () => {
		const { scroller, el } = page();
		landOn(el);
		// Under the head: 664 - 74 = 590 px of room, the 240 px message 175 px down it.
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 36 + (1260 - 56) - (74 + 175), behavior: 'smooth' });
	});

	it('jumps at once under reduced motion', () => {
		const { scroller, el } = page({ reduced: true });
		landOn(el);
		expect(scroller.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
	});

	it('shows the top of a message taller than the room, just under the head', () => {
		const { scroller, el } = page({ height: 900 });
		landOn(el);
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 36 + (1260 - 56) - (74 + 16), behavior: 'smooth' });
	});

	it('holds the mark three seconds, then takes it off', () => {
		vi.useFakeTimers();
		const { el, marked } = page();
		landOn(el);
		expect(LANDING_MS).toBe(3000);
		vi.advanceTimersByTime(LANDING_MS - 1);
		expect(marked()).toBe(true);
		vi.advanceTimersByTime(1);
		expect(marked()).toBe(false);
	});

	it('lands on nothing when the page does not hold the conversation', () => {
		expect(() => landOn(null)).not.toThrow();
	});
});
