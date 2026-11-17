import type { FoundationDefinitionDraft, FoundationIdentityDraft } from '$domain/foundation';
import type { AiSuggesterPort, PersonaContextPassage, PersonaSuggestion } from '../ports';

/**
 * Asks the AI seam for the personas this project's own text names, to offer as
 * pending cards on the Users step. Suggestions are contextual by construction
 * (spec criterion `98d98033`): the seam only sees the project's passages, so a
 * project that names nobody gets nothing rather than a generic list.
 *
 * The Foundation's legacy list of affected personas only seeds an empty
 * Users section: once a persona is described, its entries are the old labels
 * of the people already there (`employee` for "Collaborateur"), so offering
 * them again would duplicate them (criterion `6b26cc3b`).
 */
export class SuggestPersonasUseCase {
	constructor(private readonly ai: AiSuggesterPort) {}

	execute(
		identity: FoundationIdentityDraft,
		definition: FoundationDefinitionDraft,
		describedPersonas: number
	): Promise<PersonaSuggestion[]> {
		return this.ai.suggestPersonas(personaContext(identity, definition, describedPersonas > 0));
	}
}

function personaContext(
	identity: FoundationIdentityDraft,
	definition: FoundationDefinitionDraft,
	personasDescribed: boolean
): PersonaContextPassage[] {
	const objective = definition.businessObjective;
	const passages: PersonaContextPassage[] = [
		{ where: 'brief', text: identity.brief },
		{ where: 'problem', text: objective.mainProblem },
		...objective.painPointLinks.map((p) => ({ where: 'pain point' as const, text: p.text })),
		...objective.painPoints.map((text) => ({ where: 'pain point' as const, text })),
		{ where: 'outcome', text: objective.expectedOutcome },
		...(personasDescribed
			? []
			: objective.affectedPersonas.map((text) => ({ where: 'affected persona' as const, text })))
	];
	return passages.filter((p) => p.text.trim().length > 0);
}
