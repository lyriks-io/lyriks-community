import { error, json } from '@sveltejs/kit';
import { unitsReplacedBy } from '$domain/implementation';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { SEED_SYNCED, adoptionBody, seedAnswerInLyriksTerms } from '$lib/server/adoption-endpoint.server';
import { holdDraftEntries } from '$lib/server/evolution-held-index.server';
import { rebuildReportsAfterSync } from '$lib/server/evolution-auto-report.server';
import { expectedRevisionOf, guardedIndexWrite } from '$lib/server/implementation-index-write.server';
import type { BehavioralIndexPayload } from '$application/ports';
import type { RequestEvent, RequestHandler } from './$types';

/**
 * The spec↔code map — `.unspa.json`'s `index`, which lives in the CALLER's
 * checkout, not here.
 *
 * That split is the whole design. The agent holds the filesystem and the
 * platform holds the spec, so `GET` hands back entries for the agent to write,
 * and `POST` takes the agent's index back to resolve it against the spec. The
 * platform stores no copy: one index, in the repo, versioned with the code it
 * describes.
 */

/**
 * Seed index entries from a finalized analysis — every code span becomes an
 * entry with `{file, line, signature}` and a stamped `specVersion`, which is
 * what arms drift detection. Returns them; writes nothing anywhere.
 */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const result = await event.locals.services.codeAdoption.seedIndexFromAnalysis(featureId, {
		overwrite: params.get('overwrite') === 'true'
	});
	if (result === null) error(503, 'Behavior engine unavailable');
	if (!result.ok) return json({ available: true, ok: false, error: result.error });
	const seeded = seedAnswerInLyriksTerms(result.value);
	if (params.get('sync') !== 'true') return json({ available: true, ok: true, ...seeded });
	// The coverage lands from the spans the engine already holds, so a client
	// that cannot run a script (Claude Cowork) retypes nothing (criterion 5f704119).
	await requireProjectAccess(event, projectId, 'write');
	const entries = seeded.entries && typeof seeded.entries === 'object' ? (seeded.entries as BehavioralIndexPayload) : {};
	if (Object.keys(entries).length === 0) {
		return json({ available: true, ok: true, ...seeded, synced: { ok: false, error: 'Nothing was seeded, so nothing was synced.' }, semantics: { ...(seeded.semantics as object), synced: SEED_SYNCED } });
	}
	// A seed that lands is a sync like any other: it takes its turn and answers its revision.
	return guardedIndexWrite(event.locals.services, projectId, unitsReplacedBy(Object.keys(entries)), null, async () => {
		const landed = await landIndex(event, projectId, entries);
		return {
			written: landed?.ok ? unitsReplacedBy(Object.keys(entries)) : null,
			value: {
				available: true,
				ok: true,
				...seeded,
				synced: landed?.ok ? landed.value : { ok: false, error: landed === null ? 'Behavior engine unavailable' : landed.error },
				semantics: { ...(seeded.semantics as object), synced: SEED_SYNCED }
			}
		};
	});
};

/**
 * Sync coverage from the caller's index: the engine resolves every key against
 * the spec and reports status for each action and surface in one pass.
 *
 * Project-scoped rather than feature-scoped because one index covers all of a
 * project's features (ids are unique system-wide, so it is never partitioned).
 * The answer carries the revision of the project's index; a sync naming an
 * older `expectedRevision` is refused where a write since then replaced one of
 * the units it sends (rule bedac77e).
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		index?: unknown;
		expectedRevision?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	if (!body?.index || typeof body.index !== 'object' || Array.isArray(body.index)) {
		error(400, 'index must be an object keyed by "<type>:<id>"');
	}
	const expected = expectedRevisionOf(body.expectedRevision);

	await requireProjectAccess(event, projectId, 'write');
	const index = body.index as BehavioralIndexPayload;
	const units = unitsReplacedBy(Object.keys(index));
	return guardedIndexWrite(event.locals.services, projectId, units, expected, async () => {
		const landed = await landIndex(event, projectId, index);
		return { written: landed?.ok ? units : null, value: adoptionBody(landed) };
	});
};

/**
 * Sync an index and everything a landed sync moves: the cached coverage is
 * recomputed now instead of waiting out its TTL, what names a change not
 * official yet is held on its request instead of lost as an orphan, and the
 * reports of the requests at Build follow it on their own.
 */
async function landIndex(event: RequestEvent, projectId: string, index: BehavioralIndexPayload) {
	const services = event.locals.services;
	const result = await services.codeAdoption.syncImplementationIndex(projectId, index);
	if (!result?.ok) return result;
	services.implementationCoverage.invalidate(projectId);
	const value = await holdDraftEntries(services, projectId, index, result.value);
	await rebuildReportsAfterSync(services, event, projectId);
	return { ...result, value };
}
