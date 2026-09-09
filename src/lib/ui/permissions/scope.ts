/**
 * Smart-split heuristics for the Permissions matrix (spec feature 657823a2 +
 * the mockup's Step3 view). Capabilities are auto-classified end-user / admin /
 * both; roles are bucketed into the two user classes by their tone. Nothing
 * here is persisted — it is a pure presentational classification recomputed on
 * every render, exactly like the spec's keyword heuristic.
 */

export type CapScope = 'end-user' | 'admin' | 'both';
export type RoleClass = 'end-user' | 'admin';

const ADMIN_KEYWORDS = [
	'admin',
	'audit',
	'invite',
	'revoke',
	'permission',
	'delete account',
	'manage',
	'configure',
	'workspace',
	'billing',
	'role',
	'governance',
	'pipeline',
	'integration',
	'deploy',
	'release',
	'moderate',
	'approve',
	'settings',
	'console',
	'back-office',
	'internal'
];

const ENDUSER_KEYWORDS = [
	'customer portal',
	'portal',
	'self-serve',
	'self serve',
	'sign up',
	'signup',
	'sign-in',
	'login',
	'profile',
	'browse',
	'cart',
	'checkout',
	'order history',
	'order tracking',
	'wishlist',
	'review',
	'rate',
	'preferences',
	'public'
];

/** Classify a capability row. System rows are always admin scope. */
export function inferCapScope(
	source: 'system' | 'feature' | 'journey' | 'surface' | 'off_structure',
	label: string,
	parentLabel = ''
): CapScope {
	if (source === 'system') return 'admin';
	const hay = `${label} ${parentLabel}`.toLowerCase();
	const isEnd = ENDUSER_KEYWORDS.some((k) => hay.includes(k));
	const isAdm = ADMIN_KEYWORDS.some((k) => hay.includes(k));
	if (isEnd && !isAdm) return 'end-user';
	if (isAdm && !isEnd) return 'admin';
	return 'both';
}

/**
 * Map a role tone to one of the two stacked user classes. Mirrors the Users
 * capability's `RoleClassPanels` projection: admin / ops / partner are
 * inside-out (back-office → admin); customer / visitor are outside-in.
 */
export function roleClass(tone: string): RoleClass {
	return tone === 'admin' || tone === 'ops' || tone === 'partner' ? 'admin' : 'end-user';
}
