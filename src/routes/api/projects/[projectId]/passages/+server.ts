import { error, json } from '@sveltejs/kit';
import { passagesOf, type PassageInput } from '$domain/documents';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { analysisSpansAsPassages, citeSourcePassages, storedTextOf } from '$lib/server/source-passages.server';
import type { RequestHandler } from './$types';

/**
 * The passages the elements of a project rest on (criterion f09da92d of
 * feat-source-register), the MCP's cite_passages.
 *
 *   GET  `?sourceId=&anchor=` → the source's stored text and the passages of
 *        that element in it, for the reader that highlights them.
 *   POST `{ passages: [{ sourceId, anchor, words, takes }] }` → each placed in
 *        the source's stored text by the server; `refused` names the ones it
 *        could not place, and why.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const sourceId = event.url.searchParams.get('sourceId') ?? '';
	const anchor = event.url.searchParams.get('anchor') ?? '';
	if (!sourceId) error(400, 'sourceId is required');
	const services = event.locals.services;
	const register = await services.loadDocumentRegister.execute(projectId);
	const source = register.sources.find((s) => s.id === sourceId);
	if (!source) error(404, 'No source of the register has this id.');
	const text = source.stored ? await storedTextOf(services, source.stored.id) : null;
	const cited = (anchor ? passagesOf(register, anchor) : (register.passages ?? [])).filter((p) => p.sourceId === sourceId);
	// The spans the analysis recorded for a behaviour element in the same text read beside them.
	const traced = anchor && source.stored && text !== null ? await analysisSpansAsPassages(services, projectId, anchor, sourceId, source.stored.id) : [];
	const passages = [...cited, ...traced.filter((t) => !cited.some((c) => c.start === t.start && c.end === t.end))].sort((a, b) => a.start - b.start);
	// A stored text that can no longer be read is said, never silently replaced by the note.
	return json({ sourceId, stored: !!source.stored, textMissing: !!source.stored && text === null, text, passages });
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const body = (await event.request.json().catch(() => null)) as { passages?: unknown } | null;
	if (!Array.isArray(body?.passages) || body.passages.length === 0) error(400, 'passages is required: [{ sourceId, anchor, words, takes }]');
	const str = (v: unknown) => (typeof v === 'string' ? v : '');
	const inputs: PassageInput[] = body.passages.map((raw) => {
		const p = (raw ?? {}) as Record<string, unknown>;
		return { sourceId: str(p.sourceId), anchor: str(p.anchor), words: str(p.words), takes: str(p.takes) };
	});
	const outcome = await citeSourcePassages(services, projectId, inputs, event.request.headers.get('x-lyriks-client'));
	if (!outcome.ok) error(409, outcome.reason);
	return json({
		ok: outcome.refused.length === 0,
		recorded: outcome.recorded.map((p) => ({ id: p.id, sourceId: p.sourceId, anchor: p.anchor, start: p.start, end: p.end })),
		refused: outcome.refused.map((r) => ({ sourceId: r.input.sourceId, anchor: r.input.anchor, words: r.input.words.slice(0, 120), reason: r.reason }))
	});
};
