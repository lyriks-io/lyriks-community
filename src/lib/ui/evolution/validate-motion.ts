import { tick } from 'svelte';
import { springEasing, type Spring } from '$ui/design-system/spring-easing';
import { ICONS } from '$ui/design-system/Icon.svelte';

// The button gives under the click, then springs back with a small rebound.
const PRESS = 0.92;
const PRESS_MS = 70;
const PRESS_BACK: Spring = { omega: 30, zeta: 0.45 };
// The green comes into the pill from the button, quickly; a pill that stays waiting lets it go after a moment.
const WASH_MS = 280;
const WASH_HOLD_MS = 260;
const WASH_FADE_MS = 320;
// The button gives its own colour over to the wash this soon after the wash arrived: a hovered button reads darker.
const HAND_OVER_MS = 80;
// A ring of the same green spreads out of the pill and fades.
const RING_DELAY_MS = 90;
const RING_MS = 650;
const RING_PX = 9;
// The reader's stamp pops as green wells up in it from its centre, its initials rise out of a blur, and a small
// ring leaves it.
const STAMP_FROM = 0.55;
const STAMP_DELAY_MS = 110;
const STAMP_POP: Spring = { omega: 24, zeta: 0.42 };
const STAMP_FILL_MS = 300;
const INITIALS_DELAY_MS = 190;
const INITIALS_MS = 300;
const STAMP_RING_DELAY_MS = 230;
const STAMP_RING_PX = 6;
// A thumbs-up rises above the button and fades out upwards.
const THUMB_MS = 950;
const THUMB_PX = 26;
// The thumbs-up of the icon set, drawn in white on the green badge.
const THUMB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS['thumbs-up']}</svg>`;
// How long the page waits before it moves on to the next block (evo-scroll), so the reader sees the validation land.
const BEAT_MS = 420;

const reducedMotion = () => typeof window === 'undefined' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let beatUntil = 0;

/**
 * Plays a validation the reader just gave from a Validate `button`: it gives
 * under the click and springs back, the green comes into its `pill` from the
 * button (BlockControls: the wash it holds, `data-validate-wash`), a ring
 * spreads out and fades, the reader's stamp pops as it turns green, and a
 * thumbs-up rises above the button and fades out upwards, taking off from the
 * one the Validate showed under the pointer (`.validate-thumb`). Called on the click,
 * before the validation runs: it reads which stamps still wait, then plays once
 * the page shows the validation. Without a pill (a lone check), the ring
 * spreads from the button. Nothing moves for a reader who asked for reduced
 * motion.
 */
export function celebrateValidation(button: HTMLElement, pill: HTMLElement | null = null): void {
	if (reducedMotion() || typeof button.animate !== 'function') return;
	beatUntil = performance.now() + BEAT_MS;
	const back = springEasing(PRESS_BACK);
	const pressed = PRESS_MS + back.duration;
	button.animate(
		[
			{ scale: '1', easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
			{ scale: `${PRESS}`, offset: PRESS_MS / pressed, easing: back.easing },
			{ scale: '1' }
		],
		{ duration: pressed }
	);
	const waiting = new Set(pill?.querySelectorAll('[data-stamp-ok="false"]') ?? []);
	const tint = getComputedStyle(button).backgroundColor;
	const preview = button.querySelector<HTMLElement>('.validate-thumb');
	const shown = preview && Number(getComputedStyle(preview).opacity) > 0.5 ? preview.getBoundingClientRect() : null;
	void tick().then(() => {
		const green = getComputedStyle(button).getPropertyValue('--color-evo-green').trim() || '#0f6650';
		if (pill) wash(pill, button, tint);
		ring(pill ?? button, green);
		for (const stamp of pill?.querySelectorAll<HTMLElement>('[data-stamp-ok="true"]') ?? []) if (waiting.has(stamp)) arrive(stamp, green);
		thumbUp(button, shown);
	});
}

/** Resolves once the validation playing now has had its beat, at once when none plays: the page moves on after it. */
export function afterValidationBeat(): Promise<void> {
	const wait = beatUntil - performance.now();
	return wait > 0 ? new Promise((resolve) => window.setTimeout(resolve, wait)) : Promise.resolve();
}

/**
 * The green spreading through the pill from the button, held a moment, then
 * let go (a settled pill is green under it). The button, which had its own
 * colour (`tint`, violet or grey), turns that green with it rather than fading
 * through it, then leaves the green to the pill.
 */
function wash(pill: HTMLElement, button: HTMLElement, tint: string) {
	const layer = pill.querySelector<HTMLElement>('[data-validate-wash]');
	if (!layer) return;
	const soft = getComputedStyle(layer).backgroundColor;
	for (const running of layer.getAnimations()) running.cancel();
	const p = pill.getBoundingClientRect();
	const b = button.getBoundingClientRect();
	const x = b.left + b.width / 2 - p.left;
	const y = b.top + b.height / 2 - p.top;
	const reach = Math.hypot(Math.max(x, p.width - x), Math.max(y, p.height - y));
	layer.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${reach}px at ${x}px ${y}px)` }], {
		duration: WASH_MS,
		easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
		fill: 'forwards'
	});
	const total = WASH_MS + WASH_HOLD_MS + WASH_FADE_MS;
	const held = (WASH_MS + WASH_HOLD_MS) / total;
	layer.animate([{ opacity: 1 }, { opacity: 1, offset: held }, { opacity: 0 }], { duration: total });
	button.animate(
		[
			{ backgroundColor: tint, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
			{ backgroundColor: soft, offset: WASH_MS / (WASH_MS + HAND_OVER_MS) },
			{ backgroundColor: 'transparent' }
		],
		{ duration: WASH_MS + HAND_OVER_MS }
	);
}

