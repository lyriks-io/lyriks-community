import { timedPart } from '$lib/server/slow-requests.server';
import { canUseSharedEditor } from '$lib/server/shared-editor-access.server';
import { industryLabelOf } from '$domain/foundation';
import { toProductCoherence } from '$domain/coherence/incoherence';
import { leafFeatures } from '$domain/features';
import { administersProject } from '$domain/team';
import { maturityByCore, maturityByFeature } from '$domain/features';
import { capabilityById, CAPABILITIES, resolveVisibleCapability } from '$ui/shell/capabilities';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { callerCanWrite } from '$lib/server/writer-gate.server';
import { projectSyncKey } from '$lib/shared/section-sync';
import { rememberCurrentProject } from '$lib/server/app-chrome.server';
import { callerRoleInProjectWorkspace } from '$lib/server/caller-workspace.server';
import type { LayoutServerLoad } from './$types';

/**
 * Shared project chrome data: identity, the per-feature maturity the
 * Foundation page groups by core and release, and the product tier (for
 * capability gating). Loaded once for every capability page
 * so the shell stops being copy-pasted into each route.
 */
export const load: LayoutServerLoad = async (event) => {
	const { params } = event;
	// The chrome aggregates cross-section data (coherence rings, glossary terms,
	// feature scopes), so it re-runs on EVERY section change — the live-sync
	// client invalidates this project-wide key alongside the per-section one.
	event.depends(projectSyncKey(params.projectId));
	// Gate every project page on per-user access: workspace membership + the
	// per-project visibility scope (domain breadth ∪ collaborator grants). A project
	// outside scope 404s here — no-op when auth is off. See requireProjectAccess.
	await requireProjectAccess(event, params.projectId, 'read');
	// The app bar keeps pointing at this project from Home and Settings.
	rememberCurrentProject(event.cookies, params.projectId);
	// Whether the caller may author here: designer and above in the workspace that
	// owns the project, never the switcher's. The behavior editor is offered to
	// writers alone; the server refuses a reader, this keeps the tab honest.
	const canWrite = await timedPart('project:canWrite', callerCanWrite(event, params.projectId));
	const services = event.locals.services;

	// Read once, shared: the language reading checks its prose without a second read.
	const featuresRead = services.loadFeaturesDraft.execute(params.projectId);
	const [
		draft,
		coherence,
		team,
		featuresDraft,
		glossaryDraft,
		documentsDraft,
		documentsRevision,
		specLanguage
	] = await Promise.all([
			timedPart('project:identity', services.loadFoundationDraft.loadIdentity(params.projectId)),
			timedPart('project:coherence', services.loadCoherenceDraft.execute(params.projectId)),
			timedPart('project:team', services.loadTeam.execute(params.projectId)),
			featuresRead,
			timedPart('project:glossary', services.loadGlossaryDraft.execute(params.projectId)),
			// The evidence register is project-wide: every capability cites it and can
			// add to it, so it is loaded once here rather than per page.
			timedPart('project:documents', services.loadDocumentRegister.execute(params.projectId)),
			services.sectionDocuments.currentRevision(params.projectId, 'documents'),
			// The one language the spec is written in: every generated text follows
			// it. Its prose is read from the features loaded above, never twice.
			services.loadSpecLanguage.execute(params.projectId, featuresRead)
		]);

	// The governed vocabulary, exposed to every capability page so the in-context
	// Term Highlighting layer can mark governed words with a hover definition.
	// Only named terms are shipped; the client segments display text against them.
	const glossaryTerms = glossaryDraft.terms.filter((t) => t.term.trim().length > 0);

	// Leaf feature names — the scope options collaborators can be assigned to.
	const featureNames = leafFeatures(featuresDraft)
		.map((f) => f.name.trim())
		.filter((n) => n.length > 0);

	const industryLabel =
		industryLabelOf(draft.industry);

	// Bimodal deep coherence spanning the whole product. The gap list already
	// includes the Experience plan-coverage findings (folded in by the global
	// checker), so this single mapping is the one source of truth for the rail
	// fix routes and the maturity read below, so no screen drifts. Each gap's source step
	// resolves to the capability where it's fixed (legacy step ids map through
			// the registry, e.g. 'data' → infrastructure, legacy Foundation ids →
			// foundation).
	const fallback = capabilityById('coherence') ?? CAPABILITIES[0];
	const productCoherence = toProductCoherence(coherence.analysis, (sourceStep) => {
		const cap = capabilityById(sourceStep) ?? fallback;
		// The destination as the reader finds it in the left nav: a hidden
		// capability (Rules, Permissions) is named under the visible page it folds
		// into, so "Fix in Features › Acceptance criteria" reads like the sidebar.
		const visible = resolveVisibleCapability(cap.id);
		const capabilityTitle =
			visible && visible.id !== cap.id ? `${visible.title} › ${cap.title}` : cap.title;
		// A docked-panel capability has no page route; fall back to the project root.
		return {
			capabilityId: cap.id,
			capabilityTitle,
			fixRoute: cap.route?.(params.projectId) ?? `/projects/${params.projectId}`
		};
	});

	// Whether the reader may change the project's options, so the left nav shows
	// Settings to them alone (ac-proj-settings): their role in the workspace that
	// owns the project, never the one the switcher shows (no workspace in the
	// open-source build), or their ownership of the project.
	const projectRole = await timedPart('project:role', callerRoleInProjectWorkspace(services, params.projectId));
	const administers = administersProject(projectRole, team, services.currentSession().email);

	const featureMaturity = productCoherence.featureMaturity ?? {};
	const maturityBreakdown = {
		features: maturityByFeature(featuresDraft, featureMaturity),
		cores: maturityByCore(featuresDraft, featureMaturity)
	};

	return {
		projectId: params.projectId,
		canWrite,
		administers,
		canUseSharedEditor: canUseSharedEditor(event),
		team,
		featureNames,
		glossaryTerms,
		specLanguage,
		projectName: draft.productName.trim() || 'Untitled project',
		industryLabel,
		maturityBreakdown,
		tier: services.currentTier(),
		// Both platform and back address the shared kernel with this immutable id.
		dashboardProjectId: params.projectId,
		documentsDraft,
		documentsRevision
		// No `session` here: the root layout already publishes the caller's, and a
		// second copy from this layer used to shadow it with an identity-less one,
		// which is what made the shell greet everyone inside a project as "Developer".
	};
};
