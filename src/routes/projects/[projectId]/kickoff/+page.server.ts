import { getServices } from '$composition/container.server';
import { mcpEndpointFor, mcpRegistrationCommands } from '$domain/foundation';
import type { PageServerLoad } from './$types';

/**
 * The kickoff of every project: the one sentence the user pastes into their AI
 * agent, which then authors the spec through the MCP. Lyriks does not read a
 * repository, a backlog or a wiki itself; the agent does, through the MCP
 * servers connected to it. The sentence is assembled on the page from the
 * project's origin (its Foundation identity) and, from scratch, the sources the
 * user ticks. Access is gated by the project layout. The page also says how to
 * connect an agent that has no Lyriks MCP yet.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const draft = await getServices().loadFoundationDraft.loadIdentity(params.projectId);
	const mcpUrl = mcpEndpointFor(url.origin);
	return {
		projectId: params.projectId,
		productName: draft.productName,
		sourceMode: draft.sourceMode ?? null,
		mcpUrl,
		commands: mcpRegistrationCommands(mcpUrl)
	};
};
