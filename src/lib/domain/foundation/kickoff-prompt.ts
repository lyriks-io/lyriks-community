import type { SourceModeCode } from './identity-enums';

/**
 * The kickoff of a project: the one sentence the user pastes into their AI
 * agent, whatever the project starts from.
 *
 * Lyriks never reads a repository, a backlog or a wiki itself: the user's agent
 * does, through the MCP servers connected to it (Lyriks's own, plus Jira,
 * Notion, Confluence, Figma, or the BMAD and Spec Kit files of a repository),
 * and authors the spec through the Lyriks MCP. One sentence is enough: the
 * Lyriks MCP's own instructions route it to the shipped playbook (lyriks-build
 * from scratch, lyriks-retrospec from a codebase), which the agent installs
 * through `sync_skills` and which carries every rule. The sentence only names
 * the target project and, from scratch, the sources the agent should read, so
 * it never has to guess either.
 *
 * Pure text assembly: no IO, no framework.
 */

/** A kind of source an agent can read through a connected MCP or the repository: the chip the user ticks (`label`), how the sentence names it (`phrase`), what the agent makes of it (`hint`). */
export const KICKOFF_SOURCES = [
	{
		code: 'jira',
		label: 'Jira backlog',
		phrase: 'the Jira backlog',
		hint: 'Epics and stories become the feature tree, the roadmap and the rules.'
	},
	{
		code: 'notion',
		label: 'Notion pages',
		phrase: 'the Notion pages',
		hint: 'Briefs, personas and decisions feed Foundation, Users and the Glossary.'
	},
	{
		code: 'confluence',
		label: 'Confluence space',
		phrase: 'the Confluence space',
		hint: 'Specs, decisions and vocabulary, like Notion.'
	},
	{
		code: 'bmad',
		label: 'BMAD documents',
		phrase: 'the BMAD documents of this repository (PRD, architecture, stories)',
		hint: 'PRD, architecture and stories map onto Foundation, Features and Architecture.'
	},
	{
		code: 'speckit',
		label: 'Spec Kit files',
		phrase: 'the Spec Kit files of this repository (spec, plan, tasks)',
		hint: 'spec.md, plan.md and tasks.md map onto Features, Architecture and the roadmap.'
	},
	{
		code: 'figma',
		label: 'Figma files',
		phrase: 'the Figma files',
		hint: 'Screens and components feed the Experience.'
	},
	{
		code: 'documents',
		label: 'Other documents',
		phrase: 'the documents I hand you',
		hint: 'PDFs, decks, interviews: whatever you share with the agent.'
	}
] as const;
export type KickoffSource = (typeof KICKOFF_SOURCES)[number];
export type KickoffSourceCode = KickoffSource['code'];

export interface KickoffInput {
	/** The product's name as typed at creation (only used to address it). */
	productName: string;
	/**
	 * The v3 project id (the slug the section tools address) when the project
	 * already exists. Absent, the sentence asks the agent to create the project
	 * itself, through the MCP, before authoring into it.
	 */
	projectId?: string | null;
	/** The domain the project should be filed under, by name; only used when the agent creates it. */
	domainName?: string | null;
	/** Where the project starts; `code_to_spec` = from a codebase, anything else = from scratch. */
	sourceMode: SourceModeCode | null | undefined;
	/** From scratch: the sources the agent should read, in the order they were ticked. */
	sources?: readonly KickoffSourceCode[];
}

/** "a", "a and b", "a, b and c". */
function list(items: readonly string[]): string {
	if (items.length <= 1) return items[0] ?? '';
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The one line the user pastes into their agent. */
export function kickoffPrompt(input: KickoffInput): string {
	const name = input.productName.trim() || 'this product';
	const domain = input.domainName?.trim();
	// Existing project: address it by id. No project yet: the agent creates it,
	// named (and filed) as the user said, then authors into it.
	const target = input.projectId
		? `the Lyriks project "${name}" (id ${input.projectId})`
		: `the Lyriks project "${name}"${domain ? ` in the domain "${domain}"` : ''}`;
	const verb = input.projectId ? 'specify' : 'create';
	if (input.sourceMode === 'code_to_spec') {
		return input.projectId
			? `With the help of the Lyriks MCP, ingest this entire codebase into ${target}.`
			: `With the help of the Lyriks MCP, create ${target} and ingest this entire codebase into it.`;
	}
	const chosen = new Set(input.sources ?? []);
	const phrases = KICKOFF_SOURCES.filter((s) => chosen.has(s.code)).map((s) => s.phrase);
	if (phrases.length === 0) {
		return `With the help of the Lyriks MCP, ${verb} ${target} from scratch: interview me for what you need and build the spec as we go.`;
	}
	return `With the help of the Lyriks MCP, ${verb} ${target} from scratch, from ${list(phrases)} (through their MCPs connected here, or the files of this repository), and ask me what they cannot tell you.`;
}

/** The MCP endpoint every client registers, derived from the app's own origin. */
export function mcpEndpointFor(origin: string): string {
	return `${origin.replace(/\/+$/, '')}/mcp`;
}

/**
 * How the two clients the documentation covers register this install's MCP,
 * for an agent that does not have it yet. Shown next to the sentence, never
 * inside it: an agent already connected needs nothing but the sentence.
 */
export function mcpRegistrationCommands(mcpUrl: string): { claudeCode: string; codex: string } {
	return {
		claudeCode: `claude mcp add --scope user --transport http lyriks ${mcpUrl}`,
		codex: `codex mcp add lyriks --url ${mcpUrl}`
	};
}
