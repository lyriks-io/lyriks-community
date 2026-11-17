/** The words a line on a table opens on: the index locates no table, so a person confirms it once the code holds it. */
export const DATA_CHANGE_PREFIX = 'Data change:';
export const isDataChangeRequirement = (requirement: string): boolean => requirement.startsWith(DATA_CHANGE_PREFIX);

/**
 * A requirement as a title and where it sits: the derivation writes it as the
 * path of the element then its name in quotes ("Cart › Add a product › rule
 * "No more than ten""), so the name is the title and the path its place.
 * The path holds no quote while the name may quote a message itself (shows
 * "No user has been found."), so the name runs from the first quote to the last.
 */
export function requirementParts(requirement: string): { title: string; path: string } {
	const quoted = /^([^"«]*?)\s*(?:"(.*)"|«\s*(.*)\s*»)\s*$/s.exec(requirement);
	if (!quoted) return { title: requirement, path: '' };
	const title = (quoted[2] ?? quoted[3] ?? '').trim();
	return title ? { title, path: quoted[1].trim() } : { title: requirement, path: '' };
}
