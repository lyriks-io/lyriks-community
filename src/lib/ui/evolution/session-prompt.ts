import { isCommunity } from '$domain/licensing';

/**
 * The prompt that opens the session of the person's own AI on the whole
 * project (ac-ai-session-project): the floating chip copies it, naming
 * the request on screen, and "Prepare it with my AI" copies it naming its request
 * (ac-evo-coach-4, ac-evo-live-start). The AI opens the session once and waits
 * on the pages for the person's clicks instead of asking everything in the chat.
 * A Community installation installs no playbook of Evolutions and holds no
 * request: there the prompt says itself what to do with a question of Ask my
 * AI (EVO-008).
 */
export function projectSessionPrompt(
	projectId: string,
	projectName: string,
	options: { readonly waiting?: string | null; readonly request?: { readonly id: string; readonly title: string }; readonly edition?: string | null } = {}
): string {
	const { waiting = null, request, edition = null } = options;
	return [
		`A Lyriks session begins on the project "${projectName}" (${projectId}).`,
		...(request ? [`Start with the Evolution request "${request.title}" (request ${request.id.slice(0, 8)}).`] : []),
		// What the person clicked before any session waits on the page and is handed over first (ac-evo-live-no-session).
		...(waiting ? [`My ${waiting} already waits on the page: await_evolution_event hands it to you first.`] : []),
		'With the Lyriks MCP, open it with start_evolution_session given the project alone and client set to what you are (Claude Code, Codex...), then wait for my clicks on any page of the project with await_evolution_event (the project and the session, no request): answer each click as it says, then wait again, until the session ends.',
		isCommunity(edition)
			? 'A question I ask in Ask my AI comes as a click of kind chat: judge whether it bears on the page I asked it from, answer it with apply_evolution_batch [{ op: "answer_click", clickId, text }] so your answer reads in my conversation, and ask me back in one question when you cannot tell what I mean. Say on the page what you are doing; never decide in my place.'
			: 'On a request, follow the lyriks-evolution skill: lead me to the next thing to answer or validate, one at a time, with its link. Say on the page what you are doing; never decide in my place.'
	].join(' ');
}

/** The prompt "Prepare it with my AI" copies on a request: the project's session, starting on that request (ac-evo-live-start). */
export function sessionPrompt(projectId: string, requestId: string, title: string, waiting: string | null = null, projectName: string = projectId): string {
	return projectSessionPrompt(projectId, projectName, { waiting, request: { id: requestId, title } });
}
