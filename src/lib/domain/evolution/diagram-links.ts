import { mentionToken } from './mentions';

/**
 * An element of a diagram linked to what the product already has
 * (ac-evo-func-uml-link, ac-evo-tech-uml-link): a use case or a component to
 * a feature, a step of a flow to an action, a store to a table of the Data
 * model. The link is written as a citation at the end of the element's line,
 * the same token a text of the step cites with, so the notation stays one line
 * per element and an AI client writes it without the page.
 *
 * An action is cited with the feature that holds it (`action:<featureId>/<actionId>`),
 * so what the change uses is known from the notation alone (ac-evo-imp-used).
 */
export type DiagramLinkKind = 'feature' | 'action' | 'entity';
export interface DiagramLink {
	/** What the element links to, as the product names it. */
	readonly name: string;
	readonly ref: string;
}

const TRAILING = /\s*@\[([^\]\n]+)\]\(((?:feature|action|entity):[^)\s]+)\)\s*$/;

/** The line without the link it ends on, and that link. */
export function trailingLink(line: string): { rest: string; link: DiagramLink | null } {
	const match = line.match(TRAILING);
	if (!match || match.index === undefined) return { rest: line, link: null };
	return { rest: line.slice(0, match.index), link: { name: match[1].trim(), ref: match[2] } };
}

/** The citation written at the end of a linked element's line, with its leading space. */
export const linkSuffix = (link: DiagramLink | undefined): string => (link ? ` ${mentionToken(link.name, link.ref)}` : '');

export const linkKindOf = (ref: string): DiagramLinkKind | null => {
	const kind = ref.slice(0, ref.indexOf(':'));
	return kind === 'feature' || kind === 'action' || kind === 'entity' ? kind : null;
};

export const featureRef = (featureId: string): string => `feature:${featureId}`;
export const actionRef = (featureId: string, actionId: string): string => `action:${featureId}/${actionId}`;
export const entityRef = (entityId: string): string => `entity:${entityId}`;

/** The feature a link stands on: itself, or the one that holds the action; a table stands on none. */
export function featureOfLink(ref: string): string | null {
	const kind = linkKindOf(ref);
	const id = ref.slice(ref.indexOf(':') + 1);
	if (kind === 'feature') return id || null;
	if (kind === 'action') return id.includes('/') ? id.slice(0, id.indexOf('/')) || null : null;
	return null;
}

/** An element with the given link, or without any when `link` is null. */
export function withLink<T extends { readonly link?: DiagramLink }>(element: T, link: DiagramLink | null): T {
	if (link) return { ...element, link };
	const copy = { ...element };
	delete (copy as { link?: DiagramLink }).link;
	return copy;
}
