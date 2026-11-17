/**
 * Which columns of a row that scrolls sideways are out of view, on each side
 * (criterion 2c6de3d9): a column counts as out of view once less than `margin`
 * pixels of it show, so a sliver at the edge is still named. Pure.
 */
export interface Span {
	readonly left: number;
	readonly right: number;
}

export function outOfView(columns: readonly Span[], view: Span, margin = 24): { readonly before: number[]; readonly after: number[] } {
	const before: number[] = [];
	const after: number[] = [];
	columns.forEach((c, i) => {
		if (c.right <= view.left + margin) before.push(i);
		else if (c.left >= view.right - margin) after.push(i);
	});
	return { before, after };
}
