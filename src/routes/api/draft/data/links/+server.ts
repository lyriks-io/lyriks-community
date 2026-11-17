import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The data model's fields with the behaviour states that carry them, for an AI
 * client linking the model as it captures it: `?projectId&table&unlinked=1
 * &offset&limit`. Each unlinked field comes with the states that could hold it.
 */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const int = (name: string) => {
		const value = Number(params.get(name));
		return Number.isInteger(value) && value >= 0 ? value : undefined;
	};
	const reading = await event.locals.services.readDataLinks.read(projectId, {
		...(params.get('table') ? { table: params.get('table')! } : {}),
		unlinkedOnly: params.get('unlinked') === '1' || params.get('unlinked') === 'true',
		...(int('offset') !== undefined ? { offset: int('offset') } : {}),
		...(int('limit') ? { limit: int('limit') } : {})
	});
	if (!reading) error(404, 'No data model yet.');
	return json(reading);
};

type LinkEntry = { table: string; field: string; statePath: string | null; also?: boolean };
type ExistenceEntry = { table: string; statePath: string | null };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
// Only an explicit null takes a link back: a missing path is a malformed row, never an unlink.
const hasPath = (row: Record<string, unknown>) => row.statePath === null || text(row.statePath) !== '';
const pathOrNull = (value: unknown) => (value === null ? null : text(value));

/**
 * Link many fields at once by table and field names, and name the state that
 * says a record of a table exists. Body: `{ projectId, links: [{ table, field,
 * statePath | null, also? }], existence?: [{ table, statePath | null }] }`;
 * `also` makes the state a further carrier of the field (criterion 3238573b). The links
 * are recorded as made by an AI client; each one refused says why, the others
 * still apply, and the answer says how the solver's rules moved.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = text(body?.projectId);
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	const rows = (key: string) => (Array.isArray(body?.[key]) ? (body[key] as Record<string, unknown>[]) : []);
	const links: LinkEntry[] = rows('links')
		.filter((row) => text(row.table) && text(row.field) && hasPath(row))
		.map((row) => ({ table: text(row.table), field: text(row.field), statePath: pathOrNull(row.statePath), ...(row.also === true ? { also: true } : {}) }));
	const existence: ExistenceEntry[] = rows('existence')
		.filter((row) => text(row.table) && hasPath(row))
		.map((row) => ({ table: text(row.table), statePath: pathOrNull(row.statePath) }));
	if (links.length === 0 && existence.length === 0) error(400, 'links or existence is required');
	if (links.length + existence.length > 500) error(400, 'At most 500 links and existence states per call.');
	const result = await event.locals.services.tieDataField.linkByNames(projectId, { links, existence }, 'ai-client');
	if (!result.ok) return json({ ok: false, error: result.error }, { status: result.status });
	return json(result);
};
