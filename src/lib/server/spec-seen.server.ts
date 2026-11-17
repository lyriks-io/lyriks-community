import type { AppServices } from '$composition/container.server';
import { parseSpecSeen, type SpecSeen } from '$application/spec360/spec-news';

/**
 * When one reader last opened each feature of a project's Specification 360°
 * (criterion b0950115): a residue document per person, apart from the spec, so
 * opening a feature takes its New or Changed badge off for them alone.
 */
const seenSection = (personId: string) => `spec-seen:${personId}`;

export async function loadSpecSeen(services: AppServices, projectId: string, personId: string): Promise<SpecSeen> {
	return parseSpecSeen(await services.projectResidue.load(projectId, seenSection(personId)).catch(() => null));
}

/** Marks those features opened now by that reader. */
export async function markSpecSeen(services: AppServices, projectId: string, personId: string, ids: readonly string[], at: string): Promise<SpecSeen> {
	const seen = { ...(await loadSpecSeen(services, projectId, personId)), ...Object.fromEntries(ids.map((id) => [id, at])) };
	await services.projectResidue.save(projectId, seenSection(personId), { seen });
	return seen;
}
