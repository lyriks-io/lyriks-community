/**
 * Presentation for collaborator identity: the light-theme color map behind
 * avatar colors, plus initials. Kept out of the domain (which stays color-free)
 * — used by the assignee chips on the Features board.
 */
import type { Collaborator, CollaboratorColor } from '$domain/team/team';

export interface ColorTokens {
	/** Avatar fill (white text on top). */
	solid: string;
	/** Soft tint for role/expertise chips. */
	tint: string;
	/** Readable text/icon color on the tint. */
	text: string;
}

export const COLOR_MAP: Record<CollaboratorColor, ColorTokens> = {
	violet: { solid: '#7c3aed', tint: 'rgba(124,58,237,0.10)', text: '#6d28d9' },
	blue: { solid: '#2563eb', tint: 'rgba(37,99,235,0.10)', text: '#1d4ed8' },
	pink: { solid: '#db2777', tint: 'rgba(219,39,119,0.10)', text: '#be185d' },
	amber: { solid: '#d97706', tint: 'rgba(217,119,6,0.12)', text: '#b45309' },
	mint: { solid: '#0d9488', tint: 'rgba(13,148,136,0.10)', text: '#0f766e' },
	slate: { solid: '#64748b', tint: 'rgba(100,116,139,0.12)', text: '#475569' }
};

export function colorTokens(color: CollaboratorColor): ColorTokens {
	return COLOR_MAP[color] ?? COLOR_MAP.violet;
}

/** Up to two initials from a name (or email local-part / raw id fallback). */
export function initials(seed: string): string {
	const base = seed.includes('@') ? seed.split('@')[0] : seed;
	const parts = base.trim().split(/[\s._-]+/).filter(Boolean);
	const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2) || '?';
	return letters.toUpperCase();
}

/** "Paul Marchand" → "Paul M." — first name + last-name initial (the compact
 *  contributor label used across pickers and rosters). Falls back to the email
 *  local-part when there is no name. */
export function shortName(collaborator: Pick<Collaborator, 'name' | 'email'>): string {
	const raw = collaborator.name?.trim() || collaborator.email?.split('@')[0] || 'Unknown';
	const parts = raw.split(/\s+/).filter(Boolean);
	if (parts.length < 2) return parts[0] ?? raw;
	return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** The contributor's discipline, derived from expertise + seniority: PM / PO /
 *  UX / Dev / Tech Lead / Data Eng. One source of truth for every people list. */
export function disciplineLabel(c: Pick<Collaborator, 'expertise' | 'seniority'>): string {
	const ex = c.expertise ?? [];
	if (ex.includes('data')) return 'Data Eng';
	if (ex.includes('eng-management')) return 'Tech Lead';
	if (ex.includes('engineering')) return c.seniority === 'manager' ? 'Tech Lead' : 'Dev';
	if (ex.includes('design')) return 'UX';
	if (ex.includes('product')) return c.seniority === 'manager' ? 'PM' : 'PO';
	return 'Member';
}
