import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/** Server-side load: hydrate Step 03 with the persisted draft + live derived capabilities + Step 01 identity. */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change. Derived capabilities are
	// cross-section (features/experience), hence the project-wide key.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'users'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	const services = getServices();
	// The coherence analysis belongs to the layout, which already runs it for the
	// rail rings; see the note in the features page load.
	const [draft, derived, initDraft, revision] = await Promise.all([
		services.loadUsersDraft.execute(params.projectId),
		services.refreshDerivedCapabilities.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.draftLock.current(params.projectId, 'users')
	]);
	// Personas proposed by the AI seam (stub today; MCP advisor later).
	const personaSuggestions = await services.suggestPersonas.execute(initDraft.brief, initDraft);
	const session = services.currentSession();
	const behaviorWorkspaceRoot = services.behaviorWorkspaceRoot();
	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel =
		industryLabelOf(initDraft.industry);
	return {
		draft,
		derived,
		personaSuggestions,
		session,
		behaviorWorkspaceRoot,
		productName,
		industryLabel,
		revision
	};
};
