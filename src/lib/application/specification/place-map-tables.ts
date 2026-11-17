import { applyPlacementAct, parseMapPlacements, type MapPlacements, type PlacementAct } from '$domain/data';
import type { SectionDocumentStorePort } from '../ports/section-documents';

export type PlaceMapTablesResult =
	| { readonly ok: true; readonly document: MapPlacements }
	| { readonly ok: false; readonly refusal: string; readonly conflict: boolean };

/** How many times a move is replayed on a newer document before giving up. */
const ATTEMPTS = 4;

/**
 * Moves a table of the data map, or puts every table back where the layout
 * places it (criterion 7f5769bb). Written apart from the specification, under
 * the revision it was read at; a concurrent move replays this one on top.
 */
export class PlaceMapTablesUseCase {
	constructor(
		private readonly store: SectionDocumentStorePort,
		private readonly section: string
	) {}

	async execute(projectId: string, act: PlacementAct, origin: string | null): Promise<PlaceMapTablesResult> {
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			const revision = await this.store.currentRevision(projectId, this.section);
			const outcome = applyPlacementAct(parseMapPlacements(await this.store.load(projectId, this.section)), act);
			if (!outcome.ok) return { ok: false, refusal: outcome.refusal, conflict: false };
			if ((await this.store.save(projectId, this.section, outcome.document, revision, origin)) !== null) return { ok: true, document: outcome.document };
		}
		return { ok: false, refusal: 'Others are arranging this map right now. Try again.', conflict: true };
	}
}
