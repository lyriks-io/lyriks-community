import type { AppServices } from '$composition/container.server';
import { touchedReading, type EvolutionRequest, type KnowledgeRead, type TouchedReading } from '$domain/evolution';
import { canReviewElement, samePersonRef, type PersonRef } from '$domain/retrospec';
import { readSpecValidationBoard } from './spec-validation.server';

/**
 * What the Simulation of a request reads of Knowledge (EVO-003): where each
 * element of the Specification 360° stands, who it waits on and whether it
 * waits on the reader, read from the same validation board the Specification
 * 360° draws. Knowledge that cannot be read (the project team unavailable)
 * reads unreadable, never as an empty list.
 */

const UNREADABLE: KnowledgeRead = { readable: false, specValidated: false, elements: [] };

export async function readKnowledgeStandings(services: AppServices, projectId: string, reader: PersonRef, canWrite: boolean): Promise<KnowledgeRead> {
	try {
		const read = await readSpecValidationBoard(services, projectId, reader, { reviewOnly: !canWrite });
		if (!read.teamAvailable) return UNREADABLE;
		const { board, doc, team } = read;
		return {
			readable: true,
			specValidated: board.summary.state === 'validated',
			elements: read.elements.map((element) => {
				const standing = board.standings[element.id];
				// A validation of the reader's own already stands: Validate now would add nothing.
				const givenByMe = !!standing?.validatedBy.some((p) => samePersonRef(p, reader));
				return {
					id: element.id,
					title: element.title,
					...(element.place ? { place: element.place } : {}),
					...(element.under ? { under: element.under } : {}),
					validated: standing?.state === 'ok',
					waitsOn: standing?.missing ?? [],
					waitsOnMe: !givenByMe && canReviewElement(doc, element, team, reader, canWrite)
				};
			})
		};
	} catch {
		return UNREADABLE;
	}
}

/** The block Not validated in Knowledge of one request, for one reader. */
export async function readTouchedValidation(services: AppServices, projectId: string, request: EvolutionRequest, reader: PersonRef, canWrite: boolean): Promise<TouchedReading> {
	return touchedReading(request, await readKnowledgeStandings(services, projectId, reader, canWrite));
}
