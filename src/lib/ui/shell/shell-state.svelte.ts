import { NAV_FOLDED_COOKIE } from './nav-folded';

/**
 * The state the app's navigation shares with the top bar and the panels it
 * opens (feat-feedback-docs, surface App navigation): which panel is open
 * beside the navigation, one at a time; whether the navigation is folded to
 * its icons, remembered on this browser; whether it is open over the page on a
 * narrow screen.
 */
export type ShellPanel = 'search' | 'notifications' | 'projects';

const YEAR_S = 60 * 60 * 24 * 365;

class ShellState {
	panel = $state<ShellPanel | null>(null);
	folded = $state(false);
	menuOpen = $state(false);
	/** A narrow screen (a phone): the navigation neither shows beside the page nor folds there. */
	narrow = $state(false);

	/** Open a panel, closing any other; the same one again closes it. */
	toggle(panel: ShellPanel): void {
		this.panel = this.panel === panel ? null : panel;
	}

	close(): void {
		this.panel = null;
	}

	/** Fold or unfold the navigation (action eff9578e) and remember it on this browser. */
	fold(folded: boolean): void {
		this.folded = folded;
		document.cookie = `${NAV_FOLDED_COOKIE}=${folded ? '1' : '0'}; path=/; max-age=${YEAR_S}; samesite=lax`;
	}
}

export const shell = new ShellState();
