import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { isSection } from '$lib/shared/sections';
import { validateSectionDraft } from '$application/specification/validate-section-draft';
import { capabilityRegistry, validateCapabilityReferences, withCarriedGrants } from '$application/specification/capability-registry';
import { parseUsersDraft } from '$application/specification/parse-users-draft';
import type { RequestHandler } from './$types';

/** Read-only validation despite POST: the proposed document is never persisted. */
export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => null) as { projectId?: unknown; section?: unknown; draft?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const section = typeof body?.section === 'string' ? body.section : '';
	if (!isSection(section)) error(400, 'Unknown section');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const issues = validateSectionDraft(section, body?.draft, await services.loadSpecLanguage.generated(projectId));
	const checks = ['existing-section-authoring-guards'];
	if (section === 'users' && issues.length === 0) {
		const draft = parseUsersDraft(body?.draft, projectId);
		if (draft.permissions.length) {
			const derived = await services.refreshDerivedCapabilities.execute(projectId);
			const carried = withCarriedGrants(draft, derived);
			issues.push(...validateCapabilityReferences(carried, capabilityRegistry(carried, derived)));
		}
		checks.push('live-capability-references');
	}
	return json({ projectId, section, valid: issues.length === 0, issues, checks, persisted: false,
		limitations: [
			'Checks the existing authoring guards, whose coverage differs by section; this is not complete schema, behavior or project verification.',
			'Lifecycle guards, permissions to write, persistence side effects and concurrent edits are not validated. A later write revalidates independently.',
			'Cross-section references use the currently saved project, not other proposed edits. This is not an atomic multi-section transaction.'
		]
	});
};
