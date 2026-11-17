/**
 * The four figures under the product's pitch on the Overview (criteria
 * 416e4885, f5909522): how many features and in how many areas, how many
 * users and of which class, Project health with its word and what it
 * measures, and the points of What Lyriks noticed still to review; each names
 * the section a click brings into view, Health the page that tells it in full.
 * Pure.
 */

export type FigureTone = 'blue' | 'violet' | 'green' | 'orange' | 'red';

export interface OverviewFigure {
	readonly key: 'features' | 'users' | 'health' | 'noticed';
	/** The number, large; '…' while it is being read. */
	readonly value: string;
	readonly label: string;
	/** The verdict word before the line, in its colour (Health only). */
	readonly word: { readonly text: string; readonly tone: FigureTone } | null;
	readonly line: string;
	/** The colour of the number's hard shadow. */
	readonly tone: FigureTone;
	/** The DOM id of the section a click brings into view, when the click stays on the page. */
	readonly target: string;
	/** Where a click goes instead, when the figure is told in full on a page of its own (Health). */
	readonly href: string | null;
	/** What the figure measures, in its own words, under its line (Health, criterion f5909522). */
	readonly about: string | null;
	/** What the figure weighs, said on hover. */
	readonly hint: string;
	/** Project health reads the specification alone: no code is linked yet (criterion 08324382). */
	readonly noCode: boolean;
}

export interface OverviewFiguresInput {
	readonly cores: readonly { readonly features: number }[];
	readonly users: readonly { readonly userClass: 'end' | 'admin' }[];
	readonly health: {
		readonly score: number;
		readonly verdict: 'strong' | 'watch' | 'critical';
		readonly blocking: number;
		readonly total: number;
		readonly codeLinked?: boolean;
		/** The formal proof of the specification as it stands has not landed yet (criterion 5785c1fb). */
		readonly proofPending?: boolean;
	} | null;
	/** The project's first reading of its health is being taken. */
	readonly healthReading: boolean;
	readonly noticed: { readonly total: number; readonly pending: number; readonly major: number; readonly minor: number };
	/** The page that tells Project health in full: Health. */
	readonly healthHref?: string | null;
}

/** The ids of the sections the figures lead to. */
export const OVERVIEW_SECTIONS = { what: 'kb-what', who: 'kb-who', noticed: 'kb-noticed' } as const;

const VERDICT: Readonly<Record<'strong' | 'watch' | 'critical', { text: string; tone: FigureTone }>> = {
	strong: { text: 'Strong', tone: 'green' },
	watch: { text: 'To watch', tone: 'orange' },
	critical: { text: 'Critical', tone: 'red' }
};

const counted = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const READING = '…';

const HEALTH_WEIGHS =
	'One score for how the project stands, computed from every point in What Lyriks noticed: the coherence of the specification, what the completeness audit flags and, once code is linked, what the code says about it. A defect of the product weighs most, then a gap in the description, then an open question. What Lyriks could not check counts nothing.';

/**
 * What Project health measures, said on its tile so the Overview needs no other page to tell it (criterion f5909522,
 * owner 2026-11-05): without code linked the reading cannot prove anything against it, so it does not say so.
 */
export function healthAbout(health: OverviewFiguresInput['health']): string {
	return health?.codeLinked === false ? 'How sound the spec is: complete and coherent' : 'How sound the spec is: complete, coherent, proven against the code';
}

/** What Project health weighs and how many points wait, said when the figure is pointed at (criterion f5909522). */
export function healthHint(health: OverviewFiguresInput['health']): string {
	if (!health) return `${HEALTH_WEIGHS} Its first reading is being taken.`;
	const waits = `${counted(health.total, 'point')} wait${health.total === 1 ? 's' : ''}${health.blocking > 0 ? `, ${health.blocking} of them blocking` : ''}.`;
	return [HEALTH_WEIGHS, health.codeLinked === false ? 'No code linked yet: the health reads the specification alone.' : '', `Now: ${waits}`].filter(Boolean).join(' ');
}

/**
 * Project health as a figure: on the Overview a click opens Health, where it is told above the points it weighs;
 * there a click brings them into view (criterion 4dadd4b8).
 */
export function healthFigure(health: OverviewFiguresInput['health'], healthReading: boolean, href: string | null): OverviewFigure {
	const verdict = health ? VERDICT[health.verdict] : null;
	return {
		key: 'health',
		// The score carries its scale in the number, so "1 Critical" is never read as one critical point (criterion b6b34ed0).
		value: health ? `${health.score}/100` : READING,
		label: 'Health',
		word: verdict,
		line: health ? (health.proofPending ? 'Score · Proof in progress…' : 'Score') : healthReading ? 'Reading…' : 'Not measured yet',
		tone: verdict?.tone ?? 'blue',
		target: OVERVIEW_SECTIONS.noticed,
		href,
		about: healthAbout(health),
		hint: healthHint(health),
		noCode: health?.codeLinked === false
	};
}

export function overviewFigures(input: OverviewFiguresInput): OverviewFigure[] {
	const features = input.cores.reduce((n, c) => n + c.features, 0);
	const admins = input.users.filter((u) => u.userClass === 'admin').length;
	// Nothing listed yet because the first reading is still being taken: the figure waits rather than reading 0.
	const noticedWaits = input.healthReading && input.noticed.total === 0;
	return [
		{
			key: 'features',
			value: String(features),
			label: 'Features',
			word: null,
			line: `In ${counted(input.cores.length, 'area')}`,
			tone: 'blue',
			target: OVERVIEW_SECTIONS.what,
			href: null,
			about: null,
			hint: 'The features of the product, in its core features: see what it does',
			noCode: false
		},
		{
			key: 'users',
			value: String(input.users.length),
			label: 'Users',
			word: null,
			line: `${counted(input.users.length - admins, 'end user')} · ${counted(admins, 'admin')}`,
			tone: 'violet',
			target: OVERVIEW_SECTIONS.who,
			href: null,
			about: null,
			hint: 'The profiles who use the product: see who uses it',
			noCode: false
		},
		// A click opens Health, where the reading is told in full (criterion f5909522).
		healthFigure(input.health, input.healthReading, input.healthHref ?? null),
		{
			key: 'noticed',
			value: noticedWaits ? READING : String(input.noticed.pending),
			label: 'Noticed',
			word: null,
			line: noticedWaits ? 'Reading…' : `${input.noticed.major} major · ${input.noticed.minor} minor`,
			tone: 'orange',
			target: OVERVIEW_SECTIONS.noticed,
			href: null,
			about: null,
			hint: 'The points Lyriks noticed that are still to review: see what Lyriks noticed',
			noCode: false
		}
	];
}
