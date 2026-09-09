/**
 * Pure derivation of a member's display name and initials. Framework-free so
 * both the shell (client) and the active-member resolver (application) share one
 * rule. The real name comes from the back / operator profile; this email-based
 * form is only the last-resort fallback when no name is on record.
 */

/** "jane.doe@…" → "Jane Doe"; "Developer" when there's no email. */
export function memberNameFromEmail(email?: string | null): string {
	if (!email) return 'Developer';
	const local = email.split('@')[0];
	return (
		local
			.split(/[._-]+/)
			.filter(Boolean)
			.map((w) => w[0].toUpperCase() + w.slice(1))
			.join(' ') || email
	);
}

/**
 * Display name a licence's `customer` field seeds. Keys are minted against
 * either an organisation name ("Acme Corp") or an account email (Community
 * signups on lyriks.io), so an email-shaped customer goes through the same
 * derivation as a session email; anything else is already a name.
 */
export function displayNameFromLicenseCustomer(customer: string): string {
	const trimmed = customer.trim();
	if (!trimmed) return '';
	return trimmed.includes('@') ? memberNameFromEmail(trimmed) : trimmed;
}

/** Two-letter initials for a display name (avatar fallback). */
export function memberInitials(name: string): string {
	const words = name.split(/\s+/).filter(Boolean);
	if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
	return (words[0] ?? 'U').slice(0, 2).toUpperCase();
}
