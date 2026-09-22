/**
 * Who is on the other end of a write: a person, or a client acting for one.
 *
 * Read from the request, never from the body. The MCP names itself with
 * `x-lyriks-actor: ai_client` on every call it makes to the platform (see
 * `packages/mcp/src/lyriks-client.ts` in Lyriks-back); a browser never sends
 * the header. That distinction is load-bearing wherever a client may write and
 * report but only a person may decide, so it lives in one place rather than
 * being re-derived, or defaulted to 'person', at each door.
 */
export const ACTOR_HEADER = 'x-lyriks-actor';

export type CallerKind = 'person' | 'ai_client';

export function callerKind(request: Pick<Request, 'headers'>): CallerKind {
	return request.headers.get(ACTOR_HEADER) === 'ai_client' ? 'ai_client' : 'person';
}
