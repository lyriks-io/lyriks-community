import type { DocumentSource } from '$domain/documents';

/** What a citation needs to be read; some callers hold a slimmer row than the register's. */
export type ReadableSource = Pick<DocumentSource, 'title' | 'url' | 'note'> &
	Partial<Pick<DocumentSource, 'id' | 'kind' | 'decision' | 'stored'>>;

/**
 * Imperative source reader, mirroring `file-viewer.svelte.ts`: any citation
 * calls `openSourceReader`, and the single `SourceReaderHost` mounted in the
 * root layout renders it, so a chip deep inside a card never owns a dialog.
 */
export interface SourceReading {
	source: ReadableSource;
	/** The project's Documents page, when the caller knows it. */
	registerHref?: string;
	/** The citation that opened the reader: where the page is scrolled to on return. */
	anchor?: Element | null;
	/** The element the citation was opened from, whose passages the reader highlights in the stored text (criterion f09da92d). */
	element?: { readonly projectId: string; readonly anchor: string };
}

let pending = $state<SourceReading | null>(null);

export function pendingSourceReading(): SourceReading | null {
	return pending;
}

export function openSourceReader(reading: SourceReading): void {
	pending = reading;
}

export function closeSourceReader(): void {
	pending = null;
}
