import { tick } from 'svelte';
import { springEasing, type Spring } from '$ui/design-system/spring-easing';
import { stillEdges } from '$ui/shell/rope-edges';

/**
 * Moves the cards of a grid when one of them changes size (its discussion
 * opens across the whole row, or closes), with a little life. The card the
 * reader acted on first gives under the click: it squishes for a beat while
 * nothing else changes. Then the change happens and every card plays from
 * where it was to where it is (First, Last, Invert, Play): the card acted on
 * springs to its place, overshooting a touch, and lets go of its squish with a
 * small rebound; the others follow a beat later on a softer, slower spring.
 * Only transforms move, and the clips that reveal and fold the cards, so it
 * runs at 60 fps. A card never stretches its text: one that grows is revealed
 * from its former size; one that shrinks from across its row is played by a
 * likeness of itself taken just before the change, folding to its new size
 * and place while the card appears under it. Nothing moves for a reader who
 * asked for reduced motion.
 */

// The beat the card acted on gives under the click before anything changes.
const SQUISH = 0.965;
const SQUISH_MS = 100;
const SQUISH_EASE = 'cubic-bezier(0.3, 0, 0.2, 1)';
// The card acted on: lively, a slight overshoot; its squish lets go with a small rebound.
const LEAD: Spring = { omega: 20, zeta: 0.75 };
const REBOUND: Spring = { omega: 26, zeta: 0.45 };
// The other cards: softer and slower, a beat later.
const FOLLOW: Spring = { omega: 15, zeta: 0.88 };
const FOLLOW_DELAY_MS = 50;
// A card's corner, kept while a growing card is revealed.
const RADIUS = 14;
// Tells this module's animations from a card's own (its entry).
const ID = 'grid-flip';
// A card spanning this share of its grid's width (its discussion open) may fold back: its likeness is taken first.
const SPANS_ROW = 0.75;
// The card under a folding likeness shows through between these shares of the fold: as the likeness lands, so
// the cards passing under it on their way never show through it.
const SHOW_FROM = 0.4;
const SHOW_BY = 0.6;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const cardsOf = (grid: HTMLElement) => [...grid.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !('gridLikeness' in el.dataset));
// Where a squished card sits in fact: the squish shrinks it around its centre.
const unsquished = (r: DOMRect) => new DOMRect(r.x + (r.width - r.width / SQUISH) / 2, r.y + (r.height - r.height / SQUISH) / 2, r.width / SQUISH, r.height / SQUISH);

/** Runs `change` on the grid with the motion above; `from` is what the reader clicked, inside the card acted on. */
export async function flipGrid(grid: HTMLElement | null, change: () => void | Promise<void>, from: Element | null = null): Promise<void> {
	if (!grid || reducedMotion() || typeof grid.animate !== 'function') {
		await change();
		return;
	}
	// A card still swaying from the pointer's crossing (rope-edges) rests first, so it is read, and copied, as it is.
	stillEdges(grid);
	const lead = from ? (cardsOf(grid).find((el) => el.contains(from)) ?? null) : null;
	if (lead) await lead.animate([{ scale: '1' }, { scale: `${SQUISH}` }], { id: ID, duration: SQUISH_MS, easing: SQUISH_EASE, fill: 'forwards' }).finished.catch(() => {});
	const first = new Map(cardsOf(grid).map((el) => [el, el === lead ? unsquished(el.getBoundingClientRect()) : el.getBoundingClientRect()] as const));
	// Once laid out small, a card cannot show the size it had: a card across its row leaves its likeness first.
	const likeness = new Map([...first].filter(([, r]) => r.width > grid.clientWidth * SPANS_ROW).map(([el]) => [el, el.cloneNode(true) as HTMLElement] as const));
	await change();
	await tick();
	// From here on, in one go so no frame shows a card out of place: the moves still running end, every card is read
	// where it now sits, and plays from where it was.
	for (const old of grid.querySelectorAll<HTMLElement>('[data-grid-likeness]')) {
		for (const running of old.getAnimations()) running.cancel();
		old.remove();
	}
	const cards = cardsOf(grid);
	for (const el of cards) for (const running of el.getAnimations()) if (running.id === ID) running.cancel();
	const lively = springEasing(LEAD);
	const soft = springEasing(FOLLOW);
	for (const el of cards) {
		const a = first.get(el);
		if (!a) continue;
		const b = el.getBoundingClientRect();
		const led = el === lead;
		const timing = led ? { ...lively, delay: 0 } : { ...soft, delay: FOLLOW_DELAY_MS };
		const stand = likeness.get(el);
		if (stand && (b.width < a.width - 1 || b.height < a.height - 1)) fold(grid, el, stand, a, b, timing, led);
		else {
			const origin = play(el, a, b, timing);
			if (led) letGoOfSquish(el, origin);
		}
	}
}

