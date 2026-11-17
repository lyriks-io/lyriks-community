/**
 * The row a card sits on in a grid of one-column cards, counted from 1 as CSS
 * grid lines count: the card at `index` with `columns` cards per row. A card
 * whose discussion opens is locked on that row across every column, so it keeps
 * its place and the cards that shared its row move below it.
 */
export function rowOfIndex(index: number, columns: number): number {
	const perRow = Math.max(1, Math.floor(columns));
	return Math.floor(Math.max(0, index) / perRow) + 1;
}

/** How many columns a computed `grid-template-columns` holds ("240px 240px 240px" is 3). */
export function columnCount(template: string): number {
	const tracks = template.trim().split(/\s+(?![^(]*\))/).filter(Boolean);
	return Math.max(1, tracks.length);
}
