import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { SECTIONS, SECTION_REVISION_STORAGE, isSection, type Section } from '$lib/shared/sections';
import type { RequestHandler } from './$types';

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

	const s = getServices();
	// Read the token first: a concurrent save may make it stale, never newer
	// than the document we loaded. The write gate will reject that stale token.
	const revision = await (SECTION_REVISION_STORAGE[section] === 'document'
		? s.sectionDocuments.currentRevision(projectId, section)
		: s.draftLock.current(projectId, section));
	const draft = await loadSection(s, section, projectId);
	return json({ section, projectId, revision, draft });
};

async function loadSection(
	s: ReturnType<typeof getServices>,
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
		case 'coherence':
			return s.loadCoherenceDraft.execute(projectId);
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
