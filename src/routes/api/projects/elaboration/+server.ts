import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { isSection } from '$lib/shared/sections';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const kind = params.get('kind') ?? 'all';
	if (!['all', 'question', 'action'].includes(kind)) error(400, 'kind must be all, question or action');
	const section = params.get('section');
	if (section !== null && !isSection(section)) error(400, 'Unknown section');
	const integer = (name: string, fallback: number, max: number) => {
		const value = params.has(name) ? Number(params.get(name)) : fallback;
		if (!Number.isSafeInteger(value) || value < 0 || value > max) error(400, `${name} is out of range`);
		return value;
	};
	const offset = integer('offset', 0, Number.MAX_SAFE_INTEGER);
	const limit = integer('limit', 10, 20);
	if (!limit) error(400, 'limit must be at least 1');
	const includeChecks = params.get('includeChecks');
	if (includeChecks !== null && !['true', 'false'].includes(includeChecks)) error(400, 'includeChecks must be true or false');
	const services = getServices();
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const report = await services.readProjectElaboration.execute(projectId, includeChecks === 'true');
	const expected = params.get('expectedSnapshot');
	if (expected && expected !== report.snapshot.key) error(409, 'Project changed since the previous page; restart from offset 0');
	const filtered = report.items.filter(item => (kind === 'all' || item.kind === kind) && (!section || item.section === section));
	const items = filtered.slice(offset, offset + limit);
	return json({ ...report, items, total: filtered.length, offset, nextOffset: offset + items.length < filtered.length ? offset + items.length : null });
};
