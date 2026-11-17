import type { KeptEditMode } from './edit-mode-memory';

/**
 * Where a browser tab keeps the Edit mode of a project (criterion 76d3a766).
 * The session storage: the mode belongs to this tab, and a storage that is
 * refused only makes the mode forget.
 */
const keyOf = (projectId: string) => `lyriks.spec-edit-mode.${projectId}`;

export function keptEditMode(projectId: string): KeptEditMode | null {
	try {
		const raw = sessionStorage.getItem(keyOf(projectId));
		return raw ? (JSON.parse(raw) as KeptEditMode) : null;
	} catch {
		return null;
	}
}

/** The mode is on: `leftAt` says since when the reader is away, null while they are in Knowledge. */
export function keepEditMode(projectId: string, leftAt: number | null = null): void {
	try {
		sessionStorage.setItem(keyOf(projectId), JSON.stringify({ leftAt } satisfies KeptEditMode));
	} catch {
		// Nothing to keep it in: the mode simply reads off on coming back.
	}
}

export function forgetEditMode(projectId: string): void {
	try {
		sessionStorage.removeItem(keyOf(projectId));
	} catch {
		// Nothing was kept.
	}
}
