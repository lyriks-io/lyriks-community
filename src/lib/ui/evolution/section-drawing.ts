/**
 * A section of the Solution and its diagram (ac-evo-sol-diagram-alone): the
 * list and the drawing are two readings of one section, so the drawing is one
 * of the answers the section validates; shown, the drawing takes the height
 * the window leaves under the page's sticky header. Pure: the card measures.
 */

/** The answers one validation of the section covers: its requirements, then its drawing when it has one. */
export function sectionAnswersWithDrawing<T>(answers: readonly T[], drawing: T | null): T[] {
	return drawing ? [...answers, drawing] : [...answers];
}

export interface DrawingRoom {
	/** Where the window's scroller ends on screen: the card may run down to it. */
	readonly windowBottom: number;
	/** Where the card's top sits once brought into view: under the page's sticky header. */
	readonly under: number;
	/** The card's height now, its drawing included. */
	readonly cardHeight: number;
	/** The drawing's height now. */
	readonly drawingHeight: number;
}

/** Room kept under the card, so its bottom edge stays in view. */
const MARGIN = 16;
/** A drawing never shrinks below this, however small the window. */
const LEAST = 360;

/** The drawing's height once the card's top sits under the header: it takes all the room the window leaves below the card. */
export function drawingFillHeight({ windowBottom, under, cardHeight, drawingHeight }: DrawingRoom): number {
	const room = windowBottom - MARGIN - under - cardHeight;
	return Math.max(LEAST, Math.round(drawingHeight + room));
}
