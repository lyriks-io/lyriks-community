import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { persistFeaturesDraft } from '$lib/server/features-write.server';
import { guardSectionWrite } from '$lib/server/section-save.server';
import { parseRoadmapOperations } from '$application/parse-roadmap-operations';
import type { FeatureImplementationCoverage } from '$application/use-cases';
import {
	applyRoadmapOperations,
	featuresOfRelease,
	implementationDrift,
	leafFeatures,
	releaseLifecycle,
	releaseProgress,
	RoadmapOperationError,
	sprintItems,
	sprintLifecycle,
	sprintProgress,
	workItemLabel,
	workItemStatus,
	type ProjectFeaturesDraft
} from '$domain/features';
import type { RequestHandler } from './$types';

/**
 * The roadmap as ONE aggregate: releases and sprints with their derived
 * lifecycle and progress, every feature with its status and implementation
 * coverage, and the backlog. What the Roadmap tab derives locally, readable
 * (GET) and drivable (POST typed operations) in single calls, so an MCP client
 * manages the roadmap without recomputing the dashboard's rules from a raw
 * section document.
 */

function featureRow(
	draft: ProjectFeaturesDraft,
	featureId: string,
	coverage: Readonly<Record<string, FeatureImplementationCoverage>>
) {
	const feature = draft.features.find((f) => f.id === featureId);
	const status = draft.leafMeta?.[featureId]?.status ?? 'backlog';
	const cov = coverage[featureId];
	const implementation = cov
		? {
				percent: cov.percent,
				found: cov.found,
				expected: cov.expected,
				updatedAt: cov.updatedAt,
				specUpdatedAt: cov.specUpdatedAt
			}
		: null;
	// Three honest disagreement signals between the claim (status) and the
	// evidence (coverage). The reconcile endpoint clears the "code-complete"
	// kind; a re-sync from the implementation repo clears "spec-moved".
	const drift = !cov
		? null
		: implementationDrift({
				status,
				found: cov.found,
				expected: cov.expected,
				syncedAt: cov.updatedAt,
				specUpdatedAt: cov.specUpdatedAt
			});
	return { id: featureId, name: feature?.name ?? '', status, implementation, drift };
}

export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');

	const services = getServices();
	const draft = await services.loadFeaturesDraft.execute(projectId);
	const coverage = await services.implementationCoverage.get(projectId);

	const releases = [...draft.releases]
		.sort((a, b) => a.order - b.order)
		.map((rel) => ({
			id: rel.id,
			version: rel.version,
			name: rel.name,
			description: rel.description,
			weekStart: rel.weekStart,
			weekEnd: rel.weekEnd,
			order: rel.order,
			archivedAt: rel.archivedAt ?? null,
			lifecycle: releaseLifecycle(draft, rel),
			progress: releaseProgress(draft, rel.id),
			features: featuresOfRelease(draft, rel.id).map((f) => featureRow(draft, f.id, coverage))
		}));

	const sprints = [...(draft.sprints ?? [])]
		.sort((a, b) => a.order - b.order)
		.map((sprint) => ({
			id: sprint.id,
			name: sprint.name,
			startDate: sprint.startDate ?? null,
			endDate: sprint.endDate ?? null,
			order: sprint.order,
			archivedAt: sprint.archivedAt ?? null,
			lifecycle: sprintLifecycle(draft, sprint),
			progress: sprintProgress(draft, sprint.id),
			items: sprintItems(draft, sprint.id).map((a) => ({
				id: a.id,
				kind: a.kind,
				label: workItemLabel(draft, a),
				...(a.coreId ? { coreId: a.coreId } : {}),
				...(a.featureId ? { featureId: a.featureId } : {}),
				...(a.actionId ? { actionId: a.actionId } : {}),
				assigneeId: a.assigneeId,
				status: workItemStatus(draft, a)
			}))
		}));

	const scheduled = new Set(draft.roadmapAssignments.map((r) => r.featureId));
	const backlog = leafFeatures(draft)
		.filter((f) => !scheduled.has(f.id))
		.map((f) => featureRow(draft, f.id, coverage));

	return json({
		projectId,
		releases,
		sprints,
		backlog,
		semantics: {
			lifecycle:
				'planned/in-progress/done are DERIVED from feature and item statuses; archived is the explicit stamp (archive_release / archive_sprint) that pins a done release or sprint in history.',
			implementation:
				'Coverage comes from the last code-adoption sync (sync_implementation_index). Statuses upgrade automatically after a sync; POST /api/behavior/implementation/reconcile re-runs that alignment on demand.',
			write: 'POST { projectId, operations: [...] } here to change the roadmap; see apply_roadmap_batch.'
		}
	});
};

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		operations?: unknown;
	} | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');

	const parsed = parseRoadmapOperations(body?.operations);
	if (!parsed.ok) error(400, `invalid_roadmap_operations: ${parsed.issues.join('; ')}`);

	const services = getServices();
	const draft = await services.loadFeaturesDraft.execute(projectId);
	let results;
	try {
		results = applyRoadmapOperations(draft, parsed.operations, new Date().toISOString());
	} catch (e) {
		if (e instanceof RoadmapOperationError) error(400, e.message);
		throw e;
	}
	// Atomic: nothing persists unless every operation applied.
	await guardSectionWrite('features', () => persistFeaturesDraft(draft));
	return json({ ok: true, results });
};
