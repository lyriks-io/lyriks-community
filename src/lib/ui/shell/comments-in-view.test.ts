import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleCommentsInView } from './comments-in-view';

/**
 * A page scrolling in one scroller whose top sits 50 px down the window, with
 * a sticky header `head` px tall at its top; `room` px of the page show.
 */
function page({ room = 600, scrollTop = 0, head = 80, reduced = false } = {}) {
	const scroller = {
		scrollTop,
		clientHeight: room,
		clientTop: 0,
		scrollHeight: 5000,
		parentElement: null,
		offsetParent: null,
		getBoundingClientRect: () => ({ top: 50 }),
		querySelector: () => (head ? { getBoundingClientRect: () => ({ bottom: 50 + head }) } : null),
		scrollTo: vi.fn()
	};
	const drawn: object[] = [];
	vi.stubGlobal('getComputedStyle', (el: object) => ({ overflowY: el === scroller ? 'auto' : 'visible' }));
	vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
	vi.stubGlobal('document', { querySelectorAll: () => [...drawn] });
	/**
	 * A block's comments laid out `top` px down the page, `height` tall. No
	 * screen box: the view reads where they lay out, not where a card still
	 * moving to open them shows them.
	 */
	const comments = (top: number, height: number) => ({ offsetTop: top, offsetHeight: height, offsetParent: scroller, parentElement: scroller });
	return { scroller, drawn, comments };
}

describe("opening a block's comments brings them into view [criterion:8cb972b5]", () => {
	afterEach(() => vi.unstubAllGlobals());

	it('scrolls just enough to show comments that open below the window whole', async () => {
		const { scroller, drawn, comments } = page();
		await toggleCommentsInView(() => drawn.push(comments(900, 200)));
		// Their foot 16 px above the scroller's bottom edge: 900 + 200 + 16 - 600.
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 516, behavior: 'smooth' });
	});

	it('shows comments taller than the window from their top, just under the sticky header', async () => {
		const { scroller, drawn, comments } = page();
		await toggleCommentsInView(() => drawn.push(comments(900, 900)));
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 900 - 16 - 80, behavior: 'smooth' });
	});

	it('leaves the page where it is when the comments open in view', async () => {
		const { scroller, drawn, comments } = page({ scrollTop: 100 });
		await toggleCommentsInView(() => drawn.push(comments(300, 200)));
		expect(scroller.scrollTo).not.toHaveBeenCalled();
	});

	it('never moves the page when the click closes the comments', async () => {
		const { scroller, drawn, comments } = page();
		drawn.push(comments(900, 200));
		await toggleCommentsInView(() => drawn.pop());
		expect(scroller.scrollTo).not.toHaveBeenCalled();
	});

	it('waits for a card grid to lay out the card that grows to open them', async () => {
		const { scroller, drawn, comments } = page();
		await toggleCommentsInView(() => new Promise<void>((done) => setTimeout(() => (drawn.push(comments(1200, 100)), done()), 5)));
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 716, behavior: 'smooth' });
	});

	it('takes the comments and the line naming their element as one, from the top of the first to the foot of the last', async () => {
		const { scroller, drawn, comments } = page();
		await toggleCommentsInView(() => drawn.push(comments(880, 20), comments(904, 300)));
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 620, behavior: 'smooth' });
	});

	it('holds the icon clicked under the pointer when the browser moved the view after a card that moved away', async () => {
		const { scroller, drawn, comments } = page({ scrollTop: 160 });
		// The icon lays out 300 px down the page and shows 140 px under the scroller's top (50 px down the window).
		const icon = { ...comments(300, 28), isConnected: true, getBoundingClientRect: () => ({ top: 50 + 140 }) };
		await toggleCommentsInView(() => {
			drawn.push(comments(500, 70));
			// Scroll anchoring followed the card pushed below the one laid across its row.
			scroller.scrollTop = 390;
		}, icon as unknown as HTMLElement);
		expect(scroller.scrollTop).toBe(160);
		expect(scroller.scrollTo).not.toHaveBeenCalled();
	});

	it('jumps without motion for a reader who asked for reduced motion', async () => {
		const { scroller, drawn, comments } = page({ reduced: true });
		await toggleCommentsInView(() => drawn.push(comments(900, 200)));
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 516, behavior: 'auto' });
	});
});
