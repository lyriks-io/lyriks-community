/**
 * Every project's name opens on a capital (criterion 5a72e9ef of
 * feat-project-lifecycle, which replaced 69aa0fef): its first letter is a
 * capital, always (notepad reads Notepad, ebay reads Ebay), and every other
 * letter reads exactly as typed (NOTEPAD ubdubhdeubheube, BrightDesk, Signal
 * for iOS). Applied wherever a name enters and wherever one is read, so a
 * project named before the rule reads in it too. Pure.
 */
export function styledProjectName(name: string): string {
	const trimmed = name.trim().replace(/\s+/g, ' ');
	return trimmed.replace(/^(\P{L}*)(\p{Ll})/u, (_, lead: string, first: string) => lead + first.toUpperCase());
}

/** What a rename's answer says when the one style changed the name sent (criterion 60d1fbca of feat-project-lifecycle). */
export interface ProjectNameStyled {
	readonly sent: string;
	readonly kept: string;
	readonly reason: string;
}

const STYLE_REASON = 'Every project name opens on a capital; every other letter reads as typed.';

/** The note a rename answers with when the name kept is not the name sent, or null when it was taken as typed. */
export function projectNameStyled(sent: string, kept: string): ProjectNameStyled | null {
	const typed = sent.trim();
	if (!typed || typed === kept) return null;
	return { sent: typed, kept, reason: STYLE_REASON };
}
