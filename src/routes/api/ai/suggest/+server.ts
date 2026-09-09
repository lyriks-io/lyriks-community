import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { EmptyBriefError } from '$application/use-cases';
import { parseIdentityDraft } from '$application/parse-foundation-identity';
import type { SuggestableSection } from '$domain/foundation';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

const SUGGESTABLE: SuggestableSection[] = ['form_factor'];

/** Runs Suggest From Brief for one section. Body: { section, brief, draft }. */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as {
		section?: unknown;
		brief?: unknown;
		draft?: unknown;
	} | null;

	const section = body?.section as SuggestableSection;
	if (!SUGGESTABLE.includes(section)) error(400, 'invalid section');

	const brief = typeof body?.brief === 'string' ? body.brief : '';
	const projectId =
		body?.draft && typeof (body.draft as { projectId?: unknown }).projectId === 'string'
			? ((body.draft as { projectId: string }).projectId)
			: 'unknown';
	if (projectId && projectId !== 'unknown') await requireProjectAccess(event, projectId, 'read');
	const draft = parseIdentityDraft(body?.draft, projectId);

	try {
		const suggestion = await getServices().suggestFromSection.execute(section, brief, draft);
		return json(suggestion);
	} catch (e) {
		if (e instanceof EmptyBriefError) error(422, e.message);
		throw e;
	}
};
