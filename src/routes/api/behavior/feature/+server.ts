import { error, json } from '@sveltejs/kit';
import { resolveWalkTarget } from '$application/use-cases';
import { draftCriterionRows, isDraftLeafId, type ProjectEvolutionDraft } from '$domain/evolution';
import { UNSPA_FEATURE_FORMAT, UNSPA_VERSION } from '$lib/unspa-schema';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { featureStatements } from '$lib/unspa-schema/requirement-sentences';
import type { RequestHandler } from './$types';

/**
 * Full canonical feature snapshot, including every stable child id needed by
 * later batches. A draft an Evolution request carries reads the same way: the
 * feature its behaviour model would make, computed by the engine and never
 * stored, so a draft is authored and read with the tools a feature is.
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	const featureId = event.url.searchParams.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	const services = event.locals.services;
	if (isDraftLeafId(featureId)) {
		// A draft lives in an Evolution request: Community refuses it.
		requireEvolutionAccess(services);
		await requireProjectAccess(event, projectId, 'read');
		// The language the spec is written in: the sentences follow it, and every
		// AI client is told it so the prose it writes does too. A declared one is
		// read from the declaration alone; the features draft is read only when
		// nothing is declared, to warn.
		const [specLanguage, evolution] = await Promise.all([
			services.loadSpecLanguage.execute(projectId),
			services.loadEvolutionDraft.execute(projectId)
		]);
		const resolved = resolveWalkTarget(featureId, evolution, false);
		if (!resolved.ok) error(resolved.status, resolved.message);
		const target = resolved.target;
		if (target.kind !== 'draft') error(400, `${featureId} is not a draft`);
		const answer = await services.simulateBehavior.execute({
			target,
			args: { includeFeature: true }
		});
		if (!answer) error(503, 'The behavior engine did not answer; the draft could not be computed.');
		if (answer.kind === 'refused') error(409, answer.error);
		const walk = answer.walk as { ok?: unknown; errors?: unknown; feature?: unknown };
		if (walk.ok !== true || !walk.feature || typeof walk.feature !== 'object') {
			error(
				409,
				`The behaviour model of ${featureId} no longer applies: ${
					Array.isArray(walk.errors) ? walk.errors.join(' | ') : 'the engine returned no feature'
				}`
			);
		}
		const computed = walk.feature as Record<string, unknown>;
		const feature = {
			...computed,
			...(target.baseLeafId ? {} : { name: target.name }),
			...(target.model ? { updatedAt: target.model.updatedAt } : {}),
			// The criteria the draft carries, under the key its report reads
			// (`criterion:ac-leaf-<id>`), so a repository slicing its index by draft
			// sends the results that prove them (ac-evo-impl-held).
			acceptanceCriteria: [
				...(Array.isArray(computed.acceptanceCriteria) ? computed.acceptanceCriteria : []),
				...ownCriteria(evolution, target.draftId, (await services.loadFeaturesDraft.execute(projectId))?.leafMeta?.[target.draftId]?.acceptanceCriteria ?? [])
			]
		};
		return json({
			snapshot: {
				format: UNSPA_FEATURE_FORMAT,
				version: UNSPA_VERSION,
				// An added draft is computed over an empty feature the engine names
				// generically: it reads under the draft's name and model date instead.
				feature
			},
			// Every rule, statement and goal in EARS, every scenario in Given/When/Then,
			// keyed `<kind>:<id>`: derived from the logic, never stored.
			statements: featureStatements(feature, specLanguage.generated),
			specLanguage,
			draft: {
				requestId: target.requestId,
				draftId: target.draftId,
				over: target.baseLeafId ?? 'an empty feature',
				operations: target.model?.operations.length ?? 0,
				stored: false
			}
		});
	}

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const [snapshot, specLanguage] = await Promise.all([
		services.readBehaviorFeature.execute(projectId, featureId),
		services.loadSpecLanguage.execute(projectId)
	]);
	if (!snapshot) error(404, 'Behavior feature not found');
	return json({
		snapshot,
		statements: featureStatements(snapshot.feature, specLanguage.generated),
		specLanguage
	});
};

/** The criteria the draft itself carries, signed ones included, keyed the way its report reads them. */
function ownCriteria(evolution: ProjectEvolutionDraft | null, draftId: string, signed: readonly { readonly id: string; readonly text: string }[]) {
	const draft = evolution?.requests.flatMap((r) => r.drafts).find((d) => d.id === draftId);
	return draft ? draftCriterionRows(draft, signed) : [];
}
