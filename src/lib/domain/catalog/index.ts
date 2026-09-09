/**
 * The project catalog — the "upper level" above the wizard. A project's identity
 * lives in its Step 01 init draft (productName/industry); the catalog is the
 * derived list of those, plus id minting.
 */

/** One project as shown on the home/catalog, derived from its init draft. */
export interface ProjectSummary {
	id: string;
	name: string;
	description: string;
	industry: string;
	lastSavedAt: string | null;
}

/** URL-safe slug from a product name — the human-readable part of a project id. */
export function slugifyName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return slug || 'project';
}

/** A unique, readable project id: `<slug>-<suffix>` (suffix supplied by the caller). */
export function makeProjectId(name: string, suffix: string): string {
	return `${slugifyName(name)}-${suffix}`;
}
