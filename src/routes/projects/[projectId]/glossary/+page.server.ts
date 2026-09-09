import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * Server-side load: hydrate the Glossary with the persisted draft, the Step 01
 * identity for the chrome, and the upstream corpus (product name + brief) the
 * client mines for suggestions and scores glossary health against.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'glossary'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	const services = getServices();
	// The coherence analysis belongs to the layout, which already runs it for the
	// rail rings; see the note in the features page load.
	const [draft, initDraft, revision] = await Promise.all([
		services.loadGlossaryDraft.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.sectionDocuments.currentRevision(params.projectId, 'glossary')
	]);
	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel =
		industryLabelOf(initDraft.industry);
	const corpus = [initDraft.productName, initDraft.brief].filter(Boolean).join('\n\n');
	const session = services.currentSession();
	return {
		draft,
		productName,
		industryLabel,
		corpus,
		session,
		revision
	};
};
