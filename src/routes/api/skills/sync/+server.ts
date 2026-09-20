import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { InstalledSkillRef, SkillClientId } from '$application/ports';
import type { RequestHandler } from './$types';

const CLIENT_IDS: readonly SkillClientId[] = ['claude', 'codex', 'gemini', 'copilot', 'generic'];
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

/**
 * Reconcile a client's installed authoring skills with the bundled catalog.
 * Body: `{ installed: [{ id, contentHash? }], client?: "claude" | "codex" |
 * "gemini" | "copilot" | "generic" }` (empty/missing installed = fresh machine
 * — everything comes back "new"; missing client = every layout comes back and
 * the agent picks its own). Response: per published skill its status
 * ("up-to-date" | "update" | "new"), the install layouts, and `installContent`
 * only when there is something to (re)write, plus `unknown` for reported ids
 * this server does not publish (left alone — they belong to someone else).
 * `binding` (with `projectId?: string`, the wizard slug, naming the project in
 * its block) is what the agent applies so the repository stays bound to its
 * Lyriks project in every later session, for every user. `binding.tools` lists
 * the helper scripts (`[{ path, content, contentHash, purpose }]`) that every
 * runtime writes verbatim under `.lyriks/tools/`, all of them side by side
 * since they import each other: checking the index against the code, and
 * sending an index or a batch too large to type as a tool argument.
 * Read-only diff — like the other skill reads it rides the global auth wall.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		installed?: unknown;
		client?: unknown;
		projectId?: unknown;
		skillIds?: unknown;
		includeContent?: unknown;
	};
	// Edge validation: keep only well-formed refs; garbage never reaches the port.
	const installed: InstalledSkillRef[] = (Array.isArray(body.installed) ? body.installed : [])
		.filter(
			(entry): entry is { id: string; contentHash?: unknown } =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as { id?: unknown }).id === 'string'
		)
		.map((entry) => ({
			id: entry.id,
			contentHash: typeof entry.contentHash === 'string' ? entry.contentHash : undefined
		}));

	const client = CLIENT_IDS.find((id) => id === body.client);
	// The wizard project slug the repository is specified in, when the agent
	// knows it: the binding block then names it. Anything else stays generic.
	const projectId =
		typeof body.projectId === 'string' && PROJECT_ID.test(body.projectId.trim())
			? body.projectId.trim()
			: undefined;

	if (body.skillIds !== undefined && (!Array.isArray(body.skillIds) || body.skillIds.some(id => typeof id !== 'string')))
		error(400, 'skillIds must be an array of skill ids');
	if (body.includeContent !== undefined && typeof body.includeContent !== 'boolean')
		error(400, 'includeContent must be a boolean');
	return json(getServices().skillCatalog.syncSkills(installed, client, projectId, {
		skillIds: body.skillIds as string[] | undefined,
		includeContent: body.includeContent as boolean | undefined
	}));
};
