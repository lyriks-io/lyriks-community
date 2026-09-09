import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import { hasGrant, type PermissionAction } from '$domain/users';
import { SCREEN_CAPABILITY_PREFIX } from '$application/projection/surface-capabilities';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * Server-side load: hydrate Step 05 with the persisted experience draft (its
 * read-only `derivedCores` already refreshed from Step 04 inside the use-case),
 * the Step 03 roles so journeys can name their actors, and the Step 01 identity
 * (product name + industry) so the chrome shows the real project — not a
 * hard-coded placeholder.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'experience'));
	depends(sectionSyncKey(params.projectId, 'users'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	depends(sectionSyncKey(params.projectId, 'data'));
	const services = getServices();
	// The coherence analysis belongs to the layout, which already runs it for the
	// rail rings; see the note in the features page load.
	const [draft, usersDraft, initDraft, dataDraft, derivedCaps, revision] =
		await Promise.all([
			services.loadExperienceDraft.execute(params.projectId),
			services.loadUsersDraft.execute(params.projectId),
			services.loadFoundationDraft.loadIdentity(params.projectId),
			services.loadDataDraft.execute(params.projectId),
			services.refreshDerivedCapabilities.execute(params.projectId),
			services.draftLock.current(params.projectId, 'experience')
		]);
	const roles = usersDraft.roles.map((r) => ({ id: r.id, name: r.name }));

	// Step-07 data model the simulator can import as fake-backend collections.
	const dataModel = { entities: dataDraft.entities, fields: dataDraft.fields };

	// Step-03 capability → granted-role catalog, used to prefill element persona
	// gates. Derived (feature/journey/surface) + off-structure capabilities, each
	// resolved to the roles that hold it via the sparse permission grants. A persona
	// gate is a visibility gate, so it maps to the `read` action: a role gates an
	// element in only if it can *read* the capability behind it (create/update/delete
	// stay matrix-only — they don't govern whether the element is visible).
	// `coreId` (a derived capability's `sourceRefId`) lets the simulator group a
	// screen's Core with every capability that belongs to it, so screen-area
	// access reflects any feature/journey the role can read — not just one.
	// Page rows carry `screenId` instead: they govern their own screen directly,
	// through the `view` verb, which is exactly what "Visible" means on a surface.
	const capabilityCatalog: {
		id: string;
		label: string;
		source: string;
		coreId: string | null;
		screenId?: string;
		action?: PermissionAction;
	}[] = [
		...derivedCaps.features.map((c) => ({
			id: c.id,
			label: c.label,
			source: 'feature',
			coreId: c.sourceRefId
		})),
		...derivedCaps.journeys.map((c) => ({
			id: c.id,
			label: c.label,
			source: 'journey',
			coreId: c.sourceRefId
		})),
		...derivedCaps.surfaces
			.filter((c) => c.surfaceKind === 'page')
			.map((c) => ({
				id: c.id,
				label: c.label,
				source: 'surface',
				coreId: c.sourceRefId || null,
				screenId: c.id.slice(SCREEN_CAPABILITY_PREFIX.length),
				action: 'view' as const
			})),
		...usersDraft.offStructureCapabilities.map((c) => ({
			id: c.id,
			label: c.label,
			source: 'off_structure',
			coreId: null
		}))
	];
	const capabilityAccess = capabilityCatalog.map((cap) => ({
		...cap,
		roleIds: usersDraft.roles
			.filter((r) => hasGrant(usersDraft.permissions, r.id, cap.id, cap.action ?? 'read'))
			.map((r) => r.id)
	}));
	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel =
		industryLabelOf(initDraft.industry);
	const session = services.currentSession();
	const behaviorWorkspaceRoot = services.behaviorWorkspaceRoot();
	return {
		draft,
		roles,
		productName,
		industryLabel,
		session,
		behaviorWorkspaceRoot,
		formFactors: initDraft.formFactors,
		dataModel,
		capabilityAccess,
		revision
	};
};
