type Side = 'top' | 'right' | 'bottom' | 'left';

// How far the edge the pointer crossed first gives, in pixels: inward as it enters, outward as it leaves.
const GIVE_PX = 2.6;
// A rope swaying, unhurried: about three swings a second, calming over a second and a half.
const SWING = 2 * Math.PI * 3;
const DECAY_S = 0.38;
const LASTS_S = 1.5;
// Room around the card for an edge bowing out.
const ROOM_PX = 6;
const SVG = 'http://www.w3.org/2000/svg';
// The design's cards (its card radius, as a token or written out).
const CARD = '.rounded-evo-card, .rounded-\\[14px\\]';
// A block the size of the page is no card to sway.
const WIDEST_PX = 960;
const TALLEST_PX = 640;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// One crossing of an edge: when, and how far it first gives (inward for a positive value).
interface Pluck {
	side: Side;
	start: number;
	push: number;
}
interface Rope {
	svg: SVGSVGElement;
	path: SVGPathElement;
	plucks: Pluck[];
	frame: number;
	restore: () => void;
}
const ropes = new Map<HTMLElement, Rope>();

/**
 * Whether a card can sway: drawn by one plain border, the same all round, and
 * one radius (the outline redraws exactly that), nothing clipped (its bowing
 * edge would be cut), no picture behind it (it would stay behind), not fixed
 * on the window (a dialog), and no bigger than a card.
 */
