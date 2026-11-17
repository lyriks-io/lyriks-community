/**
 * The clash between two projects declaring the same kernel feature id, put into
 * words an author can act on.
 *
 * Pure and framework free, in the application layer rather than beside the HTTP
 * guard, because the same sentence has to be said at two different moments: when
 * an id is CLAIMED, as a features section is saved, and when a behavior write
 * later addresses one that is already ambiguous.
 */
/** What to tell whoever hit the clash, in one sentence they can act on. */
export function featureIdCollisionMessage(
	projectId: string,
	featureId: string,
	clashes: readonly string[]
): string {
	return (
		`Feature id "${featureId}" is also stored by ${clashes.join(', ')}. ` +
		'The behavior engine addresses features by id across all projects, so this write would land ' +
		'in whichever copy it indexed. Give this leaf an id unique to its project (for example ' +
		`"${projectId.slice(0, 12)}-${featureId}") and author it under that id.`
	);
}
