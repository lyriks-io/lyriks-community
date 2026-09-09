import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { InstalledSkillRef, SkillClientId } from '$application/ports';
import type { RequestHandler } from './$types';

const CLIENT_IDS: readonly SkillClientId[] = ['claude', 'codex', 'gemini', 'copilot', 'generic'];

/**
 * Reconcile a client's installed authoring skills with the bundled catalog.
 * Body: `{ installed: [{ id, contentHash? }], client?: "claude" | "codex" |
 * "gemini" | "copilot" | "generic" }` (empty/missing installed = fresh machine
 * — everything comes back "new"; missing client = every layout comes back and
 * the agent picks its own). Response: per published skill its status
 * ("up-to-date" | "update" | "new"), the install layouts, and `installContent`
 * only when there is something to (re)write, plus `unknown` for reported ids
 * this server does not publish (left alone — they belong to someone else).
 * Read-only diff — like the other skill reads it rides the global auth wall.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		installed?: unknown;
		client?: unknown;
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

	return json(getServices().skillCatalog.syncSkills(installed, client));
};
