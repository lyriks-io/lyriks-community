import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { namedValidators, validationLead } from '$domain/retrospec';
import { readValidationTeam } from './spec-validation.server';

/** One person who can open a project, as the Team step of the creation dialog lists them. */
export interface RosterPerson {
	readonly id: string;
	readonly name: string;
	/** Their role in the workspace: what they may do there, read from Settings, Members. */
	readonly role: string | null;
	readonly jobs: readonly string[];
}

export interface ValidationRoster {
	readonly people: readonly RosterPerson[];
	/** The lead's id, null while nobody is known. */
	readonly lead: string | null;
	/** The ids of the people the project names as validators; null while it names none. */
	readonly validators: readonly string[] | null;
}

/** Who can open the project, who leads its validation and who validates it (criteria bfe225b4, f09fe8ea). */
export async function readValidationRoster(services: AppServices, projectId: string): Promise<ValidationRoster> {
	const [team, { doc }] = await Promise.all([readValidationTeam(services, projectId), loadRetrospecDocument(services.sectionDocuments, projectId)]);
	const named = namedValidators(doc);
	return {
		people: team.map((member) => ({ id: member.person.id, name: member.person.name, role: member.role ?? null, jobs: member.jobNames ?? member.jobIds })),
		lead: validationLead(doc, null)?.id ?? null,
		validators: named ? named.map((person) => person.id) : null
	};
}
