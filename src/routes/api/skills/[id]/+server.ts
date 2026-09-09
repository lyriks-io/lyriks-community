import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { RequestHandler } from './$types';

/**
 * One bundled authoring skill, full content included. Two shapes:
 *  - default: JSON with the authored original in `content`, the install
 *    variant in `installContent` (frontmatter carries a `contentHash:` line so
 *    the installed copy self-reports its version), and `installTargets` — one
 *    layout per agent runtime, so Claude, Codex, Gemini and the rest each get
 *    a path they actually read;
 *  - `?download=1`: the install variant as a markdown attachment (the Settings
 *    → Skills Download button — a plain anchor, no client-side blob juggling).
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const skill = getServices().skillCatalog.getSkill(params.id);
	if (!skill) error(404, `Unknown skill "${params.id}"`);

	if (url.searchParams.get('download') === '1') {
		return new Response(skill.installContent, {
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'Content-Disposition': `attachment; filename="${skill.id}.SKILL.md"`
			}
		});
	}

	return json(skill);
};
