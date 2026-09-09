import {
	createEmptyReuseLibrary,
	type ReuseLibraryDraft,
	type RequirementTemplate
} from '$domain/reuse';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Anti-corruption parse for the shared reuse library (residue-backed). */
export function parseReuseLibrary(input: unknown): ReuseLibraryDraft {
	const base = createEmptyReuseLibrary();
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	const templates = Array.isArray(src.templates)
		? src.templates
				.map((t): RequirementTemplate | null => {
					const r = (t ?? {}) as Record<string, unknown>;
					if (typeof r.id !== 'string') return null;
					const acceptanceCriteria = Array.isArray(r.acceptanceCriteria)
						? r.acceptanceCriteria
								.map((c) => {
									const cr = (c ?? {}) as Record<string, unknown>;
									return typeof cr.id === 'string'
										? { id: cr.id, text: str(cr.text) }
										: null;
								})
								.filter((c): c is { id: string; text: string } => c !== null)
						: [];
					return {
						id: r.id,
						title: str(r.title),
						description: str(r.description),
						problem: str(r.problem),
						value: str(r.value),
						acceptanceCriteria,
						sourceProjectName: str(r.sourceProjectName),
						createdAt: str(r.createdAt)
					};
				})
				.filter((t): t is RequirementTemplate => t !== null)
		: [];
	return { ...base, templates };
}
