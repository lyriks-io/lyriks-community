/**
 * How every bar of the app draws how far something stands (criteria 7beb0b83
 * and b663dee4). A bar beside a count of things is cut into one cell per thing
 * while its total is at most MAX_COUNTED_CELLS, its filled cells exactly its
 * count, each part in its own colour and in order; past that, or for a share,
 * the bar is drawn whole, its parts side by side. Every cell and every end
 * leans like the segments of a retro gauge. Pure.
 */
export const MAX_COUNTED_CELLS = 24;

/** How far a side leans per pixel of the bar's height: one angle whatever the height. */
export const SLANT_RATIO = 0.25;

export type GaugeDrawing =
	/** One entry per cell: the index of the part that fills it, or null for an empty cell. */
	| { readonly kind: 'cells'; readonly cells: readonly (number | null)[] }
	/** How much of the bar is filled, in percent, and each part's weight inside what is filled. */
	| { readonly kind: 'share'; readonly filled: number; readonly weights: readonly number[] };

/**
 * `parts` are counts out of `total` when `counts` is set, else shares of it
 * (a percentage is a share of 100). A non-zero bar never reads as empty.
 */
export function gaugeDrawing(parts: readonly number[], total: number, counts: boolean): GaugeDrawing {
	const values = parts.map((v) => Math.max(0, counts ? Math.round(v) : v));
	if (counts && total > 0 && total <= MAX_COUNTED_CELLS) {
		const cells: (number | null)[] = [];
		values.forEach((v, part) => {
			for (let i = 0; i < v && cells.length < total; i++) cells.push(part);
		});
		while (cells.length < total) cells.push(null);
		return { kind: 'cells', cells };
	}
	const sum = values.reduce((a, b) => a + b, 0);
	const filled = total > 0 ? Math.min(100, (sum / total) * 100) : 0;
	return { kind: 'share', filled: sum > 0 ? Math.max(2, filled) : 0, weights: values };
}

/** The outline of a cell, and of a bar's ends: a parallelogram whose two sides lean the same way. */
export function slantedOutline(heightPx: number): string {
	const slant = Math.round(heightPx * SLANT_RATIO * 2) / 2;
	return `polygon(${slant}px 0, 100% 0, calc(100% - ${slant}px) 100%, 0 100%)`;
}
