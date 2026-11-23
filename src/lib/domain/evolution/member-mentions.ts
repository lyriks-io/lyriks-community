/**
 * Naming a member of the project with @ in a comment (criterion b5833eb5 of
 * feat-lyriks-copy-a52881-29): the text stays prose, `@Ada Lovelace` or
 * `@Ada`, and the members it names are told they were mentioned. One reading
 * serves the notification, the page that marks the name, and the list that
 * offers the members while the person types.
 */

/** A member of the project as a comment can name them. */
export interface NameableMember {
	readonly id: string;
	readonly name: string;
}

/** A name read in a text: where it stands and the members it names. */
export interface MemberMention {
	readonly start: number;
	readonly end: number;
	readonly memberIds: readonly string[];
}

/** How many members the list under a comment box shows at most after @ (rule 25aeb107). */
export const MEMBERS_LISTED_AFTER_AT = 6;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `@name` at the start of the text or after a space, and not run on into a longer word. */
const namePattern = (name: string) => new RegExp(`(^|\\s)(@${escape(name)})(?![\\p{L}\\p{N}])`, 'giu');
const fullNameOf = (member: NameableMember) => member.name.trim().replace(/\s+/g, ' ');
const firstNameOf = (member: NameableMember) => fullNameOf(member).split(' ')[0] ?? '';

function occurrences(text: string, name: string): { start: number; end: number }[] {
	const found: { start: number; end: number }[] = [];
	for (const match of text.matchAll(namePattern(name))) {
		const start = (match.index ?? 0) + match[1].length;
		found.push({ start, end: start + match[2].length });
	}
	return found;
}

/**
 * Every name a text gives with @, in reading order. A full name wins over a
 * first name: `@Ada Lovelace` names her alone, never every Ada of the team;
 * `@Ada` names each member called Ada. The writer is never named by their own
 * message.
 */
export function memberMentionsIn(text: string, members: readonly NameableMember[], writer?: string): MemberMention[] {
	const named = members.filter((m) => m.id !== writer && fullNameOf(m) !== '');
	const taken: MemberMention[] = [];
	const overlaps = (start: number, end: number) => taken.some((t) => start < t.end && end > t.start);
	const add = (start: number, end: number, memberId: string) => {
		const same = taken.find((t) => t.start === start && t.end === end);
		if (same) {
			if (!same.memberIds.includes(memberId)) taken[taken.indexOf(same)] = { ...same, memberIds: [...same.memberIds, memberId] };
			return;
		}
		if (!overlaps(start, end)) taken.push({ start, end, memberIds: [memberId] });
	};
	// The longest names first, so a full name holds its place before a first name could.
	const fulls = [...named].sort((a, b) => fullNameOf(b).length - fullNameOf(a).length);
	for (const member of fulls) for (const o of occurrences(text, fullNameOf(member))) add(o.start, o.end, member.id);
	for (const member of named) {
		const first = firstNameOf(member);
		if (first === fullNameOf(member)) continue;
		for (const o of occurrences(text, first)) add(o.start, o.end, member.id);
	}
	return taken.sort((a, b) => a.start - b.start);
}

/** The members a text names, each once (rule 5f1ea7b0: each is told they were mentioned). */
export function membersNamedIn(text: string, members: readonly NameableMember[], writer?: string): string[] {
	return [...new Set(memberMentionsIn(text, members, writer).flatMap((m) => m.memberIds))];
}

/**
 * The name being typed after an `@`, read up to the caret: null when the caret
 * is not in one. An `@` inside a word (an e-mail address) opens nothing, nor
 * does an `@` followed by a space.
 */
export function memberQueryAt(text: string, caret: number): { readonly start: number; readonly query: string } | null {
	const before = text.slice(0, caret);
	const at = before.lastIndexOf('@');
	if (at < 0) return null;
	if (at > 0 && /\S/.test(before[at - 1])) return null;
	const query = before.slice(at + 1);
	if (/\s/.test(query) || query.length > 40) return null;
	return { start: at, query };
}

const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The members the list offers for what was typed after @ (action 60847e98):
 * those with a word of their name, or their email, starting with it, the
 * writer aside, by name, six at most. Nobody where the writer works alone.
 */
export function membersToName<M extends NameableMember>(members: readonly M[], query: string, writer: string): M[] {
	const q = folded(query.trim());
	return members
		.filter((m) => m.id !== writer && fullNameOf(m) !== '')
		.filter((m) => q === '' || folded(fullNameOf(m)).split(' ').some((word) => word.startsWith(q)) || folded(m.id).startsWith(q))
		.sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)))
		.slice(0, MEMBERS_LISTED_AFTER_AT);
}

/** Replace the name being typed (from `start` to the caret) by `@` and the member's name, a space after it. */
export function insertMemberName(text: string, start: number, caret: number, member: NameableMember): { readonly text: string; readonly caret: number } {
	const token = `@${fullNameOf(member)}${/^\s/.test(text.slice(caret)) ? '' : ' '}`;
	return { text: `${text.slice(0, start)}${token}${text.slice(caret)}`, caret: start + token.length };
}
