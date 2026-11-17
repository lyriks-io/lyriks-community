/**
 * Where a discussion is held: an anchor names one element of the specification
 * the Specification 360° shows, by the element's own spec id, so a thread stays
 * on its element when the element is renamed or moved. An anchor reads
 * `kind` or `kind:ref` (`feature:feat-cf-forms`, `rule:feat-cf-forms:r-12`).
 *
 * The page an anchor lives on is derived from the anchor alone, which is what
 * lets a notification link straight to the thread without reading the spec.
 */

export const ANCHOR_KINDS = [
	'product',
	'problem',
	'target',
	'core',
	'feature',
	'action',
	'rule',
	'flow',
	'role',
	'permissions',
	'branding',
	'journey',
	'component',
	'datamap',
	'data',
	/** A table of the data map, edited in its sheet (criterion 41514698); the map is validated as one block. */
	'entity',
	'stack',
	'health',
	'requirements',
	'constraint',
	'term',
	/** An issue the retrospecification raised, discussed on its sheet (criterion e0f69b3c). */
	'finding',
	/**
	 * A frame of the Overview discussed as a whole (overview:why, overview:what, overview:who, overview:noticed),
	 * never one of the items it lists (criterion 416e4885).
	 */
	'overview'
] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

/** Anchors are short: an element id, never a sentence. */
export const MAX_ANCHOR_LENGTH = 300;

/** Build an anchor from its kind and the ids that locate the element. */
export function anchorOf(kind: AnchorKind, ...refs: string[]): string {
	const parts = refs.map((r) => r.trim()).filter(Boolean);
	return parts.length ? `${kind}:${parts.join(':')}` : kind;
}

/** The kind of an anchor, or null when it names none this page knows. */
export function anchorKind(anchor: string): AnchorKind | null {
	const kind = anchor.split(':', 1)[0];
	return (ANCHOR_KINDS as readonly string[]).includes(kind) ? (kind as AnchorKind) : null;
}

/** The ids after the kind, in order. */
function refsOf(anchor: string): string[] {
	return anchor.split(':').slice(1);
}

/** A well-formed anchor: a known kind, no blank, no whitespace, bounded. */
export function isAnchor(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ANCHOR_LENGTH) return false;
	if (/\s/.test(value)) return false;
	return anchorKind(value) !== null && refsOf(value).every((r) => r.length > 0);
}

/**
 * The Specification 360° page an anchor lives on, as a path under `/spec`
 * ('' is the Overview). A feature, its list of actions, each action and the
 * rules it obeys all read on the feature's own page (criterion 7d1e80b6). A core feature is discussed on its own
 * page, never on the Overview, whose frames are discussed as wholes there.
 */
export function placeOfAnchor(anchor: string): string {
	const kind = anchorKind(anchor);
	const [first] = refsOf(anchor);
	switch (kind) {
		case 'rule':
			// A rule of the whole product (rule:project:<id>) heads the Features page itself (ac-rules-product-card).
			if (first === 'project') return 'features';
			return first ? `features/${encodeURIComponent(first)}` : 'features';
		case 'action':
		case 'core':
		case 'feature':
		case 'flow':
			return first ? `features/${encodeURIComponent(first)}` : 'features';
		case 'role':
		case 'permissions':
			// A user is read, edited and discussed on its own page, and so is an action discussed for one user
			// (permissions:<user>:<capability>, criteria 4146848b and ddd20a3e); who can do what as a whole on the list.
			return first ? `users/${encodeURIComponent(first)}` : 'users';
		case 'branding':
		case 'journey':
		case 'component':
			return 'experience';
		case 'datamap':
		case 'data':
			return 'tech/data-map';
		case 'stack':
			return 'tech/architecture';
		case 'health':
			return 'tech/operations';
		case 'requirements':
		case 'constraint':
			return 'tech/requirements';
		case 'term':
			return 'glossary';
		default:
			return '';
	}
}

/** An element the Features pages show: a core feature, a feature, its actions, their rules, its journey. */
export function onFeaturesPages(anchor: string): boolean {
	const kind = anchorKind(anchor);
	return kind === 'core' || kind === 'feature' || kind === 'action' || kind === 'rule' || kind === 'flow';
}

/** The DOM id of an anchored block: what a link scrolls to. */
export function anchorDomId(anchor: string): string {
	return `kbt-${anchor.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * The link that opens a thread where it is held, naming the message it is about when there is one (Lyriks's
 * answer, a reply notified): the page lands on that message (criterion 0bdc1d4f). It carries no fragment: the
 * thread's comments bring it into view themselves, and the router replays a fragment once the page is drawn,
 * which would stop that scroll halfway at the block's head.
 */
export function discussionHref(projectId: string, anchor: string, threadId: string, messageId?: string): string {
	const place = placeOfAnchor(anchor);
	const path = `/projects/${encodeURIComponent(projectId)}/spec${place ? `/${place}` : ''}`;
	const message = messageId ? `&message=${encodeURIComponent(messageId)}` : '';
	return `${path}?discussion=${encodeURIComponent(threadId)}${message}`;
}
