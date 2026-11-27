import { error } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { namedValidators, validationLead, type PersonRef } from '$domain/retrospec';
import { administersProject } from '$domain/team';
import { tierAllowsMultipleMembers } from '$domain/tier';
import { callerRoleInProjectWorkspace } from './caller-workspace.server';

/**
 * Who may choose the person who leads a project's validation (action 34e2b66f
 * of feat-135): whoever administers the project, like the jobs set there. A
 * Community installation has one operator, who leads alone.
 */
export async function requireLeadChooser(services: AppServices, projectId: string, what = 'who leads the validation'): Promise<void> {
	if (!tierAllowsMultipleMembers(services.currentTier())) error(403, 'Teams and jobs come with the Enterprise edition.');
	const [role, team] = await Promise.all([callerRoleInProjectWorkspace(services, projectId), services.loadTeam.execute(projectId)]);
	if (!administersProject(role, team, services.currentSession().email)) {
		error(403, `Only an admin, the workspace owner or the project's owner chooses ${what}.`);
	}
}

/** The ids of the people the project names as validators, lowercased; null while it names none (criterion f09fe8ea of feat-135). */
export async function readValidators(services: AppServices, projectId: string): Promise<string[] | null> {
	const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
	return namedValidators(doc)?.map((person) => person.id.trim().toLowerCase()) ?? null;
}

/** Who leads the project's validation now: whom it chose, else whoever started the run; null while neither is known. */
export async function readValidationLead(services: AppServices, projectId: string): Promise<PersonRef | null> {
	const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
	return validationLead(doc, null);
}
