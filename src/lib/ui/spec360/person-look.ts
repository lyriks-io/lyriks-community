/**
 * How a person looks in a discussion: initials on a solid colour that stays
 * the same for them everywhere, picked from the design's palette by their
 * identity rather than stored.
 */
const PALETTE = ['#0047b3', '#8a5500', '#0f6650', '#8a1fc4', '#b3237a', '#b3202c'] as const;

export function avatarColor(identity: string): string {
	let hash = 0;
	for (const ch of identity.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return PALETTE[Math.abs(hash) % PALETTE.length];
}
