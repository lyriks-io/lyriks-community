import { getServices } from '$composition/container.server';
import { sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * Foundation is the single page for product identity, definition and
 * operations. The persistence stores remain separate during migration, but
 * that split is never presented as separate capabilities.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change. Every Foundation slice save
	// lands on the one `foundation` topic (dotted slice keys collapse to it).
	depends(sectionSyncKey(params.projectId, 'foundation'));
	depends(sectionSyncKey(params.projectId, 'experience'));
	// The Business section links each pain point to real Users & Permissions
	// roles, so re-run this load when that section changes (a role renamed or
	// created elsewhere shows up in the picker).
	depends(sectionSyncKey(params.projectId, 'users'));
	const services = getServices();
	const [
		draft,
		definitionDraft,
		operationsDraft,
		experienceDraft,
		usersDraft,
		revision,
		definitionRevision,
		operationsRevision,
	] = await Promise.all([
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.loadFoundationDraft.loadDefinition(params.projectId),
		services.loadFoundationDraft.loadOperations(params.projectId),
		services.loadExperienceDraft.execute(params.projectId),
		services.loadUsersDraft.execute(params.projectId),
		services.draftLock.current(params.projectId, 'foundation.identity'),
		services.draftLock.current(params.projectId, 'foundation.definition'),
		services.sectionDocuments.currentRevision(params.projectId, 'foundation.operations')
	]);
	// Read-only projection of the shared personas for the pain-point picker.
	const usersRoles = usersDraft.roles.map((r) => ({ id: r.id, name: r.name, tone: r.tone }));
	const session = services.currentSession();
	// A page GET never registers or mirrors to the back — that happens on the
	// explicit section save (POST /api/draft/*). Loading a project must not create
	// or re-register a back project (see MR 2: stable project identity).
	// The Ops tab's UI-states sub-section describes states per Experience screen;
	// pass the screen library's names (empty until Experience declares screens).
	const operationsScreens = experienceDraft.screens
		.map((s) => s.name.trim())
		.filter(Boolean)
		.sort();
	return {
		draft,
		definitionDraft,
		operationsDraft,
		operationsScreens,
		usersRoles,
		session,
		revision,
		definitionRevision,
		operationsRevision
	};
};
