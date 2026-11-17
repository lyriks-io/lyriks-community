import { prefersReducedMotion } from '$ui/design-system/reduced-motion';

/**
 * How Lyriks scrolls by itself (a Fix now, a thread, an anchor, a search hit):
 * smoothly, unless reduced motion is asked, and then the jump lands at once
 * (criterion da3bc837). A `behavior: 'smooth'` passed to scrollIntoView or
 * scrollTo overrides the CSS `scroll-behavior` the reduced-motion rule sets,
 * so every such call asks here.
 */
export const scrollMotion = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');
