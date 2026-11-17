import type { RequestEvent } from '@sveltejs/kit';
import type { AiActivity } from '$lib/shared/ai-activity';
import { callerKind } from './caller.server';
import { currentPersonId } from './evolution-actor.server';
import { noteAiCall } from './evolution-live.server';
import { publishAiActivity } from './sync-bus.server';

/**
 * Signal that the person's AI read or wrote these requests, so an open dossier
 * page follows it live. Only a call the MCP makes counts (the `ai_client`
 * header, see caller.server.ts): the page's own reads and saves never do.
 */
export function signalAiActivity(
	event: Pick<RequestEvent, 'request' | 'locals'>,
	projectId: string,
	requestIds: readonly string[],
	act: AiActivity['act']
): void {
	if (callerKind(event.request) !== 'ai_client') return;
	const services = event.locals.services;
	const personId = currentPersonId(services);
	for (const requestId of new Set(requestIds)) {
		publishAiActivity({ projectId, requestId, act });
		// In a live session the call also says the AI is at work, not gone (ac-evo-live-state).
		noteAiCall(services, projectId, requestId, personId, act);
	}
}
