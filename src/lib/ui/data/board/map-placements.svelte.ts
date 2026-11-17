import { browser } from '$app/environment';
import { NO_PLACEMENTS, parseMapPlacements, placedByHand, type MapPlacements } from '$domain/data';
import { pushToast } from '$ui/design-system';

/**
 * Where the tables of a data map stand when people put them by hand
 * (criterion 7f5769bb): a table follows the pointer at once, its place is
 * kept for the project when it is let go, and a save that fails puts the
 * table back where it stood. Kept apart from the specification.
 */
export class MapPlacementsStore {
	doc = $state<MapPlacements>(NO_PLACEMENTS);
	/** What the server holds, to fall back to when a save fails. */
	#saved: MapPlacements = NO_PLACEMENTS;
	/** A table is being moved: a live change from elsewhere waits until it is let go. */
	#moving = false;

	constructor(
		private readonly projectId: string,
		initial: MapPlacements | null
	) {
		if (initial) this.#adopt(initial);
		// Read in the browser only: during server-side rendering SvelteKit's fetch throws on a relative URL,
		// and that throw, left unhandled, ended the whole server process.
		else if (browser) void this.load();
	}

	/** How many tables stand where a person put them. */
	get count(): number {
		return placedByHand(this.doc);
	}

	#adopt(doc: MapPlacements) {
		this.#saved = doc;
		this.doc = doc;
	}

	#url = () => `/api/projects/${encodeURIComponent(this.projectId)}/data-map-placements`;

	async load(): Promise<void> {
		try {
			const res = await fetch(this.#url());
			if (res.ok) this.#adopt(parseMapPlacements((await res.json()).document));
		} catch {
			// Unreadable placements leave the layout's own places, as before.
		}
	}

	/** The placements another reader saved, read back with the page; ignored while a table is in hand. */
	follow(doc: MapPlacements): void {
		if (!this.#moving) this.#adopt(doc);
	}

	/** The table follows the pointer; nothing is saved until it is let go. */
	move(tableId: string, x: number, y: number): void {
		this.#moving = true;
		this.doc = { tables: { ...this.doc.tables, [tableId]: { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } } };
	}

	/** Let go: where the table stands is kept for the project. */
	async drop(tableId: string): Promise<void> {
		this.#moving = false;
		const at = this.doc.tables[tableId];
		if (at) await this.#post({ move: { tableId, ...at } }, 'The table could not be kept there; it went back where it was.');
	}

	/** Every table back where the layout places it. */
	async arrange(): Promise<void> {
		this.doc = NO_PLACEMENTS;
		await this.#post({ arrange: true }, 'The map could not be arranged again; the tables stay where they were put.');
	}

	async #post(body: unknown, failed: string): Promise<void> {
		const res = await fetch(this.#url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
		if (res?.ok) {
			this.#adopt(parseMapPlacements((await res.json()).document));
			return;
		}
		this.doc = this.#saved;
		pushToast({ level: 'error', message: failed });
	}
}
