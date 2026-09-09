import { error, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { licenseBoundEmail } from '$domain/licensing';

/** Parse the comma-separated LYRIKS_ADMIN_EMAILS allowlist (case-insensitive). */
function adminEmails(): string[] {
	return (env.LYRIKS_ADMIN_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter((e) => e.length > 0);
}

/**
 * Gate for app-wide (not project-scoped) mutations — e.g. the global AI settings.
 *
 *  - Auth OFF (standalone appliance / dev): single trusted user — allowed.
 *  - Auth ON: the caller's email must be in LYRIKS_ADMIN_EMAILS. Fail-closed: if
 *    that var is unset the mutation is refused with an actionable message, so a
 *    multi-user install can't leave global config writable by every user by
 *    default.
 */
export function requireAdmin(event: Pick<RequestEvent, 'locals'>): void {
	if (isAdmin(event)) return;

	const allow = adminEmails();
	if (allow.length === 0) {
		error(403, 'admin action disabled — set LYRIKS_ADMIN_EMAILS to enable');
	}
	error(403, 'forbidden — requires an admin account');
}

/** Non-throwing variant for optional admin UI. */
export function isAdmin(event: Pick<RequestEvent, 'locals'>): boolean {
	if (!event.locals.authRequired) return true;
	const email = event.locals.session?.email?.toLowerCase();
	if (!email) return false;
	if (adminEmails().includes(email)) return true;
	// The licence holder administers the appliance they claimed. Installs no
	// longer take an operator email, so LYRIKS_ADMIN_EMAILS keeps whatever the
	// kit templated (a placeholder), and the person who proved the key was
	// issued to them could not even replace that key: every licence action is
	// admin-gated (caught on the crash-test VM, 2026-08). The binding is signed, so this
	// grants nothing an attacker can assert, and the allowlist still adds
	// administrators beyond the holder.
	const entitlements = event.locals.license?.entitlements;
	return entitlements ? licenseBoundEmail(entitlements) === email : false;
}
