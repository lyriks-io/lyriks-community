/**
 * Where the card of a code place opens (ac-src-code-place): in the free space
 * beside the page, level with the place, when that space holds it, so it covers
 * nothing of the page; otherwise over the page, next to the place, above it in
 * the lower half of the screen. Pure: the component measures, this decides.
 */

export interface CodeCardInput {
	/** The place's box on screen. */
	readonly anchor: { readonly left: number; readonly top: number; readonly bottom: number };
	/** The right edge of the page's content column. */
	readonly columnRight: number;
	readonly viewport: { readonly width: number; readonly height: number };
}

export type CodeCardPlace =
	| { readonly mode: 'beside'; readonly left: number; readonly top: number; readonly width: number }
	| { readonly mode: 'over'; readonly left: number; readonly top: number; readonly width: number; readonly above: boolean };

/** Narrower than this, the excerpt wraps too much to read: the card goes over the page. */
export const CODE_CARD_MIN_BESIDE = 340;
export const CODE_CARD_MAX = 560;
const GAP = 16;
const EDGE = 12;
/** The card's usual height, to keep it on screen when it opens level with a place low on the page. */
const CARD_HEIGHT = 460;

export function codeCardPlace({ anchor, columnRight, viewport }: CodeCardInput): CodeCardPlace {
	const free = viewport.width - columnRight - GAP - EDGE;
	if (free >= CODE_CARD_MIN_BESIDE) {
		const top = Math.max(EDGE, Math.min(anchor.top - GAP, viewport.height - CARD_HEIGHT - EDGE));
		return { mode: 'beside', left: columnRight + GAP, top, width: Math.min(free, CODE_CARD_MAX) };
	}
	const width = Math.min(CODE_CARD_MAX, viewport.width - 2 * EDGE);
	const above = anchor.top > viewport.height / 2;
	return {
		mode: 'over',
		left: Math.min(Math.max(anchor.left, EDGE), Math.max(EDGE, viewport.width - width - EDGE)),
		top: above ? anchor.top : anchor.bottom,
		width,
		above
	};
}
