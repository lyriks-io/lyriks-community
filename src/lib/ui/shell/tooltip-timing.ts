/** As long as the system's own tooltips take to come, never sooner. */
export const TOOLTIP_DELAY_MS = 1000;
/** Once one has shown, a neighbour pointed at within this moment shows its own at once (criterion 9da8bb6e). */
export const TOOLTIP_WARM_MS = 600;

/** How long the next tooltip waits: none while one shows or has just closed, the system's delay otherwise. */
export const tooltipDelay = (shown: boolean, now: number, warmUntil: number): number => (shown || now < warmUntil ? 0 : TOOLTIP_DELAY_MS);

/** Until when the tooltips stay warm once one closes: a moment after a shown one was left, not at all after a press, a scroll or Escape. */
export const warmUntilAfter = (shown: boolean, now: number, cold: boolean, warmUntil: number): number =>
	cold ? 0 : shown ? now + TOOLTIP_WARM_MS : warmUntil;
