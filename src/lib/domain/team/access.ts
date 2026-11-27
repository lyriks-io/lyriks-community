/**
 * What a member may do in a workspace, read on a page (criterion 7d5d098a of
 * feat-118). The role keeps its stored id; only its name changes where people
 * read it: the role designer reads Editor, so nobody takes it for the Design job.
 */
const ACCESS_LABELS: Readonly<Record<string, string>> = {
	owner: 'Owner',
	admin: 'Admin',
	designer: 'Editor',
	viewer: 'Viewer'
};

/** The name a workspace role reads under; a role this list does not know reads as stored. */
export const accessLabel = (role: string): string => ACCESS_LABELS[role] ?? role;

/** The roles an owner or admin hands out, in the order the selects offer them. */
export const GRANTED_ACCESSES = ['admin', 'designer', 'viewer'] as const;

/** What each access lets one do, the tip of every select that hands one out. */
export const ACCESS_TIP = 'Admin manages the members and every project; Editor edits the projects granted; Viewer reads them';
