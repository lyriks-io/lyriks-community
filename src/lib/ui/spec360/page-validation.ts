/**
 * What a page's validation bar says (criterion f480783f): first what it asks
 * of the reader in one sentence, then where the page stands, said whole in the
 * gauge's tooltip. Pure, so the wording is tested without a browser.
 */

export interface PageStanding {
	/** Validated by everyone they wait on. */
	readonly ok: number;
	/** Validated by some, waiting for others. */
	readonly waiting: number;
	/** Validated by nobody yet. */
	readonly todo: number;
	readonly total: number;
}

export interface PageAsk {
	/** The number set in bold before the sentence, when the reader has something to validate. */
	readonly lead: string | null;
	readonly text: string;
	/** Every element of the page is validated: the sentence reads green. */
	readonly done: boolean;
}

const wait = (n: number) => (n === 1 ? 'waits' : 'wait');

/** The sentence the bar opens on, for the elements of the page still waiting on the reader. */
export function pageAsk(p: PageStanding, mine: number): PageAsk {
	if (p.total === 0) return { lead: null, text: 'Nothing to validate on this page', done: false };
	if (mine > 0) return { lead: String(mine), text: `${mine === 1 ? 'element' : 'elements'} here ${wait(mine)} for your validation`, done: false };
	if (p.ok === p.total) return { lead: null, text: 'Everything here is validated', done: true };
	const left = p.total - p.ok;
	return { lead: null, text: `Nothing waits for you here: ${left} still ${wait(left)} for others`, done: false };
}

/** The gauge's tooltip: the whole of where the page stands. */
export function standingTip(p: PageStanding): string {
	return [`${p.ok} of ${p.total} validated by everyone they wait on`, p.waiting ? `${p.waiting} waiting for others` : '', p.todo ? `${p.todo} not validated yet` : '']
		.filter(Boolean)
		.join(' · ');
}
