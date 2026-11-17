import { json } from '@sveltejs/kit';
import { designSystemReading } from '$application/specification/design-system-reading';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The design system in one answer, for an AI client (get_design_system,
 * ac-brand-design-mcp): the palette in its roles and shades, the colours of
 * text and surfaces, the type, the corners, the spacing, the shadows, the
 * breakpoints and the style, every colour also as hex, and the sources it was
 * read from.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const experience = await event.locals.services.loadExperienceDraft.execute(projectId);
	const { system: _system, ...reading } = designSystemReading(experience.brand);
	return json({ projectId, ...reading });
};