function ring(el: HTMLElement, green: string) {
	el.animate([{ boxShadow: `0 0 0 0 rgb(from ${green} r g b / 0.35)` }, { boxShadow: `0 0 0 ${RING_PX}px rgb(from ${green} r g b / 0)` }], {
		duration: RING_MS,
		delay: RING_DELAY_MS,
		easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
	});
}

/**
 * The reader's stamp arriving: it pops, its green wells up from its centre
 * (a disc growing over white, the stamp's own green once it fills it), its
 * initials rise out of a blur, and a small ring leaves it.
 */
function arrive(stamp: HTMLElement, green: string) {
	const { easing, duration } = springEasing(STAMP_POP);
	stamp.animate([{ scale: `${STAMP_FROM}` }, { scale: '1' }], { duration, delay: STAMP_DELAY_MS, easing, fill: 'backwards' });
	// The green it ends on (BlockControls: a validated stamp), not what its colour transition reads now.
	const filled = getComputedStyle(stamp).getPropertyValue('--color-evo-green-stroke').trim() || '#1fa98a';
	const disc = { backgroundColor: '#f7f4ec', backgroundImage: `radial-gradient(circle closest-side, ${filled} 99%, transparent 100%)`, backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
	stamp.animate([{ ...disc, backgroundSize: '0% 0%' }, { ...disc, backgroundSize: '100% 100%' }], {
		duration: STAMP_FILL_MS,
		delay: STAMP_DELAY_MS,
		easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
		fill: 'backwards'
	});
	stamp.querySelector('[data-stamp-initials]')?.animate(
		[
			{ opacity: 0, translate: '0 5px', filter: 'blur(3px)' },
			{ opacity: 1, translate: '0 0', filter: 'blur(0)' }
		],
		{ duration: INITIALS_MS, delay: INITIALS_DELAY_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }
	);
	stamp.animate([{ boxShadow: `0 0 0 0 rgb(from ${green} r g b / 0.45)` }, { boxShadow: `0 0 0 ${STAMP_RING_PX}px rgb(from ${green} r g b / 0)` }], {
		duration: RING_MS,
		delay: STAMP_RING_DELAY_MS,
		easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
	});
}

/**
 * A green thumbs-up badge over the button: it pops in with a small tilt, then
 * rises and fades out upwards; from the thumbs-up the button showed (`from`),
 * it takes off from there. It sits in the page's scroller, so it travels with
 * the block when the page moves on to the next one.
 */
function thumbUp(button: HTMLElement, from: DOMRect | null) {
	const scroller = button.closest<HTMLElement>('#app-scroll');
	const b = button.getBoundingClientRect();
	const s = scroller?.getBoundingClientRect();
	const x = from ? from.left + from.width / 2 : b.left + b.width / 2;
	const y = from ? from.top + from.height / 2 : b.top - 6 - THUMB_PX / 2;
	const thumb = document.createElement('span');
	thumb.setAttribute('aria-hidden', 'true');
	thumb.className = 'pointer-events-none z-30 grid place-items-center border-[1.5px] border-ink bg-green text-ink shadow-press';
	thumb.innerHTML = THUMB_ICON;
	Object.assign(thumb.style, {
		position: scroller ? 'absolute' : 'fixed',
		width: `${THUMB_PX}px`,
		height: `${THUMB_PX}px`,
		left: `${x - THUMB_PX / 2 - (s ? s.left - scroller!.scrollLeft : 0)}px`,
		top: `${y - THUMB_PX / 2 - (s ? s.top - scroller!.scrollTop : 0)}px`
	});
	// Taking off from the button, it starts as small as the thumbs-up it shows and climbs higher.
	const rise = from ? b.top - 6 - THUMB_PX / 2 - y : 0;
	(scroller ?? document.body).append(thumb);
	thumb
		.animate(
			[
				from
					? { opacity: 0.6, translate: '0 0', scale: '0.55', rotate: '0deg', easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.3)' }
					: { opacity: 0, translate: '0 8px', scale: '0.5', rotate: '-18deg', easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.3)' },
				{ opacity: 1, translate: `0 ${rise - 2}px`, scale: '1.12', rotate: '6deg', offset: 0.2, easing: 'ease-out' },
				{ opacity: 1, translate: `0 ${rise - 6}px`, scale: '1', rotate: '0deg', offset: 0.34, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' },
				{ opacity: 0, translate: `0 ${rise - 36}px`, scale: '0.94', rotate: '0deg' }
			],
			{ duration: THUMB_MS, fill: 'forwards' }
		)
		.finished.then(
			() => thumb.remove(),
			() => thumb.remove()
		);
}
