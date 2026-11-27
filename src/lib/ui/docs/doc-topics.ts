/**
 * What the Documentation holds and how its search narrows it (criterion
 * e3629a5f): the topics in the order the page reads them, grouped as its
 * table of contents shows them, each with the words a reader may type that
 * its text does not carry. Pure, so the narrowing is tested without a browser.
 */
import { isCommunity, planOpening, UPGRADE_PLAN_NAMES, type CommunityLock } from '$domain/licensing';

export interface DocTopic {
	readonly id: string;
	readonly label: string;
	readonly group: DocGroup;
	/** Words a reader may type for this topic that its text does not hold. */
	readonly keywords: string;
}

export type DocGroup = 'Start here' | 'The product' | 'Working with Lyriks' | 'Running Lyriks' | 'When something is off';

export const DOC_GROUPS: readonly DocGroup[] = ['Start here', 'The product', 'Working with Lyriks', 'Running Lyriks', 'When something is off'];

export const DOC_TOPICS: readonly DocTopic[] = [
	{ id: 'get-help', label: 'Get help', group: 'Start here', keywords: 'help support first steps guided tour demo community discord feedback contact' },
	{ id: 'start', label: 'Where to start', group: 'Start here', keywords: 'role product owner analyst developer reviewer administrator operator onboarding begin' },
	{ id: 'what', label: 'What Lyriks is', group: 'The product', keywords: 'overview introduction specification executable behavior coherent' },
	{ id: 'editions', label: 'Editions', group: 'The product', keywords: 'community enterprise open source plan licence license edition price' },
	{ id: 'projects', label: 'Projects and folders', group: 'The product', keywords: 'home project create new folder domain portfolio move reorder drag delete rename' },
	{ id: 'reverse-spec', label: 'Reverse-Specification', group: 'The product', keywords: 'codebase code existing product rebuild analysis import ingest adopt run summary complementary' },
	{ id: 'spec360', label: 'Knowledge', group: 'The product', keywords: 'knowledge specification 360 overview features users experience technology tech data glossary edit mode comments sources page tabs' },
	{ id: 'validation', label: 'Validating the specification', group: 'The product', keywords: 'validate validation draft validated review approve request change reviewer' },
	{ id: 'follow-up', label: 'Follow-up', group: 'The product', keywords: 'changes evolutions evolution request change mismatch code drift notices what lyriks noticed findings points' },
	{ id: 'ai', label: 'Working with your AI', group: 'Working with Lyriks', keywords: 'ai llm mcp claude codex cursor client connect session ask my ai prompt assistant suggestions tools allow' },
	{ id: 'measures', label: 'Health and the other measures', group: 'Working with Lyriks', keywords: 'health score coherence noticed major minor features users measure figure' },
	{ id: 'team', label: 'Team, roles and jobs', group: 'Working with Lyriks', keywords: 'team members invite invitation role owner admin editor designer viewer job access validate validation tech development enterprise' },
	{ id: 'search', label: 'Search', group: 'Working with Lyriks', keywords: 'search find ctrl k cmd k palette recent recently changed rule' },
	{ id: 'deployment', label: 'Deployment and air-gap', group: 'Running Lyriks', keywords: 'install deployment air-gap offline egress licence activation postgres versions update' },
	{ id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Running Lyriks', keywords: 'keyboard shortcut keys hotkey ctrl cmd escape' },
	{ id: 'troubleshooting', label: 'Troubleshooting', group: 'When something is off', keywords: 'problem error faq question paused disconnected quiet cannot edit stuck' },
	{ id: 'words', label: 'Words of Lyriks', group: 'When something is off', keywords: 'glossary vocabulary terms definitions meaning' }
];

/** The words of a query, lowercased; an empty query has none. */
export function queryWords(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * The topics a query keeps: those whose name, keywords or text hold every
 * word typed. `texts` is what each topic reads on the page, by id; a topic
 * whose text is not known yet is read by its name and keywords alone.
 */
export function topicsMatching(topics: readonly DocTopic[], texts: Readonly<Record<string, string>>, query: string): DocTopic[] {
	const words = queryWords(query);
	if (words.length === 0) return [...topics];
	return topics.filter((t) => {
		const haystack = `${t.label} ${t.keywords} ${texts[t.id] ?? ''}`.toLowerCase();
		return words.every((w) => haystack.includes(w));
	});
}

/**
 * The topic in view while the page scrolls: the last one whose top has
 * reached the reading line, else the first. `tops` are the topics' tops
 * relative to the scroller, in the page's order.
 */
export function topicInView(tops: readonly { readonly id: string; readonly top: number }[], readingLine: number): string | null {
	let current: string | null = tops[0]?.id ?? null;
	for (const t of tops) if (t.top <= readingLine) current = t.id;
	return current;
}

export interface HelpEntry {
	readonly key: 'first-steps' | 'tour' | 'community' | 'feedback';
	readonly title: string;
	readonly line: string;
	/** An outside address opened in a new tab on a click; absent for what the app opens itself. */
	readonly href?: string;
}

/**
 * The ways to get help at the head of the Documentation, as the owner listed
 * them. The community shows only once the installation knows its address; the
 * installation never guesses where it lives (no default egress). A null guide
 * or community is one an administrator did not allow out (criterion b4538030).
 */
export function helpEntries(input: { readonly guideUrl: string | null; readonly discord: string | null }): HelpEntry[] {
	return [
		{ key: 'first-steps', title: 'First steps', line: 'The five steps from your first project to verified code, ticked as you go.' },
		...(input.guideUrl ? [{ key: 'tour' as const, title: 'Guided tour', line: 'The full guide with a short demo of each step, on get.lyriks.io.', href: input.guideUrl }] : []),
		...(input.discord ? [{ key: 'community' as const, title: 'Community on Discord', line: 'Ask the people who build and use Lyriks.', href: input.discord }] : []),
		{ key: 'feedback', title: 'Leave us feedback', line: 'Tell us what is wrong or missing, in a few lines.' }
	];
}

/**
 * One step of a start path. `lock` names what Community locks behind it: on a
 * Community installation the step names the plan that opens it instead of
 * sending the reader to a part they cannot use.
 */
export interface StartStep {
	readonly text: string;
	readonly topic: string;
	readonly lock?: CommunityLock;
}

/** Where each kind of reader starts, each step pointing at a topic of the page. */
export const START_PATHS: readonly { readonly who: string; readonly steps: readonly StartStep[] }[] = [
	{
		who: 'Product owner or analyst',
		steps: [
			{ text: 'Create the project from what exists', topic: 'projects' },
			{ text: 'Let your AI run the Reverse-Specification', topic: 'reverse-spec' },
			{ text: 'Read and correct the specification in Knowledge', topic: 'spec360' },
			{ text: 'Carry each change as an evolution in Changes', topic: 'follow-up', lock: 'evolutions' }
		]
	},
	{
		who: 'Developer working with the MCP',
		steps: [
			{ text: 'Connect your AI client to the MCP', topic: 'ai' },
			{ text: 'Keep the repository bound to its project', topic: 'ai' },
			{ text: 'Write the spec first, then the code', topic: 'follow-up' },
			{ text: 'Watch Mismatch and the health', topic: 'measures' }
		]
	},
	{
		who: 'Reviewer who validates',
		steps: [
			{ text: 'Open Knowledge on its Overview', topic: 'spec360' },
			{ text: 'Validate what waits on you, or ask for a change', topic: 'validation' },
			{ text: 'Discuss a block in its comments', topic: 'spec360' },
			{ text: 'Check what Lyriks noticed', topic: 'measures' }
		]
	},
	{
		who: 'Administrator or operator',
		steps: [
			{ text: 'Activate the installation and know its edition', topic: 'editions' },
			{ text: 'Invite the team and give each a role and a job', topic: 'team', lock: 'sharing' },
			{ text: 'Decide what the AI may do', topic: 'ai' },
			{ text: 'Keep the installation up to date, offline', topic: 'deployment' }
		]
	}
];

/** The plan a start step waits on for this installation, or null when the step is open to it. */
export function stepOpenedBy(step: StartStep, edition: string | null | undefined): string | null {
	return step.lock && isCommunity(edition) ? UPGRADE_PLAN_NAMES[planOpening(step.lock)] : null;
}
