/**
 * The columns of a wide table of equal columns that are drawn: those in view
 * plus `spare` on each side, so the cells in the page do not grow with the
 * number of columns (criterion 5787390d). `lead` is the width of what comes
 * before the first column (the sticky column of names), read at its widest:
 * a narrower one only draws a column or two more. Pure.
 */
export function columnWindow(
	scrollLeft: number,
	viewWidth: number,
	count: number,
	column: number,
	lead: number,
	spare = 4
): { start: number; end: number } {
	const start = Math.max(0, Math.floor((scrollLeft - lead) / column) - spare);
	const end = Math.min(count, Math.ceil((scrollLeft + viewWidth) / column) + spare);
	return { start: Math.min(start, end), end };
}
