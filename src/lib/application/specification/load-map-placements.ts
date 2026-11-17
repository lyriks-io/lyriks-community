import { parseMapPlacements, type MapPlacements } from '$domain/data';
import type { SectionDocumentStorePort } from '../ports/section-documents';

/** Reads where people put the tables of a project's data map (criterion 7f5769bb). */
export class LoadMapPlacementsUseCase {
	constructor(
		private readonly store: SectionDocumentStorePort,
		/** The internal section the placements are kept under, apart from the specification. */
		private readonly section: string
	) {}

	async execute(projectId: string): Promise<MapPlacements> {
		return parseMapPlacements(await this.store.load(projectId, this.section));
	}
}
