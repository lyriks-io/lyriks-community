/**
 * A menu, a dropdown or a panel of filters opens whole (criterion 5651ca29):
 * it leaves the box it was opened from (a card, a scrolled list, an enlarged
 * diagram: any ancestor that clips or transforms), lives under <body> in fixed
 * position beside its button, and stays inside the window: moved left from the
 * right edge, opened above when the room below is too short, scrolling inside
 * itself only when the window is shorter than it.
 */

export interface Box {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export interface Placement {
	readonly top: number;
	readonly left: number;
	/** Set only when the window is too short for the whole panel. */
	readonly maxHeight: number | null;
	readonly above: boolean;
}

/** Room kept between the panel and the window's edges, and between the panel and its button. */
export const EDGE = 8;
export const GAP = 6;

/**
 * Where the panel goes, from its button's box, its own size and the window's:
 * under the button and aligned on its left edge (or its right edge for `right`),
 * shifted to stay inside the window, flipped above when it does not fit below
 * and fits above, and capped to the taller side otherwise; a panel that opens
 * above by design (`prefer: 'above'`) does so whenever it fits there. Pure.
 */
export function placeFloating(
	button: Box,
	panel: { width: number; height: number },
	window: { width: number; height: number },
	align: 'left' | 'right' = 'left',
	prefer: 'below' | 'above' = 'below'
): Placement {
	const wanted = align === 'right' ? button.right - panel.width : button.left;
	const left = Math.max(EDGE, Math.min(wanted, window.width - EDGE - panel.width));
	const below = window.height - EDGE - (button.bottom + GAP);
	const aboveRoom = button.top - GAP - EDGE;
	const underIt: Placement = { top: button.bottom + GAP, left, maxHeight: null, above: false };
	const overIt: Placement = { top: button.top - GAP - panel.height, left, maxHeight: null, above: true };
	if (prefer === 'above' && panel.height <= aboveRoom) return overIt;
	if (panel.height <= below) return underIt;
	if (panel.height <= aboveRoom) return overIt;
	// Taller than both sides: the taller side, scrolling inside.
	if (aboveRoom > below) return { top: EDGE, left, maxHeight: aboveRoom, above: true };
	return { top: button.bottom + GAP, left, maxHeight: Math.max(below, 0), above: false };
}

/** Where each floating panel was written: a click inside it is a click inside the component it belongs to. */
const homes = new WeakMap<object, Element>();

/** The element a floating panel was written in, null for anything that does not float. */
export function floatingHome(target: unknown): Element | null {
	return (typeof target === 'object' && target !== null && homes.get(target)) || null;
}

export interface FloatOptions {
	/** The button the panel opened from; it follows it as the page scrolls. Left out: the element the panel was written in. */
	readonly anchor?: HTMLElement | null;
	readonly align?: 'left' | 'right';
	/** A panel drawn above its button (a menu at the foot of the window) opens above whenever it fits. */
	readonly prefer?: 'below' | 'above';
	/** At least as wide as its button (a dropdown under its field), or exactly as wide (`fill`, a list under its text area). */
	readonly matchWidth?: boolean | 'fill';
}

/**
 * Svelte action on the panel element (the only element of its `{#if open}`
 * block, so Svelte removes it from wherever it lives): it moves it under
 * <body>, places it and follows its button on scroll and resize. A component
 * using it must count a click inside the panel as inside (the panel is no
 * longer a descendant of the component's root).
 */
export function floatInView(node: HTMLElement, options: FloatOptions) {
	let current = options;
	const home = node.parentElement;
	if (home) homes.set(node, home);
	// Moving an element out of the page blurs what it holds: a field focused at its opening keeps the focus.
	const focused = node.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
	document.body.appendChild(node);
	focused?.focus();
	node.style.position = 'fixed';
	node.style.zIndex = '140';
	// Never wider than the window, nor than the cap its own classes set.
	const ownCap = getComputedStyle(node).maxWidth;
	const windowCap = `calc(100vw - ${2 * EDGE}px)`;
	node.style.maxWidth = ownCap && ownCap !== 'none' ? `min(${ownCap}, ${windowCap})` : windowCap;
	node.style.overflowY = 'auto';
	node.dataset.floating = '';

	const place = () => {
		const anchor = current.anchor ?? home;
		if (!anchor || !anchor.isConnected) return;
		// Measure at its natural height before capping it again.
		node.style.maxHeight = '';
		// Only a panel that follows its button's width has its width written here; any other keeps its own.
		if (current.matchWidth === true) node.style.minWidth = `${anchor.offsetWidth}px`;
		if (current.matchWidth === 'fill') node.style.width = `${anchor.offsetWidth}px`;
		const at = placeFloating(anchor.getBoundingClientRect(), { width: node.offsetWidth, height: node.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, current.align, current.prefer);
		node.style.top = `${at.top}px`;
		node.style.left = `${at.left}px`;
		node.style.maxHeight = at.maxHeight === null ? '' : `${at.maxHeight}px`;
	};
	place();
	let frame = 0;
	const later = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(place);
	};
	window.addEventListener('scroll', later, true);
	window.addEventListener('resize', later);
	const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
	sized?.observe(node);

	return {
		update(next: FloatOptions) {
			current = next;
			place();
		},
		destroy() {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', later, true);
			window.removeEventListener('resize', later);
			sized?.disconnect();
			if (node.parentNode === document.body) node.remove();
		}
	};
}

/** Whether a click landed inside the component or inside its floating panel. */
export function clickedWithin(target: EventTarget | null, ...parts: (Pick<HTMLElement, 'contains'> | null | undefined)[]): boolean {
	return !!target && parts.some((p) => !!p && p.contains(target as Node));
}

export interface HoverOptions {
	/** The hover groups the card answers to: every ancestor matching it (a CSS group-hover did the same). */
	readonly selector: string;
	/** Also while the keyboard is on the group (`visible`: only when the focus shows, as :focus-visible). */
	readonly focus?: boolean | 'visible';
	readonly onChange: (shown: boolean, anchor: HTMLElement) => void;
}

/**
 * Svelte action on a sentinel inside a hover card's component: tells when one
 * of its hover groups holds the pointer (or the keyboard), the way a CSS
 * group-hover showed the card before it floated out of the group to open whole
 * (criterion 5651ca29). The anchor it hands is the nearest group.
 */
export function hoverWithin(node: HTMLElement, options: HoverOptions) {
	const groups: HTMLElement[] = [];
	for (let el = node.parentElement; el; el = el.parentElement) if (el.matches(options.selector)) groups.push(el);
	const anchor = groups[0] ?? node.parentElement ?? node;
	const hovered = new Set<HTMLElement>();
	let focused = false;
	const emit = () => options.onChange(hovered.size > 0 || focused, anchor);
	const listeners = groups.map((group) => {
		const enter = () => (hovered.add(group), emit());
		const leave = () => (hovered.delete(group), emit());
		group.addEventListener('pointerenter', enter);
		group.addEventListener('pointerleave', leave);
		return () => {
			group.removeEventListener('pointerenter', enter);
			group.removeEventListener('pointerleave', leave);
		};
	});
	const focusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement | null;
		focused = options.focus === 'visible' ? !!target?.matches?.(':focus-visible') : true;
		emit();
	};
	const focusOut = (e: FocusEvent) => {
		if (anchor.contains(e.relatedTarget as Node | null)) return;
		focused = false;
		emit();
	};
	if (options.focus) {
		anchor.addEventListener('focusin', focusIn);
		anchor.addEventListener('focusout', focusOut);
	}
	return {
		destroy() {
			listeners.forEach((off) => off());
			anchor.removeEventListener('focusin', focusIn);
			anchor.removeEventListener('focusout', focusOut);
		}
	};
}
