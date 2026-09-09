/**
 * The canonical list of authorable project sections — the wire vocabulary every
 * out-of-process author speaks: `GET /api/sections`, `GET /api/sections/describe`,
 * `PUT /api/draft/<section>`, and through those, the Lyriks MCP's `section` enum.
 *
 * It lives here because it was duplicated: the read endpoint and the describe
 * endpoint each kept their own copy, and the MCP a third one in another repo —
 * which is how `finops`, `approvals` and `baselines` shipped in the app while
 * staying unreachable over MCP for months. One list, checked against the actual
 * `/api/draft/*` routes by `sections.test.ts`.
 *
 * Public ids match the product capabilities. Legacy Foundation storage keys are
 * accepted only by migration adapters and are never exposed here.
 */
export const SECTIONS = [
	'scope',
	'foundation',
	'users',
	'features',
	'experience',
	'rules',
	'data',
	'architecture',
	'coherence',
	'glossary',
	'supervision',
	'finops',
	'approvals',
	'baselines',
	'documents'
] as const;

export type Section = (typeof SECTIONS)[number];

/** Narrow an untrusted query-string value to a known section. */
export function isSection(value: string): value is Section {
	return (SECTIONS as readonly string[]).includes(value);
}

/**
 * Who owns a section's content.
 *
 * - `product` — the specification of the customer's product. An agent authoring
 *   through the MCP is expected to fill these, and the completion gate asks for
 *   them.
 * - `derived` — computed or captured server-side (scores, snapshots). Read it,
 *   never write it.
 * - `operator` — the WORKSPACE's own running data: who is assigned what, the AI
 *   policy, the AI budget. It says nothing about the product being specified, it
 *   belongs to the human running the workspace, and an agent inventing team
 *   members or a monthly budget is fabricating facts about a real organisation.
 *
 * One registry, because three places used to answer this differently: the scope
 * ledger demanded every section be assessed, `describe_section` implied every
 * section was authorable, and the completion gate blocked on both.
 */
export type SectionAudience = 'product' | 'derived' | 'operator';

export const SECTION_AUDIENCE: Readonly<Record<Section, SectionAudience>> = {
	scope: 'product',
	foundation: 'product',
	users: 'product',
	features: 'product',
	experience: 'product',
	rules: 'product',
	data: 'product',
	architecture: 'product',
	coherence: 'derived',
	glossary: 'product',
	supervision: 'operator',
	finops: 'operator',
	approvals: 'product',
	baselines: 'derived',
	documents: 'product'
};

/** Sections an agent is expected to author. The rest it may read, not write. */
export function isAgentAuthorable(section: Section): boolean {
	return SECTION_AUDIENCE[section] === 'product';
}
