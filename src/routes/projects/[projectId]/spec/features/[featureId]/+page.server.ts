import { error } from '@sveltejs/kit';
import type { ActionData } from '$application/spec360/action-data';
import { featureTables } from '$application/spec360/feature-tables';
import { PROJECT_HEALTH_SECTION, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readDataMap, readFeatureData, readFeatureFindings, readFeaturePage, readSourcedScreens } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/**
 * A core feature's page or a feature's page: ids are unique across both, so
 * one address serves either and a link never has to know which it names. A
 * feature's page reads the points Lyriks noticed about it and the data map,
 * drawn on the tables its states carry or its actions read and write, the
 * fields those actions use marked on it (criterion c72a7e79).
 */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	// The points the health reads on this feature land with a new reading alone.
	depends(sectionSyncKey(params.projectId, PROJECT_HEALTH_SECTION));
	const page = await readFeaturePage(locals.services, params.projectId, params.featureId);
	if (!page) error(404, 'This feature is not in the specification.');
	if (page.kind !== 'feature') return { page, tables: [], usedFields: [], actionData: {} as Record<string, ActionData>, sourcedScreens: 0, map: null, findings: [], journeys: [] };
	const [map, findings, touched, screens, journeys] = await Promise.all([
		readDataMap(locals.services, params.projectId),
		readFeatureFindings(locals.services, params.projectId, params.featureId),
		readFeatureData(locals.services, params.projectId, params.featureId),
		readSourcedScreens(locals.services, params.projectId, params.featureId),
		// The journeys its actions are arranged in, people's and suggestions alike (action f3bbf419).
		locals.services.loadActionJourneys.execute(params.projectId, params.featureId)
	]);
	// A feature uses the tables its states carry and the ones its actions read or write: the map draws those only.
	const own = map.tablesByFeature[params.featureId] ?? [];
	const tables = featureTables(map.data, [...own, ...touched.tables]);
	const ids = tables.map((t) => t.id);
	return {
		page,
		tables,
		usedFields: touched.fields,
		actionData: touched.actions,
		sourcedScreens: screens,
		map: {
			data: map.data,
			derivedVisibility: map.derivedVisibility,
			tablesByFeature: { ...map.tablesByFeature, [params.featureId]: ids },
			cores: map.outline.cores,
			placements: map.placements
		},
		findings,
		journeys
	};
};
