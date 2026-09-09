import type { ProjectResidueRepositoryPort } from '$application/ports';
import { visitDelta, type SeenGaps, type VisitDelta } from '$domain/coherence';

/** The residue document holding what one person last saw open on a project. */
export function seenSectionFor(email: string | undefined): string {
	return `seen:${email ?? 'local'}`;
}

/** What changed for this person since they last opened the panel; a first visit is null. */
export async function loadVisitDelta(
	residue: Pick<ProjectResidueRepositoryPort, 'load'>,
	projectId: string,
	email: string | undefined,
	openIds: readonly string[]
): Promise<VisitDelta | null> {
	const raw = (await residue.load(projectId, seenSectionFor(email)).catch(() => null)) as
		| Partial<SeenGaps>
		| null;
	if (!raw || !Array.isArray(raw.gapIds) || typeof raw.at !== 'string') return null;
	return visitDelta({ gapIds: raw.gapIds.filter((g): g is string => typeof g === 'string'), at: raw.at }, openIds);
}
