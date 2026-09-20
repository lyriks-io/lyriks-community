import { parseUsersDraft } from '$application/parse-users-draft';
import { error } from '@sveltejs/kit';
import { capabilityRegistry, validateCapabilityReferences } from '$application/capability-registry';
import { saveSectionDraft } from '$lib/server/section-save.server';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import type { RequestHandler } from './$types';

/** Debounced auto-save target for Step 03. Body: a (possibly partial) users draft incl. projectId. */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'users',
		validate: async (body, services, projectId) => {
			assertSectionDraftValid('users', body);
			const draft = parseUsersDraft(body, projectId);
			if (!draft.permissions.length) return;
			const registry = capabilityRegistry(draft, await services.refreshDerivedCapabilities.execute(projectId));
			const issues = validateCapabilityReferences(draft, registry);
			if (issues.length) error(400, `invalid_capability_reference: ${issues.map(i => `${i.path} ${i.message}`).join('; ')}`);
		},
		parse: parseUsersDraft,
		persist: (draft, services) => services.saveUsersDraft.execute(draft)
	});
