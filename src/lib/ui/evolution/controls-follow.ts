/**
 * Where a long section's controls follow it, and the shape they take
 * (ac-evo-form-controls-follow). While its header has scrolled under the
 * page's sticky bars and its body is still on screen, a narrow tab grows out
 * of the section's right edge at the top of the window: part of the section's
 * frame, its outline running on from the section's border through concave
 * joints. Where the side cannot hold the tab, it grows inward, against that
 * edge. It leaves glued to its section: while it is drawn back in, it keeps
 * the section's edge and rides with it, its controls shrinking into the edge
 * with the material. Pure: the component measures and animates, this decides
 * and draws.
 */

export interface FollowInput {
	/** The section's header row on screen. */
	readonly header: { readonly bottom: number };
	/**
	 * The section's card on screen; `bottom` is where what its own controls
	 * validate ends (the card's bottom, or above the items below it that carry
	 * their own controls).
	 */
	readonly card: { readonly top: number; readonly bottom: number; readonly right: number };
	/** Where the last sticky bar above the content ends: what lies above it is out of view. */
	readonly stickyBottom: number;
	readonly viewport: { readonly width: number };
	/** The tab at full size. */
	readonly tab: { readonly width: number; readonly height: number };
}

/** `edge` is the x of the section's right edge; the tab grows to its right (`out`) or inward (`in`). */
export type FollowPlace = { readonly side: 'out' | 'in'; readonly edge: number; readonly top: number };

const GAP = 12;
const EDGE = 8;
/** Under this much of the section left under the sticky bars, it has scrolled past. */
const SCROLLED_PAST = 48;
/** The concave joint where the tab leaves the section's border, at full size. */
export const JOINT = 8;

/** Where the tab shows, null while the header is in view or once the section has scrolled past. */
export function followPlace(input: FollowInput): FollowPlace | null {
	const { header, card, stickyBottom, tab } = input;
	if (header.bottom > stickyBottom) return null;
	if (card.bottom - stickyBottom < SCROLLED_PAST + tab.height / 2) return null;
	return tabPlace(input);
}

/** Where the tab sits against its section, shown or not: the place it leaves from, glued to the section as it goes. */
export function tabPlace({ card, stickyBottom, viewport, tab }: FollowInput): FollowPlace {
	// Under the sticky bars, its joint included, never past the section's own end, and never above its top: a header
	// coming back down takes the tab with it.
	const top = Math.max(card.top + GAP + JOINT, Math.min(stickyBottom + GAP + JOINT, card.bottom - tab.height - JOINT - GAP));
	const side = viewport.width - card.right - EDGE >= tab.width + JOINT ? 'out' : 'in';
	return { side, edge: card.right, top };
}

/**
 * The controls' look for the material's `stretch`: full size from where the
 * tab is out, shrinking toward the edge as it is drawn back in, gone once
 * flat; never larger than full size while the spring overshoots.
 */
export function controlsLook(stretch: number): { scale: number; opacity: number } {
	const s = Math.max(0, Math.min(1, stretch));
	return { scale: s, opacity: Math.min(1, s * 1.6) };
}

/**
 * The tab's outline, `stretch` from 0 (the flat edge) to 1 (the tab out; past
 * 1 while a spring overshoots), in coordinates whose x = 0 is the section's
 * border line and y = 0 the tab's top. `line` is the outline from where it
 * leaves the border to where it meets it again; `fill` closes it over the
 * border so the section's own line does not show through the joint. Coming
 * out, the material swells before it lengthens, from the tab's top; `leaving`,
 * the whole tab shrinks as one piece toward the middle of its edge, as its
 * controls do, `top` saying how far its outline then sits below the tab's top.
 */
export function tabPath(
	stretch: number,
	{ width, height, side, border, leaving = false }: { width: number; height: number; side: 'out' | 'in'; border: number; leaving?: boolean }
) {
	const s = Math.max(0, stretch);
	const dir = side === 'out' ? 1 : -1;
	const w = width * s;
	const h = height * Math.min(1, leaving ? s : 0.55 + 0.45 * s);
	const top = leaving ? (height - h) / 2 : 0;
	const r = Math.min(JOINT, w / 2, h / 4);
	const c = Math.min(10, Math.max(0, w - r) / 2, h / 4);
	const x = (v: number) => (dir * v).toFixed(2);
	const y = (v: number) => v.toFixed(2);
	const line =
		`M0 ${y(-r)}Q0 0 ${x(r)} 0` +
		`L${x(w - c)} 0Q${x(w)} 0 ${x(w)} ${y(c)}` +
		`L${x(w)} ${y(h - c)}Q${x(w)} ${y(h)} ${x(w - c)} ${y(h)}` +
		`L${x(r)} ${y(h)}Q0 ${y(h)} 0 ${y(h + r)}`;
	const fill = `${line}L${x(-border - 1)} ${y(h + r)}L${x(-border - 1)} ${y(-r)}Z`;
	return { line, fill, height: h, top };
}
