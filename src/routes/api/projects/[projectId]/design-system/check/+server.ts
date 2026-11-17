import { error, json } from '@sveltejs/kit';
import { designSystemReading } from '$application/specification/design-system-reading';
import { checkDesign, type DesignInput, type SizeKind } from '$domain/experience';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

const SIZE_KINDS: readonly SizeKind[] = ['font', 'radius', 'spacing'];
const MAX_VALUES = 200;

/** What a design file holds, as the AI read it, kept to what can be compared (anti-corruption). */
function designInputOf(body: unknown): DesignInput {
	const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	const rows = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_VALUES).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : []);
	const name = (r: Record<string, unknown>) => (typeof r.name === 'string' ? r.name : undefined);
	return {
		colors: rows(src.colors).flatMap((r) => (typeof r.value === 'string' && r.value.trim() ? [{ name: name(r), value: r.value }] : [])),
		sizes: rows(src.sizes).flatMap((r) =>
			SIZE_KINDS.includes(r.kind as SizeKind) && typeof r.px === 'number' && Number.isFinite(r.px) ? [{ kind: r.kind as SizeKind, name: name(r), px: r.px }] : []
		)
	};
}

/**
 * A design held against the design system (check_design, ac-brand-design-mcp):
 * each colour and size the AI read from a design file such as a Figma frame,
 * matched to the nearest value of the specification and read as matching it,
 * close to it or outside it.
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const input = designInputOf(await event.request.json().catch(() => null));
	if ((input.colors?.length ?? 0) + (input.sizes?.length ?? 0) === 0) error(400, 'Give the colours ({ name?, value }) or the sizes ({ kind: font | radius | spacing, name?, px }) the design holds.');
	const experience = await event.locals.services.loadExperienceDraft.execute(projectId);
	return json({ projectId, ...checkDesign(designSystemReading(experience.brand).system, input) });
};
