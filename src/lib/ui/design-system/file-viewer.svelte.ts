/**
 * Imperative file-preview modal, mirroring `dialog.svelte.ts`. Any component can
 * call `openFileViewer(file)`; the single `FileViewerHost` (mounted in the root
 * layout) renders whichever file is pending. Works entirely off the inline data
 * URL — no network round-trip needed to preview.
 */
export interface ViewableFile {
	name: string;
	dataUrl: string;
}

let pending = $state<ViewableFile | null>(null);

/** The file the host should render right now (null = closed). */
export function pendingFile(): ViewableFile | null {
	return pending;
}

/** Open the preview modal for a file. */
export function openFileViewer(file: ViewableFile): void {
	pending = file;
}

export function closeFileViewer(): void {
	pending = null;
}

/** Trigger a browser download of a data-URL file (no server round-trip). */
export function downloadFile(file: ViewableFile): void {
	const a = document.createElement('a');
	a.href = file.dataUrl;
	a.download = file.name || 'download';
	document.body.appendChild(a);
	a.click();
	a.remove();
}
