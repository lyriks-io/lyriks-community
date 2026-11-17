import { navigating, page } from '$app/state';

/**
 * The path a tab bar marks as current: the page being opened from the moment
 * its link is pressed, while it loads, then the page shown; back to the page
 * still shown if the navigation fails or is given up (criterion d7b34c94).
 */
export const shownPath = (): string => navigating.to?.url.pathname ?? page.url.pathname;
