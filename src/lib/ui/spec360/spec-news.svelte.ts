import { getContext, setContext } from 'svelte';
import { unseenNews, type SpecNews, type SpecSeen } from '$application/spec360/spec-news';

/**
 * The New and Changed badges of the Specification 360° for the reader
 * (criteria 2a6bff42, b0950115): what changed lately and they have not opened
 * since. Opening a feature takes its badge off at once, then tells the server.
 */
export class SpecNewsView {
	#seen = $state<Record<string, string>>({});

	constructor(
		private readonly projectId: string,
		private readonly read: () => { news: Readonly<Record<string, SpecNews>>; seen: SpecSeen }
	) {}

	/** The badge a feature or core feature carries for this reader, none when it has nothing new for them. */
	badgeOf(id: string): SpecNews | null {
		const { news, seen } = this.read();
		return unseenNews(news[id] ? { [id]: news[id] } : {}, { ...seen, ...this.#seen })[id] ?? null;
	}

	/** The reader opened it: its badge goes now, and stays gone until it changes again. */
	open(id: string): void {
		if (!this.badgeOf(id)) return;
		this.#seen = { ...this.#seen, [id]: new Date().toISOString() };
		void fetch(`/api/projects/${encodeURIComponent(this.projectId)}/spec-seen`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ids: [id] })
		}).catch(() => {});
	}
}

const KEY = Symbol('spec-news');

export function provideSpecNews(view: SpecNewsView): SpecNewsView {
	setContext(KEY, view);
	return view;
}

/** The reader's badges; none outside a Specification 360° page. */
export function useSpecNews(): SpecNewsView | null {
	return getContext<SpecNewsView | undefined>(KEY) ?? null;
}
