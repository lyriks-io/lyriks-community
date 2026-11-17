/**
 * The look of the boards: the data map and the request's diagrams share it
 * (criterion 59998858), one dotted canvas, one grey ink for the lines, one blue
 * for what is selected, and shapes drawn as the map draws its cards.
 */

/** The dotted canvas a board is drawn on, as an inline style: the design's .ly-grid, toner-1 with fine toner-2 dots. */
export const BOARD_DOTS = 'background-color: var(--color-toner-1); background-image: radial-gradient(circle, var(--color-toner-2) 0.6px, transparent 0.9px); background-size: 6px 6px;';

/** A line between two shapes. */
export const BOARD_LINE = '#8a8a92';
/** A line that says more than the others (who starts a use case). */
export const BOARD_LINE_STRONG = '#55555c';
/** The lines of what is selected. */
export const BOARD_LINE_HOT = '#0066ff';
/** The cardinality marks at a line's ends: the dark ink of the map's text, so they read at the zoom the map opens at. */
export const BOARD_MARK = '#3a3a40';

/** A shape drawn in SVG as the design's node (.ly-node): paper on the dotted ground, an ink-3 border, flat. */
export const BOARD_SHAPE = 'fill-paper stroke-ink-500';
/** The frame that groups shapes (the product around its use cases), as the map frames a database. */
export const BOARD_FRAME = 'fill-surface/50 stroke-line-strong';
/** The name of a frame, in the map's small capitals. */
export const BOARD_FRAME_TITLE = 'fill-ink-500 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.08em]';
