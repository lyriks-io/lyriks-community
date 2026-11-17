/**
 * Press and move to pan a schema, from anywhere on it: a press stays a click
 * (a box, a link, a button keep theirs) until the pointer has travelled past
 * the threshold; from then on the gesture pans, and the click it ends with is
 * swallowed so releasing over a box does not open it.
 */

/** How far, in CSS pixels, a held press travels before it becomes a pan. */
export const PAN_THRESHOLD_PX = 5;

export interface PanStep {
	readonly dx: number;
	readonly dy: number;
}

/** One press-and-move: pressed (maybe a click), then panning once past the threshold. */
export class PanGesture {
	#origin: { x: number; y: number } | null = null;
	#last = { x: 0, y: 0 };
	#panning = false;

	get pressed(): boolean {
		return this.#origin !== null;
	}

	get panning(): boolean {
		return this.#panning;
	}

	press(x: number, y: number): void {
		this.#origin = { x, y };
		this.#last = { x, y };
		this.#panning = false;
	}

	/** The move to apply, or null while the press can still be a click (or nothing is pressed). */
	move(x: number, y: number): PanStep | null {
		if (!this.#origin) return null;
		if (!this.#panning) {
			if (Math.hypot(x - this.#origin.x, y - this.#origin.y) < PAN_THRESHOLD_PX) return null;
			this.#panning = true;
		}
		const step = { dx: x - this.#last.x, dy: y - this.#last.y };
		this.#last = { x, y };
		return step;
	}

	/** Ends the gesture: true when it panned, so the click that follows is not one. */
	release(): boolean {
		const panned = this.#panning;
		this.#origin = null;
		this.#panning = false;
		return panned;
	}
}

/** A press in a field the reader types or picks in never pans: it selects text or opens the field. */
export function keepsPress(target: EventTarget | null): boolean {
	return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

/** Swallows the click a pan ends with, wherever it lands inside `el`. */
export function swallowNextClick(el: HTMLElement): void {
	const stop = (event: Event) => {
		event.stopPropagation();
		event.preventDefault();
	};
	el.addEventListener('click', stop, { capture: true, once: true });
	// The click, when there is one, comes in the same turn as the release.
	setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 0);
}
