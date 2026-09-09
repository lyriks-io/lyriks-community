import {
	createEmptyArchitectureDraft,
	withStableArchitectureIds,
	type ProjectArchitectureDraft
} from '$domain/architecture';

/**
 * Anti-corruption guard for untrusted Step 08 payloads. Merge over defaults,
 * pin projectId. `derivedTech` is NOT trusted from the client — it is a
 * read-only mirror recomputed server-side on load — so we drop it.
 */
export function parseArchitectureDraft(
	input: unknown,
	projectId: string
): ProjectArchitectureDraft {
	const base = createEmptyArchitectureDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const arr = <T>(k: string): T[] => (Array.isArray(src[k]) ? (src[k] as T[]) : []);

	return withStableArchitectureIds({
		...base,
		projectId,
		techChoices: arr('techChoices'),
		sourceIds: arr<unknown>('sourceIds').filter(
			(id): id is string => typeof id === 'string' && id.length > 0
		),
		// Legacy private doc list — never authored any more, only carried so the
		// register fold (LoadDocumentRegisterUseCase) keeps finding it.
		referenceDocs: arr('referenceDocs'),
		constraints: arr('constraints'),
		derivedTech: [] // refilled by LoadArchitectureDraftUseCase
	});
}
