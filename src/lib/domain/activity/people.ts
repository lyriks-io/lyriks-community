import { memberInitials, memberNameFromEmail } from '$domain/team';
import type { ActivityActor } from './activity';
import type { ActivityMember } from './evolution-activity';

/**
 * How the activity names and marks the people in it: "Carmen R.", a round
 * badge with their initials in a colour of their own, the same colour every
 * time they appear.
 */
const PALETTE = ['#1F5F8B', '#8A5100', '#146C4B', '#5B2FC9', '#A21C6B', '#0F766E', '#B42318', '#4A505C'];

/** "Carmen Roux" reads "Carmen R."; a single name stays whole. */
export function shortName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length < 2) return parts[0] ?? '';
	return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export function personColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return PALETTE[h % PALETTE.length];
}

export interface PersonLook {
	readonly name: string;
	readonly initials: string;
	readonly color: string;
}

/** The name and badge of a person of the activity, from the roster, else from their id. */
export function personLook(id: string, roster: readonly ActivityMember[], fallbackName?: string): PersonLook {
	const full = roster.find((m) => m.id.toLowerCase() === id.toLowerCase())?.name || fallbackName || (id.includes('@') ? memberNameFromEmail(id) : id);
	return { name: shortName(full), initials: memberInitials(full), color: personColor(id) };
}

/**
 * Who did it, as the activity says it: a person's short name (from the roster,
 * else the name their act recorded), or Lyriks: what a person's AI did
 * through Lyriks reads as Lyriks's work, "Lyriks for Carmen R." when it was
 * someone else's (criterion ccaa0784).
 */
export function actorName(actor: ActivityActor, me: string, roster: readonly ActivityMember[], myName?: string, recordedName?: string): string {
	if (actor.kind === 'lyriks') return 'Lyriks';
	if (actor.kind === 'ai') return actor.id === me ? 'Lyriks' : `Lyriks for ${personLook(actor.id, roster).name}`;
	return personLook(actor.id, roster, actor.id === me ? myName : recordedName).name;
}
