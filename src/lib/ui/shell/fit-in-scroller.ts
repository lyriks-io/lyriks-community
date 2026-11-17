/**
 * Keeps an element that sticks in the app's scroller no taller than what the
 * scroller shows below its top, less a margin, before it sticks as after: it
 * always ends above the app's foot, and its content scrolls inside it. Used as
 * `{@attach fitInScroller()}`.
 */
export function fitInScroller(margin = 16) {
	return (node: HTMLElement) => {
		const scroller = node.closest<HTMLElement>('#app-scroll');
		if (!scroller) return;
		let frame = 0;
		const fit = () => {
			frame = 0;
			const room = scroller.getBoundingClientRect().bottom - node.getBoundingClientRect().top - margin;
			node.style.maxHeight = `${Math.max(160, Math.floor(room))}px`;
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(fit);
		};
		scroller.addEventListener('scroll', schedule, { passive: true });
		const sizes = new ResizeObserver(schedule);
		sizes.observe(scroller);
		fit();
		return () => {
			scroller.removeEventListener('scroll', schedule);
			sizes.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	};
}

/**
 * The same fit as a height rather than a ceiling, for panes that fill the room
 * they are given: the element always ends a margin above the app's foot and
 * grows as the page scrolls up, until it reaches `cap()` pixels, where it
 * stops. Used as `{@attach fillToScrollerFoot(16, () => height)}`.
 */
export function fillToScrollerFoot(margin: number, cap: () => number, least = 160) {
	return (node: HTMLElement) => {
		const scroller = node.closest<HTMLElement>('#app-scroll');
		if (!scroller) return;
		let frame = 0;
		const fit = () => {
			frame = 0;
			const room = scroller.getBoundingClientRect().bottom - node.getBoundingClientRect().top - margin;
			node.style.height = `${Math.max(least, Math.min(cap(), Math.floor(room)))}px`;
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(fit);
		};
		scroller.addEventListener('scroll', schedule, { passive: true });
		const sizes = new ResizeObserver(schedule);
		sizes.observe(scroller);
		fit();
		return () => {
			scroller.removeEventListener('scroll', schedule);
			sizes.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	};
}
