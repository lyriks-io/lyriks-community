import type { ProjectTabs } from '$domain/portfolio/project-tabs';
import type { NoticeLevel, NoticeVisual } from '$domain/activity';

/**
 * What the app bar shows beyond the session (served by /api/chrome): the
 * reader's notifications, their first steps, the current project's tabs, the
 * tick of a published retrospecification and a process running now.
 */
/** `lyriks`: work done through Lyriks, by the reader's AI or by Lyriks itself, shown under the Lyriks mark. */
/** Who or what the card opens on: a person's initials, the Lyriks mark, or a warning sign for an interruption. */
export type BellKind = 'mention' | 'reply' | 'lyriks' | 'info' | 'alert';

/** A stretch of a notification's text; a figure or a person's name is set in bold. */
export interface BellRun {
	readonly text: string;
	readonly strong?: boolean;
}

/** A person a notification's picture shows, resolved for its reader: their initials and colour, "You" for the reader. */
export interface BellPerson {
	readonly name: string;
	readonly initials: string;
	readonly color: string;
	readonly you: boolean;
	readonly isNew?: boolean;
}

/**
 * One notification as the bell shows it, already worded, in the brief's feed
 * order (criterion 65fdff0a of feat-feedback-docs): the project, its section
 * and when, its level, what happened, what it found or who did it, its
 * picture, the way to act on it. The toast reads its mark, the same sentence
 * and its line (criterion 31f7e46d).
 */
export interface BellNotification {
	readonly id: string;
	readonly kind: BellKind;
	/** "Taskora · Evolution", read first with how long ago. */
	readonly where: string;
	readonly at: string;
	/** How urgent it is (criterion e190404f). */
	readonly level: NoticeLevel;
	/** What happened, in one sentence: "The specification is ready to review.", "Carmen R. mentioned you". */
	readonly title: string;
	/** What it found or who did it; empty when there is nothing more to say. */
	readonly body: readonly BellRun[];
	/** The toast's one line, at most 80 characters. */
	readonly line: string;
	/** The picture between the text and the actions. */
	readonly visual?: NoticeVisual<BellPerson>;
	/** The way to act on it at the card's foot; the whole card opens `href` either way. */
	readonly action?: { readonly label: string; readonly icon: 'go' | 'relaunch' };
	/** The share already read, 0 to 100, while the work it tells of still runs. */
	readonly progress?: number;
	/** What dismissing an unread one says: Later when something is left to do (criterion e190404f). */
	readonly dismiss: 'Got it' | 'Later';
	readonly unread: boolean;
	readonly initials: string;
	readonly color: string;
	readonly href: string;
}

/** A process running on the current project, as the app bar names it. */
export interface LiveProcess {
	readonly label: string;
	readonly href: string;
	readonly title?: string;
	/** A process carried by the person's LLM: when it last called the project, and what the bar says once it went silent (criterion 7a4a99e4). */
	readonly llm?: { readonly seenAt: string | null; readonly pausedLabel: string };
}

export interface AppChrome {
	readonly notifications: BellNotification[];
	/** The first steps the reader's installation already shows done (the project step aside). */
	readonly progress: {
		readonly retroDone: boolean;
		readonly specVisited: boolean;
		readonly evolutionStarted: boolean;
		readonly evolutionVerified: boolean;
	};
	readonly retroDone: boolean;
	/** The tabs the current project has opened so far; null without a current project. */
	readonly tabs: ProjectTabs | null;
	/** What runs now on the current project, at the right of the tabs: a retrospecification, the reader's AI in session on an evolution. */
	readonly live: readonly LiveProcess[];
	/** The current project's evolutions, for the search box: "EVO-042 · Multi-currency invoicing". */
	readonly evolutions: readonly { readonly t: string; readonly href: string }[];
	/** How many of the current project's evolutions are still under way: the count beside Changes (criterion b2f17eef). */
	readonly openEvolutions: number;
	/** The code changes found outside Lyriks that wait for a decision, once the current project's spec is validated; null before. */
	readonly drift: { readonly pending: number } | null;
	/** Where the current project's specification stands, for the version line of Knowledge's band; null without a current project. */
	readonly spec: SpecStanding | null;
	/**
	 * The tabs of Knowledge whose elements are all validated, while the specification is a draft (navChecks,
	 * criterion 8e942b12); null once it is validated or without a current project.
	 */
	readonly specChecks: readonly string[] | null;
}

/** The version line of Knowledge's band (criterion 8e942b12). */
export interface SpecStanding {
	/** The version the team validated ("v1.1"); null before a first validation. */
	readonly version: string | null;
	/** When the code was last checked against the spec; null when no code was ever synced. */
	readonly checkedAt: string | null;
	/** Elements changed in the spec by hand since the last retrospecification (criterion 956cb2ac). */
	readonly changedByHand: number;
}

export const EMPTY_APP_CHROME: AppChrome = {
	notifications: [],
	progress: { retroDone: false, specVisited: false, evolutionStarted: false, evolutionVerified: false },
	retroDone: false,
	tabs: null,
	live: [],
	evolutions: [],
	openEvolutions: 0,
	drift: null,
	spec: null,
	specChecks: null
};
