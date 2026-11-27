import type { SourceModeCode } from '$domain/foundation';

/**
 * How a project was started, as the "Create your project" dialog asks it: an
 * existing product Lyriks learns from its codebase, from documents, from both,
 * or that the team describes itself; or a new product built from scratch,
 * through a first evolution. The way decides which tabs the project opens on
 * and the prompt the person pastes into their LLM. The person's LLM does all
 * the reading, through the Lyriks MCP and the connectors it already has.
 *
 * Pure: types, parsing and text assembly only.
 */
export const START_WAYS = ['code', 'docs', 'code_and_docs', 'manual', 'scratch'] as const;
export type StartWay = (typeof START_WAYS)[number];
export const isStartWay = (v: unknown): v is StartWay => typeof v === 'string' && (START_WAYS as readonly string[]).includes(v);

/** From scratch: what the LLM starts from, and how it builds the specification with the person. */
export type ScratchSource = 'document' | 'idea';
export type ScratchPace = 'block' | 'all';

export interface ProjectStart {
	readonly way: StartWay;
	readonly at: string;
	readonly by: string;
}

/** The residue key the start is kept under. */
export const PROJECT_START_KEY = 'project-start';

export function parseProjectStart(raw: unknown): ProjectStart | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (!isStartWay(r.way)) return null;
	return { way: r.way, at: typeof r.at === 'string' ? r.at : '', by: typeof r.by === 'string' ? r.by : '' };
}

/** The Foundation source mode a way records on the project's identity. */
export function sourceModeOf(way: StartWay): SourceModeCode {
	if (way === 'code' || way === 'code_and_docs') return 'code_to_spec';
	if (way === 'docs') return 'from_document';
	return 'greenfield';
}

/** The way a project started before the dialog recorded it, read off its source mode when it says enough. */
export function startWayOfSourceMode(mode: SourceModeCode | null | undefined): StartWay | null {
	if (mode === 'code_to_spec') return 'code';
	if (mode === 'from_document') return 'docs';
	return null;
}

/** What the person picked for an existing product: the codebase and documents combine, describing it yourself goes alone. */
export interface LearnFrom {
	readonly code: boolean;
	readonly docs: boolean;
	readonly manual: boolean;
}

/** The way a person's choices make; null while an existing product has no source picked. */
export function wayOf(product: 'existing' | 'scratch', from: LearnFrom): StartWay | null {
	if (product === 'scratch') return 'scratch';
	if (from.manual) return 'manual';
	if (from.code && from.docs) return 'code_and_docs';
	if (from.code) return 'code';
	if (from.docs) return 'docs';
	return null;
}

/** An existing product whose specification Lyriks rebuilds through a retrospecification. */
export const rebuildsSpec = (way: StartWay): boolean => way === 'code' || way === 'docs' || way === 'code_and_docs';

export interface StartPromptInput {
	readonly way: StartWay;
	readonly name: string;
	readonly projectId: string;
	readonly scratch?: { readonly source: ScratchSource; readonly pace: ScratchPace };
	/** Where the person reads the result: asked for, the LLM tells them by email, through its own connector. */
	readonly emailWhenReady?: { readonly url: string } | null;
	/**
	 * The MCP address of this installation: named in the prompt, an AI connected to another Lyriks server says so
	 * instead of offering another project of the same name (criterion a55ccdf4).
	 */
	readonly mcpUrl?: string | null;
}

/** What an AI that cannot find the project on the named server does: one sentence, never a menu of other projects. */
const NOT_THERE = 'If this project is not on that server, say so in one sentence and stop.';

/** The prompt the person pastes into their LLM, connected to the Lyriks MCP. */
export function startPrompt(input: StartPromptInput): string {
	const body = startPromptBody(input);
	const mcp = input.mcpUrl?.trim();
	return mcp ? `${body.replace('With the Lyriks MCP,', `With the Lyriks MCP at ${mcp},`)} ${NOT_THERE}` : body;
}

/** The prompt's request, before the server it names. */
function startPromptBody(input: StartPromptInput): string {
	const name = input.name.trim() || 'My project';
	const project = `the “${name}” project (id ${input.projectId})`;
	const email = input.emailWhenReady
		? ` When the Reverse-Specification is complete, send me an email through your mail connector saying it is ready to validate, with this link: ${input.emailWhenReady.url}`
		: '';
	switch (input.way) {
		case 'code':
			return `With the Lyriks MCP, ingest this entire codebase into ${project} and build its Reverse-Specification: functional (features, actions and journeys, business rules, invariants, testable requirements) and technical (architecture, dependencies, data model, interfaces, processing flows).${email}`;
		case 'code_and_docs':
			return `With the Lyriks MCP, ingest this entire codebase into ${project}, then read every document I give you about it (Word, Excel, PowerPoint, PDF, Confluence or Notion pages, tickets, mock-ups…). Build its Reverse-Specification from both: functional (features, actions and journeys, business rules) and technical (architecture, data model, interfaces). The code is the reference for what the product does today: when a document says otherwise, keep the code’s version and flag the gap as “to check”.${email}`;
		case 'docs':
			return `With the Lyriks MCP, read every document I give you about ${project} (Word, Excel, PowerPoint, PDF, Confluence or Notion pages, tickets, mock-ups…) and draft its Reverse-Specification in Lyriks: functional (features, actions, rules) and technical. The documents may be outdated or incomplete: mark every statement you could not confirm as “to check”.${email}`;
		case 'manual':
			return `With the Lyriks MCP, open the empty Specification 360° of ${project} (foundations, features, users, experience, tech, data, glossary). I will describe the product myself: ask me one question at a time, section by section, and write my answers into Lyriks.`;
		case 'scratch': {
			const { source, pace } = input.scratch ?? { source: 'idea', pace: 'block' };
			const from =
				source === 'document'
					? 'Read the document I give you (requirements, brief, slides, mock-ups) and '
					: 'I want to build a new product: ask me one short question at a time (what problem it solves, for whom, what it must do), each with an example answer I can pick or correct, then ';
			const how =
				pace === 'all'
					? 'suggest a complete first specification in one go (features, actions, rules, users, data). Mark everything the source does not say as “to check”.'
					: 'build the specification with me block by block: propose one section at a time, wait for my validation, then move on to the next one.';
			return `With the Lyriks MCP, work in ${project}. ${from}${how}`;
		}
	}
}
