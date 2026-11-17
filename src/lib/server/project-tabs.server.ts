import type { AppServices } from '$composition/container.server';
import { projectTabs, type ProjectTabs } from '$domain/portfolio/project-tabs';
import type { RetrospecStatus } from '$domain/retrospec';
import { loadStartWay } from './project-start.server';
import { readSpecValidation } from './spec-validation.server';
import type { SpecValidationSummary } from '$domain/retrospec';

/**
 * The tabs the app bar opens for a project, read from how it was started, its
 * retrospecification, its specification and its validation, and how many
 * evolutions it has. The caller passes what it already read, the
 * specification's validation included when it read it for something else.
 */
export async function readProjectTabs(
	services: AppServices,
	projectId: string,
	retro: RetrospecStatus | null,
	evolutions: number,
	validation?: SpecValidationSummary | null
): Promise<ProjectTabs> {
	const [start, features, spec] = await Promise.all([
		loadStartWay(services, projectId),
		services.loadFeaturesDraft.execute(projectId).catch(() => null),
		validation !== undefined ? validation : readSpecValidation(services, projectId, null).catch(() => null)
	]);
	return projectTabs({
		start,
		retro: retro?.status ?? null,
		retroComplementary: retro?.complementary ?? false,
		hasSpec: (features?.features.length ?? 0) > 0,
		spec: spec?.state ?? null,
		specCount: spec ? { validated: spec.validated, total: spec.total } : null,
		evolutions
	});
}