/** Plays one card from `a` to `b`; answers the point its squish shrinks around, in its own box, as it now lays out. */
function play(el: HTMLElement, a: DOMRect, b: DOMRect, timing: { easing: string; duration: number; delay: number }): string {
	const options: KeyframeAnimationOptions = { id: ID, ...timing, fill: 'backwards' };
	const grew = b.width > a.width + 1 || b.height > a.height + 1;
	const shrank = b.width < a.width - 1 || b.height < a.height - 1;
	if (grew) {
		// Revealed from the size it had, so its text never stretches.
		const right = Math.max(0, b.width - a.width);
		const bottom = Math.max(0, b.height - a.height);
		el.animate(
			[
				{ translate: `${a.left - b.left}px ${a.top - b.top}px`, clipPath: `inset(0 ${right}px ${bottom}px 0 round ${RADIUS}px)` },
				{ translate: '0px 0px', clipPath: `inset(0 0 0 0 round ${RADIUS}px)` }
			],
			options
		);
		return `${a.width / 2}px ${a.height / 2}px`;
	}
	// A card a little shorter in its new row (the row's height) only moves: scaling it would squash its text.
	if (shrank || Math.abs(a.left - b.left) >= 1 || Math.abs(a.top - b.top) >= 1) {
		el.animate([{ translate: `${a.left - b.left}px ${a.top - b.top}px` }, { translate: '0px 0px' }], options);
	}
	return '50% 50%';
}

/**
 * A card folding back from across its row: its likeness, laid where the card
 * was and as it looked, folds to the card's new size (a clip, its text never
 * stretches) on the way to its new place, while the card, already there,
 * shows through it; the likeness then goes. The card acted on lets go of its
 * squish in its likeness.
 */
function fold(grid: HTMLElement, el: HTMLElement, stand: HTMLElement, a: DOMRect, b: DOMRect, timing: { easing: string; duration: number; delay: number }, led: boolean) {
	const box = grid.getBoundingClientRect();
	// The likeness is placed in the grid's own box, which it may have to position for the while.
	if (getComputedStyle(grid).position === 'static') {
		grid.style.position = 'relative';
		grid.dataset.gridLikenessHost = '';
	}
	stand.removeAttribute('style');
	for (const named of [stand, ...stand.querySelectorAll('[id]')]) named.removeAttribute('id');
	// Laid in anew, its parts would replay their entry (a discussion fading in): it shows them as they stood.
	for (const part of stand.querySelectorAll<HTMLElement | SVGElement>('*')) part.style.animation = 'none';
	stand.inert = true;
	stand.setAttribute('aria-hidden', 'true');
	stand.dataset.gridLikeness = '';
	Object.assign(stand.style, {
		position: 'absolute',
		left: `${a.left - box.left - grid.clientLeft}px`,
		top: `${a.top - box.top - grid.clientTop}px`,
		width: `${a.width}px`,
		height: `${a.height}px`,
		margin: '0',
		boxSizing: 'border-box',
		pointerEvents: 'none',
		zIndex: '2'
	});
	grid.append(stand);
	const folding = stand.animate(
		[
			{ translate: '0px 0px', clipPath: `inset(0 0 0 0 round ${RADIUS}px)` },
			{ translate: `${b.left - a.left}px ${b.top - a.top}px`, clipPath: `inset(0 ${a.width - b.width}px ${a.height - b.height}px 0 round ${RADIUS}px)` }
		],
		{ id: ID, ...timing, fill: 'both' }
	);
	const through = { id: ID, duration: timing.duration, delay: timing.delay, fill: 'both' as const };
	stand.animate([{ opacity: 1 }, { opacity: 1, offset: SHOW_FROM }, { opacity: 0, offset: SHOW_BY }, { opacity: 0 }], through);
	el.animate([{ opacity: 0 }, { opacity: 0, offset: SHOW_FROM }, { opacity: 1, offset: SHOW_BY }, { opacity: 1 }], through);
	if (led) {
		const { easing, duration } = springEasing(REBOUND);
		stand.animate([{ scale: `${SQUISH}` }, { scale: '1' }], { id: ID, easing, duration });
	}
	const gone = () => {
		stand.remove();
		if (grid.querySelector('[data-grid-likeness]') || !('gridLikenessHost' in grid.dataset)) return;
		grid.style.removeProperty('position');
		delete grid.dataset.gridLikenessHost;
	};
	folding.finished.then(gone, gone);
}

/** The card acted on lets go of its squish with a small rebound, above the cards it slides over until it lands. */
function letGoOfSquish(el: HTMLElement, origin: string) {
	const { easing, duration } = springEasing(REBOUND);
	el.style.zIndex = '1';
	el.animate([{ scale: `${SQUISH}`, transformOrigin: origin }, { scale: '1', transformOrigin: origin }], { id: ID, easing, duration });
	const land = () => {
		if (!el.getAnimations().some((running) => running.id === ID && running.playState === 'running')) el.style.removeProperty('z-index');
	};
	for (const running of el.getAnimations()) if (running.id === ID) running.finished.then(land, land);
}
