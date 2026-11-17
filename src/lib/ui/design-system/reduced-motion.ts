import { fade, fly, type FlyParams, type TransitionConfig } from 'svelte/transition';

/** The reader's system asks for reduced motion (criterion da3bc837). */
export const prefersReducedMotion = (): boolean =>
	typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** How long what appears or leaves fades under reduced motion; app.css keeps it for `[data-reduced-fade]`. */
export const REDUCED_FADE_MS = 150;

/**
 * A Svelte `fly` that only fades under reduced motion (criterion da3bc837): a
 * drawer, a page or a message keeps its fade instead of coming as a hard cut.
 * The element it runs on carries `data-reduced-fade`, so the app-wide rule
 * that stops motion leaves that fade its time.
 */
export function flyOrFade(node: Element, params: FlyParams): TransitionConfig {
	return prefersReducedMotion() ? fade(node, { duration: REDUCED_FADE_MS }) : fly(node, params);
}
