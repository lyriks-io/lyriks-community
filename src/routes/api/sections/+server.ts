import type { AppServices } from '$composition/container.server';
import { json, error } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import { healthReading } from '$domain/coherence';
import { requestSeenBy, type ProjectEvolutionDraft } from '$domain/evolution';
import { SECTIONS, SECTION_REVISION_STORAGE, isSection, type Section } from '$lib/shared/sections';
import type { RequestHandler } from './$types';
import { withFoundationLock } from '$lib/server/foundation-lock.server';

/**
 * Read-any-section surface for the Lyriks MCP (the read half of "everything a
 * user can do"). Writes already go through the per-section PUT /api/draft/*
 * endpoints — which carry the correct sync side-effects — so this only needs to
 * expose reads. Dispatches to the section's load use-case via the container, so
 * it auto-adapts to draft shape changes (no field schema is hardcoded here).
 *
 *   GET /api/sections?projectId=<id>&section=<key>  ->  { section, projectId, draft }
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	const section = url.searchParams.get('section') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	if (!isSection(section)) {
		error(400, `unknown section "${section}". Valid: ${SECTIONS.join(', ')}`);
	}
	if (section === 'evolution') requireEvolutionAccess(event.locals.services);

	const s = event.locals.services;
	return withFoundationLock(s, projectId, section, async () => {
		// Read the token first: a concurrent save may make it stale, never newer
		// than the document we loaded. The write gate will reject that stale token.
		const revision = await (SECTION_REVISION_STORAGE[section] === 'document'
			? s.sectionDocuments.currentRevision(projectId, section)
			: s.draftLock.current(projectId, section));
		const draft = await loadSection(s, section, projectId);
		if (section === 'evolution') {
			// The raw dossiers too are read without the private exchanges of others with their AI (ac-evo-live-ask).
			const reader = await resolveEvolutionActor(s, event, projectId);
			const evolution = draft as ProjectEvolutionDraft;
			return json({ section, projectId, revision, draft: { ...evolution, requests: evolution.requests.map((r) => requestSeenBy(r, reader.id)) } });
		}
		return json({ section, projectId, revision, draft });
	});
};

async function loadSection(
	s: AppServices,
	section: Section,
	projectId: string
): Promise<unknown> {
	switch (section) {
		case 'scope':
			return s.loadScopeDraft.execute(projectId);
		case 'foundation':
			return s.loadFoundationDraft.execute(projectId);
		case 'users':
			return s.loadUsersDraft.execute(projectId);
		case 'features':
			return s.loadFeaturesDraft.execute(projectId);
		case 'experience':
			return s.loadExperienceDraft.execute(projectId);
		case 'rules':
			return s.loadRulesDraft.execute(projectId);
		case 'data':
			return s.loadDataDraft.execute(projectId);
		case 'architecture':
			return s.loadArchitectureDraft.execute(projectId);
		case 'coherence': {
			// The one Project health the Overview shows and every point it is computed
			// from (criterion 7ae9b322), beside the coherence analysis it holds; the
			// proof counts stay readable as `conformance`. An unreadable measure is null.
			const [view, conformance, health] = await Promise.all([
				s.loadCoherenceDraft.execute(projectId),
				s.loadConformance.execute(projectId).catch(() => null),
				s.readProjectHealth.execute(projectId).catch(() => null)
			]);
			return { ...view, conformance, health: health ? healthReading(health) : null };
		}
		case 'glossary':
			return s.loadGlossaryDraft.execute(projectId);
		case 'approvals':
			return s.loadApprovalsDraft.execute(projectId);
		case 'baselines':
			return s.loadBaselinesDraft.execute(projectId);
		case 'documents':
			return s.loadDocumentRegister.execute(projectId);
		case 'evolution':
			return s.loadEvolutionDraft.execute(projectId);
	}
}
