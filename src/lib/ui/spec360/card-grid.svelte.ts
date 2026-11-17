import { getContext, setContext } from 'svelte';
import { columnCount, rowOfIndex } from './card-row';
import { flipGrid } from './grid-flip';

/**
 * A grid of small cards whose discussion opens inside the card: the card then
 * keeps its row and spans it whole, the cards that shared the row move below
 * it, and the grid moves every card smoothly. The grid element is bound by
 * `CardGrid.svelte`, which also follows its column count as it resizes; a
 * card's discussion button runs its change through it.
 */
export class CardGridMotion {
	el = $state<HTMLElement | null>(null);
	/** Cards per row now, read from the grid's computed tracks. */
	columns = $state(1);
	// One change at a time: a second click waits for the first card to have given under it.
	#queue: Promise<void> = Promise.resolve();

	/** Runs `change` with the grid's motion; `from` is what the reader clicked, inside the card acted on. */
	run(change: () => void | Promise<void>, from: Element | null = null): Promise<void> {
		this.#queue = this.#queue.catch(() => {}).then(() => flipGrid(this.el, change, from));
		return this.#queue;
	}

	/** Read the column count again (on mount and on every resize). */
	measure() {
		if (this.el) this.columns = columnCount(getComputedStyle(this.el).gridTemplateColumns);
	}

	/** The style that keeps an open card on its row across every column; none while closed. */
	lock(index: number, open: boolean): string | undefined {
		return open ? `grid-row: ${rowOfIndex(index, this.columns)}; grid-column: 1 / -1` : undefined;
	}
}

const KEY = Symbol('spec360-card-grid');
export const provideCardGrid = (grid: CardGridMotion) => setContext(KEY, grid);
/** The grid a card sits in, or undefined outside one. */
export const useCardGrid = () => getContext<CardGridMotion | undefined>(KEY);
