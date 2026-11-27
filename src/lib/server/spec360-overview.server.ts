import { timedPart } from './slow-requests.server';
import type { AppServices } from '$composition/container.server';
import { withCarriedGrants } from '$application/specification/capability-registry';
import { noticedSummary, noticedView } from '$application/spec360/noticed';
import { scopeBoundaryView } from '$application/spec360/scope-boundary';
import { accessCount, permissionMatrix } from '$application/spec360/users';
import { fixToConfirmFindings, keptIssueFindings, type Finding } from '$domain/retrospec';
import { readGlance } from './spec360-read.server';

/**
 * Every point Lyriks noticed with where the decision on it stands (criteria
 * 4189e074, e0f69b3c): the open ones the spec's reading lists, the issues
 * rejected from the list, each against the requests that settle it, and the
 * fixes waiting for confirmation apart (criterion 2a55c3e7).
 */
async function readNoticedView(services: AppServices, projectId: string, open: readonly Finding[]) {
	const [rules, features, experience, documents, evolution] = await Promise.all([
		services.loadRulesDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadDocumentRegister.execute(projectId),
		services.loadEvolutionDraft.execute(projectId).catch(() => null)
	]);
	// A product with no feature has nothing the checks can stand on: they read nothing yet (criterion 01761816).
	const hasFeature = features.features.length > 0;
	const issues = { rules, features, experience, sources: documents.sources };
	const view = noticedView({
		open: hasFeature ? open : [],
		kept: hasFeature ? keptIssueFindings(issues) : [],
		// The fixes waiting for confirmation, apart from the points (criterion 2a55c3e7).
		toConfirm: hasFeature ? fixToConfirmFindings(issues) : [],
		requests: evolution?.requests ?? [],
		projectId
	});
	return { ...view, waitsForFeature: !hasFeature };
}

/**
 * The points still to review, as the Overview counts them and Notices lists
 * them first: what the Reverse page shows under What Lyriks noticed
 * (criterion 1b4a3935), so its count is the Overview's.
 */
export async function readNoticedToReview(services: AppServices, projectId: string, open: readonly Finding[]): Promise<Finding[]> {
	const view = await readNoticedView(services, projectId, open);
	return view.points.filter((p) => p.state === 'pending').map((p) => p.finding);
}

/**
 * The page What Lyriks noticed (criterion 55a7fe86): every point with its
 * decision, and whether the project's first reading of its health is still
 * being taken.
 */
export async function readNoticed(services: AppServices, projectId: string) {
	const glance = await readGlance(services, projectId);
	const noticed = await readNoticedView(services, projectId, glance.noticed);
	// The score and what weighs on it are one page (criterion 4dadd4b8); before the first feature neither reads (criterion 01761816).
	return { noticed, health: noticed.waitsForFeature ? null : glance.health, healthReading: glance.healthReading && !noticed.waitsForFeature };
}

/**
 * The Overview of the Specification 360°: At a glance's reading of the spec
 * (the product, why it exists, what it does, who uses it), with what the
 * design adds on top of it: how many actions each user can perform, the
 * summary of What Lyriks noticed (its list has a page of its own, criterion
 * 55a7fe86). The Reverse-Specifications of the product are the Reverse
 * page's (criterion 2dbed801).
 */
export async function readOverview(services: AppServices, projectId: string) {
	const [glance, users, derived, scope] = await Promise.all([
		timedPart('overview:glance', readGlance(services, projectId)),
		timedPart('overview:users', services.loadUsersDraft.execute(projectId)),
		timedPart('overview:derived', services.refreshDerivedCapabilities.execute(projectId)),
		timedPart('overview:scope', services.loadScopeDraft.execute(projectId))
	]);
	const view = await timedPart('overview:noticed', readNoticedView(services, projectId, glance.noticed));
	const noticed = { ...noticedSummary(view), waitsForFeature: view.waitsForFeature };
	// Counted as Users counts it (criteria 90232fe6, 4146848b): the actions of the matrix the user holds a right on.
	const groups = permissionMatrix(withCarriedGrants(users, derived), derived.features);
	const reach = Object.fromEntries(users.roles.map((r) => [r.id, accessCount(groups, (row) => row.roleIds.includes(r.id)).granted]));
	// The points themselves are the page What Lyriks noticed's: the Overview carries their summary alone.
	return {
		// Before the first feature no score is drawn either: the figure says it is not measured yet (criterion 01761816).
		glance: { ...glance, noticed: [], ...(view.waitsForFeature ? { health: null, healthReading: false } : {}) },
		noticed,
		reach,
		// Where the specification stops (criteria 3b04797c, 9424a65d): null leaves the frame out.
		scope: scopeBoundaryView(scope)
	};
}
