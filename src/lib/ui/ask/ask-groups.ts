/**
 * The list of the Ask my AI page, grouped (criterion 2ed3cfa4): Needs you
 * first, the conversations where the AI asks the reader something, then by
 * when each last moved in the reader's own time zone: Today, Yesterday,
 * Previous 7 days, then one group per month. Empty groups are left out; each
 * group keeps the order it is given (latest first).
 */
export interface ConversationGroup<T> {
	readonly label: string;
	readonly items: T[];
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function groupConversations<T extends { readonly updatedAt: string; readonly turn: string }>(conversations: readonly T[], now: Date): ConversationGroup<T>[] {
	const today = startOfDay(now);
	const groups = new Map<string, T[]>();
	const add = (label: string, item: T) => groups.set(label, [...(groups.get(label) ?? []), item]);
	for (const c of conversations) {
		if (c.turn === 'asked_back') {
			add('Needs you', c);
			continue;
		}
		const at = new Date(c.updatedAt);
		const day = startOfDay(at);
		if (day >= today) add('Today', c);
		else if (day >= today - DAY) add('Yesterday', c);
		else if (day >= today - 7 * DAY) add('Previous 7 days', c);
		else add(at.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), c);
	}
	// Needs you, Today, Yesterday and Previous 7 days are met in that order of priority; months come latest first.
	const fixed = ['Needs you', 'Today', 'Yesterday', 'Previous 7 days'];
	const ordered = [...fixed.filter((l) => groups.has(l)), ...[...groups.keys()].filter((l) => !fixed.includes(l))];
	return ordered.map((label) => ({ label, items: groups.get(label)! }));
}
