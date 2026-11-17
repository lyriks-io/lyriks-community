import type { WorkspaceSummary } from '$application/ports';

/**
 * The workspace the switcher shows: the one the browser pinned when it names a
 * workspace the caller belongs to (a tampered cookie names none), else their
 * first. The team server makes the same choice when a project is registered.
 */
export function pickActiveWorkspace<T extends Pick<WorkspaceSummary, 'id'>>(
	workspaces: readonly T[],
	pinned: string | null | undefined
): T | null {
	return (pinned ? workspaces.find((w) => w.id === pinned) : undefined) ?? workspaces[0] ?? null;
}
