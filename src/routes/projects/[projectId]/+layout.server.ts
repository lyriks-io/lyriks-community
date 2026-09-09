import { canUseSharedEditor } from '$lib/server/shared-editor-access.server';
import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import { toProductCoherence } from '$domain/coherence/incoherence';
import { leafFeatures } from '$domain/features/tree';
import {
	maturityByCore,
	maturityByFeature,
	maturityByRelease
} from '$domain/features/trl-breakdown';
import { capabilityById, CAPABILITIES, resolveVisibleCapability } from '$ui/shell/capabilities';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { callerCanWrite } from '$lib/server/writer-gate.server';
import { loadVisitDelta } from '$lib/server/coherence-visit.server';
import { projectSyncKey } from '$lib/shared/section-sync';
import type { LayoutServerLoad } from './$types';

/**
 * Shared project chrome data: identity (for the sidebar header), the bimodal
 * readiness/coherence scores (for the rail rings + Control Center), and the
 * product tier (for capability gating). Loaded once for every capability page
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
	// Whether the caller may author here (designer and above). The embedded
	// behavior editor is only offered to writers; the server refuses a reader
	// on /behavior anyway, this keeps the tab honest instead of framing a 403.
	const canWrite = await callerCanWrite(event);
	const services = getServices();

	const [
		draft,
		coherence,
		team,
		featuresDraft,
		glossaryDraft,
		documentsDraft,
		documentsRevision
	] = await Promise.all([
			services.loadFoundationDraft.loadIdentity(params.projectId),
			services.loadCoherenceDraft.execute(params.projectId),
			services.loadTeam.execute(params.projectId),
			services.loadFeaturesDraft.execute(params.projectId),
			services.loadGlossaryDraft.execute(params.projectId),
			// The evidence register is project-wide: every capability cites it and can
			// add to it, so it is loaded once here rather than per page.
			services.loadDocumentRegister.execute(params.projectId),
			services.sectionDocuments.currentRevision(params.projectId, 'documents')
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
	// rings AND the Control Center — no per-screen drift. Each gap's source step
	// resolves to the capability where it's fixed (legacy step ids map through
			// the registry, e.g. 'data' → infrastructure, legacy Foundation ids →
			// foundation).
	const fallback = capabilityById('coherence') ?? CAPABILITIES[0];
	const productCoherence = toProductCoherence(coherence.analysis, (sourceStep) => {
		const cap = capabilityById(sourceStep) ?? fallback;
		// The destination as the reader finds it in the left nav: a hidden
		// capability (Rules, Permissions) is named under the visible page it folds
		// into, so "Fix in Features › Rules & edge cases" reads like the sidebar.
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

	// The Control Center's TRL switcher re-reads the per-leaf maturity behind the
	// readiness gate along the two roadmap axes (core features, releases) — same
	// scores, different grouping, so the numbers can never disagree.
	// The scores over time and what changed for this person since they last
	// opened the panel: both are cheap residue reads, both degrade to empty.
	const [history, sinceLastVisit] = await Promise.all([
		services.scoreHistory.load(params.projectId).catch(() => null),
		loadVisitDelta(
			services.projectResidue,
			params.projectId,
			services.currentSession().email,
			productCoherence.incoherences.map((i) => i.id)
		)
	]);

	const featureMaturity = productCoherence.featureMaturity ?? {};
	const trlBreakdown = {
		features: maturityByFeature(featuresDraft, featureMaturity),
		cores: maturityByCore(featuresDraft, featureMaturity),
		releases: maturityByRelease(featuresDraft, featureMaturity)
	};

	return {
		projectId: params.projectId,
		canWrite,
		canUseSharedEditor: canUseSharedEditor(event),
		team,
		featureNames,
		glossaryTerms,
		projectName: draft.productName.trim() || 'Untitled project',
		industryLabel,
		coherence: productCoherence.coherenceScore,
		productCoherence,
		scoreHistory: history?.points ?? [],
		sinceLastVisit,
		trlBreakdown,
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
