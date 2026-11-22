import { error } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { loadEvolutionView } from '$lib/server/evolution-view.server';
import { readDraftFeature, readStoredFeature } from '$lib/server/evolution-graph.server';
import { asBuilt, builtCriteria, findRequestByRef, isTestRunner, pendingDraftFor, TESTS_NOT_PUT_TOGETHER, touchedLeafIds, type TestKitFeature } from '$domain/evolution';
import { mapLimit } from '$lib/shared/map-limit';
import type { RequestHandler } from './$types';

/**
 * The tests of a request's frozen version, as one archive to download
 * (ac-evo-impl-test-kit, -runner).
 *
 * `GET /api/evolution/tests?projectId=<id>&requestId=<id>&runner=vitest|node`
 *
 * Each touched feature is read as the version makes it: the draft's feature
 * while the change is not official, the feature itself once it landed. A
 * removed feature has nothing left to test. Reading is enough to take them.
 * A draft the engine did not answer for makes no archive, empty or partial:
 * the answer is 503 with the reason (rule b10172f4).
 */
export const GET: RequestHandler = async (event) => {
	requireEvolutionAccess(event.locals.services);
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const requestRef = params.get('requestId') ?? '';
	const runner = params.get('runner') ?? 'vitest';
	if (!projectId || !requestRef) error(400, 'projectId and requestId are required');
	if (!isTestRunner(runner)) error(400, `unknown runner "${runner}". Valid: vitest, node`);
	await requireProjectAccess(event, projectId, 'read');

	const services = event.locals.services;
	const view = await loadEvolutionView(services, projectId);
	const lookup = findRequestByRef(view.draft.requests.filter((r) => r.status !== 'deleted'), requestRef);
	if (lookup.kind !== 'found') error(404, `No request "${requestRef}" on this project.`);
	// While version N+1 is in correction the tests are version N's, the version the code is built against (EVO-012, criterion 3baf05de).
	const request = asBuilt(lookup.request);
	const evolution = request === lookup.request ? view.draft : { ...view.draft, requests: view.draft.requests.map((r) => (r.id === request.id ? request : r)) };
	if (request.specVersion <= 0) error(409, 'Freeze a version first: its tests are what the code is built against.');

	const features = (
		await mapLimit([...touchedLeafIds(request)], 2, async (id): Promise<TestKitFeature | null> => {
			const draft = pendingDraftFor(request, id);
			if (draft?.kind === 'remove') return null;
			const reading = draft ? await readDraftFeature(services, evolution, draft.id) : await readStoredFeature(services, projectId, id);
			if (reading.status === 'unanswered') error(503, TESTS_NOT_PUT_TOGETHER);
			const snapshot = 'feature' in reading ? reading.feature : null;
			const own = Array.isArray(snapshot?.acceptanceCriteria) ? (snapshot.acceptanceCriteria as Record<string, unknown>[]) : [];
			const carried = draft
				? [...draft.acceptanceCriteria, ...builtCriteria(lookup.request, draft.id, view.features.leafMeta?.[draft.id]?.acceptanceCriteria ?? [])].map((c) => ({ id: `ac-leaf-${c.id}`, text: c.text }))
				: [];
			const criteria = [
				...own.map((c) => ({ id: String(c.id ?? ''), text: String(c.title ?? c.description ?? '') })),
				...carried
			].filter((c, i, all) => c.id !== '' && all.findIndex((o) => o.id === c.id) === i);
			const name = draft?.name || view.leaves.find((l) => l.id === id)?.name || (typeof snapshot?.name === 'string' ? snapshot.name : id);
			return { id, name, snapshot, criteria };
		})
	).filter((f): f is TestKitFeature => f !== null);

	const kit = services.packEvolutionTestKit.execute({ requestTitle: request.title, specVersion: request.specVersion, runner, features });
	const slug = (request.title || 'request').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'request';
	const body = new Uint8Array(kit.bytes.byteLength);
	body.set(kit.bytes);
	return new Response(body, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${slug}-v${request.specVersion}-${runner}-tests.zip"`,
			'cache-control': 'no-store'
		}
	});
};
