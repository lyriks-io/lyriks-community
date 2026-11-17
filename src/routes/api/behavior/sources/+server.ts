import { error } from '@sveltejs/kit';
import {
	featureIdCollisionMessage,
	featureIdCollisions,
	requireBehaviorFeatureAccess
} from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { adoptionJson, requireSourceAccess } from '$lib/server/adoption-endpoint.server';
import { linkStoredText, registerHolds } from '$lib/server/source-passages.server';
import type { RequestHandler } from './$types';

/**
 * The evidence half of code → spec: the source files an agent read, stored as
 * project-level documents so every modeled element can be traced back to one.
 *
 * Content is PUSHED by the caller, never read from a path on this server. The
 * engine offers a path-reading variant; it is deliberately not reachable here
 * (see `CodeAdoptionPort`) — a caller-supplied path resolved server-side is an
 * arbitrary-file-read primitive on a shared appliance.
 */

/** List a project's stored sources. */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	const sourceId = event.url.searchParams.get('sourceId');

	if (!sourceId) {
		await requireProjectAccess(event, projectId, 'read');
		return adoptionJson(await event.locals.services.codeAdoption.listSources(projectId));
	}

	await requireSourceAccess(event, projectId, sourceId, 'read');
	const offset = event.url.searchParams.get('offset');
	const maxChars = event.url.searchParams.get('maxChars');
	return adoptionJson(
		await event.locals.services.codeAdoption.getSource(sourceId, {
			...(offset ? { offset: Number(offset) } : {}),
			...(maxChars ? { maxChars: Number(maxChars) } : {})
		})
	);
};

/** Attach one source file to a feature's analysis. */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureId?: unknown;
		fileName?: unknown;
		content?: unknown;
		kind?: unknown;
		authority?: unknown;
		artifact?: unknown;
		maxBytes?: unknown;
		registerId?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	const fileName = typeof body?.fileName === 'string' ? body.fileName : '';
	const content = typeof body?.content === 'string' ? body.content : null;
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	if (!fileName) error(400, 'fileName is required');
	// An empty string is a legitimate file; a missing one is not.
	if (content === null) error(400, 'content is required');

	const kind = body?.kind === 'file' || body?.kind === 'code' ? body.kind : undefined;

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');
	// A globally addressed write on an id another project also claims would land
	// in their record; refuse while it is still a message.
	const clashes = await featureIdCollisions(event.locals.services, projectId, featureId);
	if (clashes.length > 0) error(409, featureIdCollisionMessage(projectId, featureId, clashes));
	// The register row the text is stored for: checked before anything is stored (criterion 81dffe4f).
	const registerId = typeof body?.registerId === 'string' ? body.registerId.trim() : '';
	const services = event.locals.services;
	if (registerId && !(await registerHolds(services, projectId, registerId))) error(400, `No source of the register has the id "${registerId}": register it first in the documents section.`);
	const attached = await services.codeAdoption.attachSource({
		featureId,
		fileName,
		content,
		...(kind ? { kind } : {}),
		...(typeof body?.authority === 'string' ? { authority: body.authority } : {}),
		...(typeof body?.artifact === 'string' ? { artifact: body.artifact } : {}),
		...(typeof body?.maxBytes === 'number' ? { maxBytes: body.maxBytes } : {})
	});
	if (!registerId || !attached?.ok) return adoptionJson(attached);
	// One source, one id: the register row now names the stored text, never its bytes.
	const storedId = typeof attached.value.sourceId === 'string' ? attached.value.sourceId : '';
	const hash = typeof attached.value.contentHash === 'string' ? attached.value.contentHash : '';
	if (!storedId) return adoptionJson(attached);
	const linked = await linkStoredText(services, projectId, registerId, { id: storedId, hash }, event.request.headers.get('x-lyriks-client'));
	return adoptionJson({ ok: true, value: { ...attached.value, registerId, ...(linked.ok ? { linked: true } : { linked: false, linkError: linked.reason }) } });
};

/** Rank or re-label a stored source (authority / artifact), so contradictions resolve. */
export const PATCH: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		sourceId?: unknown;
		classification?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : '';
	if (!projectId || !sourceId) error(400, 'projectId and sourceId are required');
	const classification =
		body?.classification && typeof body.classification === 'object'
			? (body.classification as Record<string, unknown>)
			: {};

	await requireSourceAccess(event, projectId, sourceId, 'write');
	return adoptionJson(await event.locals.services.codeAdoption.classifySource(sourceId, classification));
};

/** Delete a stored source. The analysis keeps its spans; they simply lose their text. */
export const DELETE: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	const sourceId = event.url.searchParams.get('sourceId') ?? '';
	if (!projectId || !sourceId) error(400, 'projectId and sourceId are required');

	await requireSourceAccess(event, projectId, sourceId, 'write');
	return adoptionJson(await event.locals.services.codeAdoption.removeSource(sourceId));
};
