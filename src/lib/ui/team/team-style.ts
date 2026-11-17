/**
 * Presentation for collaborator identity: the light-theme color map behind
 * avatar colors, plus initials. Kept out of the domain (which stays color-free)
 * — used by the assignee chips on the Features board.
 */
import type { CollaboratorColor } from '$domain/team';
export { disciplineLabel, shortName } from '$domain/team';

export interface ColorTokens {
	/** Avatar fill (white text on top). */
	solid: string;
	/** Soft tint for role/expertise chips. */
	tint: string;
	/** Readable text/icon color on the tint. */
	text: string;
}

export const COLOR_MAP: Record<CollaboratorColor, ColorTokens> = {
	violet: { solid: '#bb46f5', tint: 'rgba(187,70,245,0.12)', text: '#8a1fc4' },
	blue: { solid: '#0066ff', tint: 'rgba(0,102,255,0.10)', text: '#0047b3' },
	pink: { solid: '#fa5fb2', tint: 'rgba(250,95,178,0.12)', text: '#b3237a' },
	amber: { solid: '#ffa101', tint: 'rgba(255,161,1,0.14)', text: '#8a5500' },
	mint: { solid: '#1fa98a', tint: 'rgba(31,169,138,0.12)', text: '#0f6650' },
	slate: { solid: '#55555c', tint: 'rgba(85,85,92,0.12)', text: '#3a3a40' }
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