function swayable(card: HTMLElement, style: CSSStyleDeclaration): boolean {
	const width = parseFloat(style.borderTopWidth);
	const sides = [style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((w) => parseFloat(w) === width);
	const corners = [style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].every((r) => r === style.borderTopLeftRadius);
	return (
		width > 0 &&
		sides &&
		corners &&
		style.borderTopStyle === 'solid' &&
		style.overflowX === 'visible' &&
		style.overflowY === 'visible' &&
		style.backgroundImage === 'none' &&
		style.position !== 'fixed' &&
		card.offsetWidth <= WIDEST_PX &&
		card.offsetHeight <= TALLEST_PX
	);
}

/** The side of the card the point (a pointer crossing it) is nearest to. */
function sideNear(card: HTMLElement, x: number, y: number): Side {
	const r = card.getBoundingClientRect();
	const away: [Side, number][] = [
		['top', Math.abs(y - r.top)],
		['bottom', Math.abs(r.bottom - y)],
		['left', Math.abs(x - r.left)],
		['right', Math.abs(r.right - x)]
	];
	return away.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

/** The outline of the card, each side bowed by how far it gives now (inward for a positive value). */
function outline(w: number, h: number, border: number, radius: number, give: Record<Side, number>): string {
	const x0 = ROOM_PX + border / 2;
	const y0 = ROOM_PX + border / 2;
	const x1 = ROOM_PX + w - border / 2;
	const y1 = ROOM_PX + h - border / 2;
	const r = Math.max(0, radius - border / 2);
	const mx = (x0 + x1) / 2;
	const my = (y0 + y1) / 2;
	// A quadratic whose control sits twice as far as the middle of the side should bow.
	return [
		`M${x0 + r} ${y0}`,
		`Q${mx} ${y0 + 2 * give.top} ${x1 - r} ${y0}`,
		`A${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
		`Q${x1 - 2 * give.right} ${my} ${x1} ${y1 - r}`,
		`A${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
		`Q${mx} ${y1 - 2 * give.bottom} ${x0 + r} ${y1}`,
		`A${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
		`Q${x0 + 2 * give.left} ${my} ${x0} ${y0 + r}`,
		`A${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
		'Z'
	].join('');
}

function stop(card: HTMLElement) {
	const rope = ropes.get(card);
	if (!rope) return;
	cancelAnimationFrame(rope.frame);
	rope.svg.remove();
	rope.restore();
	ropes.delete(card);
}

/**
 * Plucks one edge of a card like a rope, lightly and unhurried: the edge the
 * pointer crossed sways (`inward` as it enters, outward as it leaves) and
 * calms; each edge sways on its own, and crossing an edge again adds to how
 * it sways, as on a string, so nothing ever jumps. The content never moves:
 * while an edge sways, the card's own border and background step aside for
 * an outline drawn under its content, redrawn each frame.
 */
function pluck(card: HTMLElement, side: Side, inward: boolean) {
	if (reducedMotion()) return;
	const sway: Pluck = { side, start: performance.now(), push: inward ? GIVE_PX : -GIVE_PX };
	const swaying = ropes.get(card);
	if (swaying) return void swaying.plucks.push(sway);
	// A card moving with its grid (an animation of the page's own) is left alone.
	if (card.getAnimations().some((a) => a.playState === 'running' && !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))) return;
	const style = getComputedStyle(card);
	if (!swayable(card, style)) return;
	let w = card.offsetWidth;
	let h = card.offsetHeight;
	const border = parseFloat(style.borderTopWidth) || 0;
	const radius = parseFloat(style.borderTopLeftRadius) || 0;
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	const fit = () => {
		svg.setAttribute('width', `${w + 2 * ROOM_PX}`);
		svg.setAttribute('height', `${h + 2 * ROOM_PX}`);
	};
	fit();
	Object.assign(svg.style, {
		position: 'absolute',
		left: `${-ROOM_PX - border}px`,
		top: `${-ROOM_PX - border}px`,
		zIndex: '-1',
		pointerEvents: 'none',
		overflow: 'visible'
	});
	const path = document.createElementNS(SVG, 'path');
	path.setAttribute('fill', style.backgroundColor);
	path.setAttribute('stroke', style.borderTopColor);
	path.setAttribute('stroke-width', `${border}`);
	path.setAttribute('d', outline(w, h, border, radius, { top: 0, right: 0, bottom: 0, left: 0 }));
	svg.append(path);
	// The card's own edge steps aside while the drawn one sways, and comes back once it rests.
	const kept = {
		position: card.style.position,
		isolation: card.style.isolation,
		borderColor: card.style.borderColor,
		backgroundColor: card.style.backgroundColor,
		transition: card.style.transition
	};
	// Its own transitions held off, so its border neither fades out now nor fades back in once it rests.
	card.style.transition = 'none';
	if (style.position === 'static') card.style.position = 'relative';
	card.style.isolation = 'isolate';
	card.style.borderColor = 'transparent';
	card.style.backgroundColor = 'transparent';
	card.append(svg);
	// The drawn edge copies the look the card had when the pointer crossed it: a card whose look changes while it
	// sways (picked by that very click) rests at once, or its new look would only show once it calmed.
	const looks = new MutationObserver(() => stop(card));
	looks.observe(card, { attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-checked', 'aria-selected', 'aria-current'] });
	const restore = () => {
		looks.disconnect();
		const { transition, ...rest } = kept;
		Object.assign(card.style, rest);
		requestAnimationFrame(() => (card.style.transition = transition));
	};
	const rope: Rope = { svg, path, plucks: [sway], frame: 0, restore };
	const ring = (now: number) => {
		rope.plucks = rope.plucks.filter((p) => (now - p.start) / 1000 < LASTS_S);
		if (!rope.plucks.length || !card.isConnected) return stop(card);
		const give = { top: 0, right: 0, bottom: 0, left: 0 } as Record<Side, number>;
		for (const p of rope.plucks) {
			const t = Math.max(0, (now - p.start) / 1000);
			give[p.side] += p.push * Math.exp(-t / DECAY_S) * Math.sin(SWING * t);
		}
		// The card can grow or shrink while it sways (its comments or its editor open under the pointer): the drawn
		// edge, which stands in for its own border and background, follows it, or what it gained would show bare.
		if (card.offsetWidth !== w || card.offsetHeight !== h) {
			w = card.offsetWidth;
			h = card.offsetHeight;
			fit();
		}
		path.setAttribute('d', outline(w, h, border, radius, give));
		rope.frame = requestAnimationFrame(ring);
	};
	ropes.set(card, rope);
	rope.frame = requestAnimationFrame(ring);
}

/** Stills every card in `container` still swaying: a grid's moves read its cards as they lie (grid-flip). */
export function stillEdges(container: HTMLElement) {
	for (const card of [...ropes.keys()]) if (container.contains(card)) stop(card);
}

/**
 * The cards of the app sway along the edge the pointer crosses, entering or
 * leaving one (pluck): the design's cards, where a rope makes sense
 * (swayable); a card inside another sways on its own, its holder does not.
 * Not on a touch screen; nothing for a reader who asked for reduced motion.
 * `{@attach ropeEdges}` once, on the app's root (root layout).
 */
export function ropeEdges(root: HTMLElement) {
	const cardOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>(CARD) : null);
	// Crossing into or out of a card, not between two of its own parts nor into a card it holds.
	const crossed = (card: HTMLElement | null, other: HTMLElement | null) => !!card && card !== other && !(other && card.contains(other));
	const onOver = (e: PointerEvent) => {
		const card = cardOf(e.target);
		if (e.pointerType !== 'touch' && crossed(card, cardOf(e.relatedTarget))) pluck(card!, sideNear(card!, e.clientX, e.clientY), true);
	};
	const onOut = (e: PointerEvent) => {
		const card = cardOf(e.target);
		if (e.pointerType !== 'touch' && crossed(card, cardOf(e.relatedTarget))) pluck(card!, sideNear(card!, e.clientX, e.clientY), false);
	};
	root.addEventListener('pointerover', onOver);
	root.addEventListener('pointerout', onOut);
	return () => {
		root.removeEventListener('pointerover', onOver);
		root.removeEventListener('pointerout', onOut);
		stillEdges(root);
	};
}
