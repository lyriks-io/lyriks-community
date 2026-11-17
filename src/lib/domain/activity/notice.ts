/**
 * What a notification says (criterion 65fdff0a of feat-feedback-docs), in the
 * brief's feed order: the section it belongs to and its level, the state it
 * tells in one sentence, two or three sentences in the order fact,
 * consequence, person, its picture, then the way to act on it. The toast says
 * the same sentence and one short line (criterion 31f7e46d). An event without a
 * notice reads its actor's line and its text as before.
 */
export interface NoticeRun {
	readonly text: string;
	/** A figure or a person's name, set in bold. */
	readonly strong?: boolean;
}

export interface NoticeAction {
	readonly label: string;
	/** An arrow goes somewhere; relaunch starts again what stopped. */
	readonly icon: 'go' | 'relaunch';
}

/**
 * How urgent it is (criterion e190404f): a fact to know, a decision awaited,
 * something drifting or blocked, an immediate risk, an audit in order, a piece
 * of the specification absent from the code, a final step crossed.
 */
export type NoticeLevel = 'info' | 'action' | 'drift' | 'critical' | 'match' | 'missing' | 'certified';

/** Where in the product it happened, read in small capitals after the project's name. */
export type NoticeSection = 'Reverse-Specification' | 'Specification' | 'Discussion' | 'Evolution' | 'Implementation' | 'Team' | 'Code watch';

/** A person a picture shows: the id the roster knows them by, when there is one, and the name the source recorded. */
export interface NoticePerson {
	readonly id?: string;
	readonly name: string;
}

/**
 * The picture between the text and the actions, the same kind always drawn the
 * same way, generic over how a person is told so the bell can resolve them to
 * initials and colours for its reader.
 */
export type NoticeVisual<P = NoticePerson> =
	/** The steps of a process, the one under way lit. */
	| { readonly kind: 'steps'; readonly steps: readonly { readonly label: string; readonly sub: string; readonly state: 'done' | 'now' | 'todo' }[] }
	/** Names found (the strong ones first), a count of the others, then the key figures. */
	| {
			readonly kind: 'chips';
			readonly chips: readonly { readonly label: string; readonly strong?: boolean }[];
			readonly more: number;
			readonly figures: readonly { readonly n: string; readonly label: string }[];
	  }
	/** A share reached and where it stopped. */
	| { readonly kind: 'gauge'; readonly pct: number; readonly status: string; readonly kept: string }
	/** A decision stamped, what it covers and the people behind it. */
	| { readonly kind: 'stamp'; readonly word: string; readonly line: string; readonly people: readonly P[] }
	/** People and where each stands, then the words of a decision. */
	| { readonly kind: 'people'; readonly rows: readonly { readonly person: P; readonly sub: string; readonly badge: string }[]; readonly quote?: string }
	/** Messages of a conversation, in order. */
	| { readonly kind: 'thread'; readonly title: string; readonly messages: readonly { readonly person: P; readonly text: string }[] }
	/** The sheet of an object: its name, its standing, its fields. */
	| {
			readonly kind: 'sheet';
			readonly kicker: string;
			readonly title: string;
			readonly badge: string;
			readonly fields: readonly { readonly label: string; readonly value: string }[];
			readonly note?: string;
	  }
	/** States in the order they came, a past one struck through. */
	| { readonly kind: 'chain'; readonly nodes: readonly { readonly kicker: string; readonly title: string; readonly state: 'past' | 'struck' | 'now' | 'next' }[] }
	/** Findings counted by how much they weigh. */
	| { readonly kind: 'severity'; readonly rows: readonly { readonly n: number; readonly label: string; readonly tone: 'block' | 'major' | 'minor' }[] }
	/** The members of a team, the new ones set apart. */
	| { readonly kind: 'members'; readonly people: readonly (P & { readonly isNew?: boolean })[]; readonly label: string }
	/** A count per day, oldest first, and what it says. */
	| { readonly kind: 'histogram'; readonly label: string; readonly status: string; readonly days: readonly number[] }
	/** What the specification says beside what the code does now, one row per change; `code` is empty for a change gone from the code. */
	| {
			readonly kind: 'speccode';
			readonly rows: readonly { readonly spec: string; readonly code: string; readonly where: string; readonly gone: boolean }[];
			readonly more: number;
	  };

export interface ActivityNotice {
	readonly section: NoticeSection;
	readonly level: NoticeLevel;
	/** The state, in one sentence: never a person's name, never the project's. */
	readonly title: string;
	/** Fact, consequence, then the person; figures and names in bold. */
	readonly body: readonly NoticeRun[];
	/** The toast's one line, at most 80 characters, naming the element concerned. */
	readonly line: string;
	readonly action?: NoticeAction;
	readonly visual?: NoticeVisual;
	/** The share already read, 0 to 100, while the work it tells of still runs. */
	readonly progress?: number;
}

export const plain = (text: string): NoticeRun => ({ text });
export const strong = (text: string): NoticeRun => ({ text, strong: true });

/** Only these two stand out in a list (criterion e190404f). */
export const standsOut = (level: NoticeLevel): boolean => level === 'drift' || level === 'critical';

/** Information is put aside with Got it; anything left to do, with Later (criterion e190404f). */
export const dismissalOf = (level: NoticeLevel): 'Got it' | 'Later' =>
	level === 'info' || level === 'match' || level === 'certified' ? 'Got it' : 'Later';

/** The toast's line holds in 80 characters (criterion 31f7e46d): a longer one is cut on a word. */
export const LINE_MAX = 80;
export function shortLine(text: string): string {
	const t = text.trim();
	if (t.length <= LINE_MAX) return t;
	const cut = t.slice(0, LINE_MAX - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** A small count reads in words ("five of them at the core"), a larger one in figures. */
export const inWords = (n: number): string => WORDS[n] ?? String(n);
export const counted = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
/** “Guest access”, or the words given when the name is empty. */
export const quoted = (name: string, empty = 'an item'): string => (name.trim() ? `“${name.trim()}”` : empty);

const DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Oct 28": a date the reader places without a year. */
export const shortDate = (iso: string): string => (Number.isNaN(Date.parse(iso)) ? '' : DAY.format(new Date(iso)));

/** The same picture with each person it shows told another way: how the bell resolves them for its reader. */
export function resolvePeople<P, Q>(visual: NoticeVisual<P>, as: (p: P) => Q): NoticeVisual<Q> {
	switch (visual.kind) {
		case 'stamp':
			return { ...visual, people: visual.people.map(as) };
		case 'people':
			return { ...visual, rows: visual.rows.map((r) => ({ ...r, person: as(r.person) })) };
		case 'thread':
			return { ...visual, messages: visual.messages.map((m) => ({ ...m, person: as(m.person) })) };
		case 'members':
			return { ...visual, people: visual.people.map((p) => ({ ...as(p), ...(p.isNew ? { isNew: true } : {}) })) };
		default:
			return visual;
	}
}

/** A message as a picture quotes it: its words without the marks of its formatting, on one line, cut on a word past `max`. */
export function quotedWords(text: string, max = 200): string {
	const t = text
		.replace(/\*\*|__|`/g, '')
		.replace(/^#+\s*/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
	return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}
