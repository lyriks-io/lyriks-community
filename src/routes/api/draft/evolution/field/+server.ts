import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { readDossierField, saveDossierField } from '$application/use-cases/save-dossier-field';
import { fieldKey } from '$domain/evolution';
import type { RequestHandler } from './$types';

/**
 * Read and write ONE field of the evolution dossier, in the section that owns it.
 *
 * The dossier keeps no copy of any specification value, so the page reads
 * through here and writes back through here. A refusal carries the reason the
 * specification wrote, and leaves the owning section exactly as it was.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'a JSON body is required');
	const input = body as Record<string, unknown>;
	const projectId = str(input.projectId);
	if (!projectId) error(400, 'projectId is required');
	// The dossier applies the permission of the OWNING section, so a reader who
	// may not write there is refused here, before anything is touched.
	await requireProjectAccess(event, projectId, input.op === 'read' ? 'read' : 'write');

	const services = getServices();
	const draft = await services.loadFeaturesDraft.execute(projectId);

	// Reading is a plain lookup; nothing is written and nothing can be refused.
	if (input.op === 'read') {
		const leafIds = Array.isArray(input.leafIds)
			? input.leafIds.filter((v): v is string => typeof v === 'string')
			: [];
		const values: Record<string, { value: string; sourceIds: string[] }> = {};
		for (const leafId of leafIds) {
			for (const fieldPath of Array.isArray(input.fieldPaths) ? input.fieldPaths : []) {
				if (typeof fieldPath !== 'string') continue;
				values[`${fieldPath}@${leafId}`] = readDossierField(draft, fieldPath, leafId);
			}
		}
		return json({ values });
	}

	const result = saveDossierField(draft, {
		fieldPath: str(input.fieldPath),
		leafId: typeof input.leafId === 'string' && input.leafId !== '' ? input.leafId : null,
		value: str(input.value),
		sourceIds: Array.isArray(input.sourceIds)
			? input.sourceIds.filter((v): v is string => typeof v === 'string')
			: undefined,
		// The access check above already refused a caller who may not write in the
		// owning section, so reaching here means the right is genuinely held.
		canWriteCanonical: true
	});

	if (result.status === 'refused') {
		return json({ status: 'refused', reason: result.reason, detail: result.detail }, { status: 200 });
	}

	const saved = await services.saveFeaturesDraft.execute(result.draft);
	// Typed on a dossier: the value is the request's own answer, not one the
	// feature already held (2a9716f2). The dossier keeps the key, never the value.
	const requestId = str(input.requestId);
	if (requestId) await markAnswered(services, projectId, requestId, fieldKey(str(input.fieldPath), str(input.leafId) || null));
	return json({ status: 'accepted', path: result.path, savedAt: saved?.savedAt ?? null });
};

async function markAnswered(
	services: ReturnType<typeof getServices>,
	projectId: string,
	requestId: string,
	key: string
): Promise<void> {
	const [evolution, revision] = await Promise.all([
		services.loadEvolutionDraft.execute(projectId),
		services.sectionDocuments.currentRevision(projectId, 'evolution')
	]);
	const request = evolution?.requests.find((r) => r.id === requestId);
	if (!evolution || !request || request.answeredKeys.includes(key)) return;
	// Under the revision it was read at: a concurrent write wins, and the answer
	// is then simply not counted as the request's own, which errs on the side of
	// calling it inherited rather than inventing a decision.
	await services.saveEvolutionDraft.execute(
		{
			...evolution,
			requests: evolution.requests.map((r) => (r.id === requestId ? { ...r, answeredKeys: [...r.answeredKeys, key] } : r))
		},
		{ expectedRevision: revision, origin: null }
	);
};
