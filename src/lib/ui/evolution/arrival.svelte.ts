import { getContext, setContext } from 'svelte';
import type { ProposalArrival } from '$domain/evolution';
import type { RequestTab } from './request-tabs';

/**
 * Where an address opened the request page, and what the page says about it
 * (ac-leaf-6709493f, ac-evo-link-arrival-only). The note belongs to the
 * arrival: beside the place it concerns (`anchor`, the element id of that
 * place) or at the top of the request (`anchor` null), it goes as soon as the
 * person moves on, and a live refresh never brings it back.
 */
export interface ArrivalPlace {
	/** The tab the arrival opened; leaving it is moving on. */
	readonly tab: RequestTab;
	/** The element the note sits beside; null puts it at the top of the request. */
	readonly anchor: string | null;
	/** What became of the place, or null when the place was there and nothing needs saying. */
	readonly text: string | null;
}

export class Arrival {
	place = $state<ArrivalPlace | null>(null);

	constructor(
		/** Drops the place from the page's address, so a reload opens where the person is. */
		private readonly forgetAddress: () => void
	) {}

	land(place: ArrivalPlace): void {
		this.place = place;
	}

	/** The person moved on (another step, another address, the note's close button). */
	leave(): void {
		if (!this.place) return;
		this.place = null;
		this.forgetAddress();
	}

	/** The note to show beside `anchor`, if the arrival put one there. */
	noteBeside(anchor: string): string | null {
		return this.place?.anchor === anchor ? this.place.text : null;
	}
}

const KEY = Symbol('evolution-arrival');

export function provideArrival(arrival: Arrival): void {
	setContext(KEY, arrival);
}

/** The request page's arrival; outside one (a tab rendered on its own), none. */
export function useArrival(): Arrival | null {
	return getContext<Arrival | undefined>(KEY) ?? null;
}

/** The person as the page names them, or the id when nothing better is known. */
type NameOf = (id: string) => string;

/** What one line beside a decided suggestion's answer says, short and specific. */
export function decidedNote(arrival: Extract<ProposalArrival, { kind: 'decided' }>, nameOf: NameOf): string {
	if (arrival.decision === 'accepted') {
		return arrival.by ? `The suggestion your link pointed to was accepted by ${nameOf(arrival.by)}.` : 'The suggestion your link pointed to was accepted.';
	}
	if (arrival.decision === 'refused') return 'The suggestion your link pointed to was refused: the answer keeps what it held.';
	return 'The suggestion your link pointed to was answered with a comment.';
}

/** What the top of the request says when a link's suggestion left nothing to open. */
export function goneSuggestionNote(kind: 'withdrawn' | 'unknown'): string {
	return kind === 'withdrawn'
		? 'The suggestion your link pointed to was taken back before anyone decided it.'
		: 'The suggestion your link pointed to is no longer on this request.';
}
