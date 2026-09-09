import { error, json, type RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { AdoptionResult } from '$application/ports';
import { requireProjectAccess } from './project-access.server';

/**
 * Turn one engine answer into an HTTP response, shared by every code → spec route.
 *
 * Three outcomes, three meanings:
 *  - `null`      → the engine subprocess is unreachable. 503; the platform runs
 *                  without it, so this is an outage of an optional capability.
 *  - `ok: false` → the engine REFUSED, and the reason is the answer (untraced
 *                  elements, a finalized analysis, a source over the cap). 200
 *                  with `ok:false`, mirroring `/api/behavior/apply`: an LLM must
 *                  read the reason and correct itself, which an opaque 4xx denies it.
 *  - `ok: true`  → the payload, relayed verbatim.
 */
export function adoptionJson(result: AdoptionResult | null): Response {
	if (result === null) error(503, 'Behavior engine unavailable');
	if (!result.ok) return json({ available: true, ok: false, error: result.error });
	return json({ available: true, ok: true, ...result.value });
}

/**
 * Authorize a source-scoped operation.
 *
 * The engine addresses sources by a globally unique id and resolves them across
 * the whole store, so `projectId` alone would let any authenticated caller read
 * or delete another project's attached code. Prove membership before acting:
 * list the project's own sources and require the id to be among them.
 */
export async function requireSourceAccess(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string,
	sourceId: string,
	action: 'read' | 'write'
): Promise<void> {
	await requireProjectAccess(event, projectId, action);

	const listed = await getServices().codeAdoption.listSources(projectId);
	if (listed === null) error(503, 'Behavior engine unavailable');
	if (!listed.ok) error(502, `Could not verify source ownership: ${listed.error}`);

	const sources = listed.value.sources;
	const owns =
		Array.isArray(sources) &&
		sources.some((s) => (s as { id?: unknown } | null)?.id === sourceId);
	if (!owns) error(404, 'Source not found in project');
}
