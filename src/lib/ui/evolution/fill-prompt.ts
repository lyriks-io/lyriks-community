/**
 * The prompt that hands a whole request to the person's own AI (criterion
 * 34d8397e): it writes, the gates stay a person's. Read on the request and on
 * the concurrent impact report, for an evolution with nothing drafted yet.
 */
export function fillEvolutionPrompt(request: { readonly key?: string | null; readonly title: string; readonly id: string }, projectId: string): string {
	return [
		`With the Lyriks MCP, fill evolution ${request.key ?? ''} "${request.title}" (project ${projectId}, request ${request.id.slice(0, 8)}).`,
		'Read it with get_evolution. From what the specification and the code already say, write every answer still empty of the Need, the Solution, the Functional spec and the Technical spec, then draft the Specification: the features it touches, their actions and rules, the tables it changes.',
		'Review only features, actions and rules actually changed by this request. Keep unchanged inherited elements as context, preserve stable identities and every human rejection, and never recreate rejected proposals or validate in my place.',
		'Offer Solution requirements as structured candidates in their exact category, one statement per line, individually accepted or rejected. Preserve existing answers and do not repeat any identical offered or decided requirement in another comment or reply.',
		'Follow the lyriks-evolution skill. Ask me what you cannot tell. Stop at each gate: crossing it is mine.'
	].join(' ');
}
