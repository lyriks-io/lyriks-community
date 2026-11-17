import type { Collaborator } from './team';

/** "Paul Marchand" → "Paul M.": first name + last-name initial (the compact
 *  contributor label used across pickers and rosters). Falls back to the email
 *  local-part when there is no name. */
export function shortName(collaborator: Pick<Collaborator, 'name' | 'email'>): string {
	const raw = collaborator.name?.trim() || collaborator.email?.split('@')[0] || 'Unknown';
	const parts = raw.split(/\s+/).filter(Boolean);
	if (parts.length < 2) return parts[0] ?? raw;
	return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** The contributor's discipline, derived from expertise + seniority: PM / PO /
 *  UX / Dev / Tech Lead / Data Eng. One source of truth for every people list. */
export function disciplineLabel(c: Pick<Collaborator, 'expertise' | 'seniority'>): string {
	const ex = c.expertise ?? [];
	if (ex.includes('data')) return 'Data Eng';
	if (ex.includes('eng-management')) return 'Tech Lead';
	if (ex.includes('engineering')) return c.seniority === 'manager' ? 'Tech Lead' : 'Dev';
	if (ex.includes('design')) return 'UX';
	if (ex.includes('product')) return c.seniority === 'manager' ? 'PM' : 'PO';
	return 'Member';
}
