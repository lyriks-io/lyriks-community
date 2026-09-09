/**
 * Reusable "focus & flash" anchor mechanism — framework-pure UI, no domain
 * import. A "Fix now" jump (Global Coherence) or an in-page banner link lands on
 * a deep-linked field; this scrolls it to the centre and pulses a short-lived
 * highlight so the eye finds it. The pulse CSS (`.focus-flash`) lives in
 * `src/app.css` and is neutralized by the app-wide reduced-motion rule.
 *
 * Targets are opted-in with a stable `data-anchor="<key>"` attribute; the key
 * matches whatever the URL carries (see `anchorKeyFromUrl`).
 */

const FLASH_CLASS = 'focus-flash';
const FLASH_MS = 1200;

/** Scroll an element into view and replay the highlight pulse on it. */
export function flashElement(el: HTMLElement | null | undefined): void {
	if (!el) return;
	el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	// Restart the animation even if the element is still mid-pulse from a prior
	// jump: drop the class, force a reflow, then re-add so the keyframes replay.
	el.classList.remove(FLASH_CLASS);
	void el.offsetWidth;
	el.classList.add(FLASH_CLASS);
	window.setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_MS);
}

/**
 * The anchor key a URL points at, in the shapes the app already emits:
 * `#<key>`, `?anchor=<key>`, or the `focusAnchor` suffix `…&node=<key>`.
 * Returns null when the URL carries no anchor.
 */
export function anchorKeyFromUrl(url: URL): string | null {
	if (url.hash) return decodeURIComponent(url.hash.slice(1));
	return url.searchParams.get('anchor') ?? url.searchParams.get('node');
}

/**
 * Svelte action: `use:focusField={key}`. On mount and whenever `key` changes,
 * find the `[data-anchor="<key>"]` element (searched inside the node first, then
 * the whole document) and flash it. Reacting to `key` changes — not just mount —
 * matters because client-side navigation reuses the page component instead of
 * remounting it, so a fresh "Fix now" to the same page still fires.
 */
export function focusField(node: HTMLElement, key: string | null | undefined) {
	function run(k: string | null | undefined) {
		if (!k) return;
		// Defer a frame: the target may only enter the DOM after the tab/section
		// switch that the same navigation triggered has rendered.
		requestAnimationFrame(() => {
			const selector = `[data-anchor="${CSS.escape(k)}"]`;
			flashElement(
				node.querySelector<HTMLElement>(selector) ??
					document.querySelector<HTMLElement>(selector)
			);
		});
	}
	run(key);
	return {
		update: run
	};
}
