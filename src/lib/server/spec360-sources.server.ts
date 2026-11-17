import type { AppServices } from '$composition/container.server';
import { specSources, type SpecSources } from '$application/spec360/sources';

/**
 * What each block of the specification rests on (criterion b0ea9889), read
 * from the sections that cite and the implementation coverage. Shared by the
 * Specification 360° layout, which keeps each block's own sources, and the
 * Sources page, which alone reads the blocks citing each source.
 */
export async function readSpecSources(services: AppServices, projectId: string): Promise<SpecSources> {
	const [features, users, glossary, foundation, architecture, data, coverage, experience] = await Promise.all([
		services.loadFeaturesDraft.execute(projectId),
		services.loadUsersDraft.execute(projectId),
		services.loadGlossaryDraft.execute(projectId),
		services.loadFoundationDraft.execute(projectId),
		services.loadArchitectureDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		// The places in the code each behaviour element was located at: an instant read of the cache.
		services.implementationCoverage.get(projectId).catch(() => ({})),
		services.loadExperienceDraft.execute(projectId)
	]);
	return specSources(projectId, {
		features,
		identity: foundation.identity,
		experience: { brand: experience.brand, journeys: experience.journeys },
		roles: users.roles,
		terms: glossary.terms,
		definition: foundation.definition,
		architecture,
		tables: data.entities,
		coverage
	});
}
