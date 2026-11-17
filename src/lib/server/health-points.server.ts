import type { Gap } from '$domain/coherence';

/**
 * Finds a point of Project health by its id (ac-evo-draft-findings): in the
 * reading the pages show first, which is at hand, then in a reading taken now
 * when that one does not hold it yet. Every point counts, the coherence gaps,
 * the audit points and the code points alike, as What Lyriks noticed lists
 * them; each reading is taken at most once for all the lookups of a batch.
 */
export function healthPointFinder(shown: () => Promise<readonly Gap[]>, fresh: () => Promise<readonly Gap[]>): (findingId: string) => Promise<Gap | null> {
	let shownRead: Promise<readonly Gap[]> | null = null;
	let freshRead: Promise<readonly Gap[]> | null = null;
	return async (findingId) => {
		shownRead ??= shown().catch(() => []);
		const seen = (await shownRead).find((g) => g.id === findingId);
		if (seen) return seen;
		freshRead ??= fresh().catch(() => []);
		return (await freshRead).find((g) => g.id === findingId) ?? null;
	};
}
