import type { SpecCount } from '$domain/portfolio/project-tabs';
import type { SpecStanding } from '$lib/shared/app-chrome';
import type { KnowledgeTab } from '$ui/shell/side-nav';
import { relativeWhen } from '$ui/evolution/relative-when';

/**
 * The band and the tab bar across the top of Knowledge's pages (criterion
 * 8e942b12 of feat-feedback-docs): where the specification stands, its version
 * line, and the six chapters. Pure, so the words are tested without a browser.
 */

/** The six tabs, in their order, each with the page it opens under `/projects/<id>/spec`. */
export const KNOWLEDGE_TABS: readonly { readonly id: KnowledgeTab; readonly label: string; readonly path: string; readonly beta?: true }[] = [
	{ id: 'overview', label: 'Overview', path: '' },
	{ id: 'features', label: 'Features', path: '/features' },
	{ id: 'users', label: 'Users', path: '/users' },
	{ id: 'experience', label: 'Experience', path: '/experience', beta: true },
	{ id: 'tech', label: 'Technology & data', path: '/tech/data-map' },
	{ id: 'glossary', label: 'Glossary', path: '/glossary' }
];

/** Why Experience reads Beta (criterion b0d81efd): the least mastered chapter of a specification. */
export const BETA_TIP = 'Beta: the journeys, the screens and the design are still being shaped, read them with care.';

/** What the band says of a specification: VALIDATED, the reference; DRAFT, how far its validation went. */
export function standingBand(state: 'draft' | 'validated', count: SpecCount): { pill: string; text: string; pct: number } {
	if (state === 'validated') return { pill: 'Validated', text: 'This specification is the reference. To change it, propose a change.', pct: 100 };
	const n = count.total === 1 ? 'element' : 'elements';
	return {
		pill: 'Draft · to validate',
		text: `${count.validated} of ${count.total} ${n} validated. Review every element, then validate the specification.`,
		pct: count.total > 0 ? Math.round((count.validated / count.total) * 100) : 0
	};
}

/** The words of a specification's status tag: DRAFT says how far the validation went, VALIDATED that it is done. */
export function specTip(badge: 'draft' | 'validated', p: SpecCount | null): string {
	if (badge === 'validated') return 'Every element of the specification is validated';
	if (!p || p.total === 0) return 'Draft: the specification waits for its validation';
	if (p.validated >= p.total) return 'Draft: every element is validated, it waits for the definitive validation';
	return `Draft: ${p.validated} of ${p.total} elements validated`;
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/**
 * The version line at the band's right, which opens the Reverse page (criterion 2dbed801):
 * "v1.1 · code checked 29 Oct" once validated, and the count of elements
 * changed by hand since the last Reverse-Specification when there are some.
 */
export function versionLine(standing: SpecStanding | null, now: Date = new Date()): { text: string; title: string; byHand: string | null } {
	const checked = standing?.checkedAt ?? null;
	const text = standing?.version
		? `${standing.version} · ${checked ? `code checked ${relativeWhen(checked, now)}` : 'no code checked yet'}`
		: 'Reverse-Specifications';
	const title = checked ? `Reverse-Specification · code checked on ${DAY.format(new Date(checked))}` : 'The Reverse-Specifications of the product';
	const n = standing?.changedByHand ?? 0;
	return { text, title, byHand: n > 0 ? `${n} changed by hand since` : null };
}
