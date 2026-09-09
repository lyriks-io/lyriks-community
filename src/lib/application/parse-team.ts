import {
	COLLABORATOR_COLORS,
	COLLABORATOR_ROLES,
	COLLABORATOR_SENIORITIES,
	type Collaborator,
	type Team
} from '$domain/team/team';

const has = (list: readonly string[], value: unknown): boolean =>
	typeof value === 'string' && list.includes(value);

/**
 * Anti-corruption guard for a locally-stored (residue) team payload. Keeps only
 * well-formed, de-duplicated collaborators and coerces every closed vocabulary
 * (color / role / seniority) back into range, so an untrusted blob can never
 * inject an invalid collaborator into the app.
 */
export function parseTeam(input: unknown): Team | null {
	if (!input || typeof input !== 'object') return null;
	const raw = (input as { collaborators?: unknown }).collaborators;
	if (!Array.isArray(raw)) return { collaborators: [] };
	const seen = new Set<string>();
	const collaborators: Collaborator[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const c = item as Record<string, unknown>;
		const id = typeof c.id === 'string' && c.id ? c.id : null;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		collaborators.push({
			id,
			name: typeof c.name === 'string' ? c.name : '',
			email: typeof c.email === 'string' ? c.email : '',
			color: has(COLLABORATOR_COLORS, c.color) ? (c.color as Collaborator['color']) : 'slate',
			role: has(COLLABORATOR_ROLES, c.role) ? (c.role as Collaborator['role']) : 'contributor',
			seniority: has(COLLABORATOR_SENIORITIES, c.seniority)
				? (c.seniority as Collaborator['seniority'])
				: 'ic',
			expertise: Array.isArray(c.expertise)
				? c.expertise.filter((x): x is string => typeof x === 'string')
				: [],
			scope: Array.isArray(c.scope) ? c.scope.filter((x): x is string => typeof x === 'string') : [],
			joinedAt: typeof c.joinedAt === 'string' ? c.joinedAt : ''
		});
	}
	return { collaborators };
}
