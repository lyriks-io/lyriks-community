import { getContext, setContext } from 'svelte';
import type { SourceCodePlace, SourceGroup, SpecSourcesIndex } from '$application/spec360/sources';

/**
 * What each block of the Specification 360° rests on, for its sources icon
 * and the panel that opens at its foot (criterion b0ea9889): the sources it
 * cites and the places in the code it was located at, and the one block whose
 * evidence is open. The blocks that cite each source are the Sources page's own. Read from the
 * layout's index, live as it reloads.
 */
export class SpecSourcesView {
	/** The block whose sources are open; one at a time. */
	openAnchor = $state<string | null>(null);
	/** The places in the code, once a block has asked for them. */
	#places = $state<Readonly<Record<string, readonly SourceCodePlace[]>> | null>(null);
	/** The index the places were read for: a reloaded index means they are read again. */
	#placesOf: SpecSourcesIndex | null = null;

	constructor(
		readonly projectId: string,
		private readonly read: () => SpecSourcesIndex
	) {}

	/** The sources a block cites, none for a block that cites nothing. */
	of(anchor: string): readonly string[] {
		return this.read().byAnchor[anchor] ?? [];
	}

	/** The places in the code a behaviour block was located at, once read (see `readPlaces`). */
	codeOf(anchor: string): readonly SourceCodePlace[] {
		return this.#places?.[anchor] ?? [];
	}

	/** How many places in the code a behaviour block was located at, known on every page. */
	codeCountOf(anchor: string): number {
		return this.read().codeCounts[anchor] ?? 0;
	}

	/** Read the places in the code, once for each state of the index. A failed read is tried again the next time a block opens. */
	async readPlaces(): Promise<void> {
		const index = this.read();
		if (this.#placesOf === index) return;
		this.#placesOf = index;
		try {
			const res = await fetch(`/projects/${encodeURIComponent(this.projectId)}/spec/code-places`);
			if (!res.ok) throw new Error(String(res.status));
			this.#places = await res.json();
		} catch {
			if (this.#placesOf === index) this.#placesOf = null;
		}
	}

	/** A block whose sources belong to its parts (the data map, by table), each part with its own. */
	groupsOf(anchor: string): readonly SourceGroup[] {
		return this.read().groupsByAnchor[anchor] ?? [];
	}

	/** How much evidence a block holds: its sources and its places in the code. */
	countOf(anchor: string): number {
		return this.of(anchor).length + this.codeCountOf(anchor);
	}

	toggle(anchor: string) {
		this.openAnchor = this.openAnchor === anchor ? null : anchor;
	}
}

const KEY = Symbol('spec360-sources');

export function provideSources(store: SpecSourcesView): SpecSourcesView {
	return setContext(KEY, store);
}

/** The view of the page's sources; null outside the Specification 360°, where blocks carry no sources icon. */
export function useSources(): SpecSourcesView | null {
	return getContext<SpecSourcesView | undefined>(KEY) ?? null;
}
