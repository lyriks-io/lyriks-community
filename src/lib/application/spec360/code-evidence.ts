/**
 * The evidence behind a place in the code (ac-src-code-place): the lines that
 * prove an element, read from the span the analysis recorded for it, or else
 * the line the implementation index recorded at that place. Pure: the caller
 * at the edge hands in what the engine and the index hold.
 */

export interface CodeEvidenceLine {
	/** 1-based line number in the file. */
	readonly n: number;
	readonly text: string;
}

export type CodeEvidence =
	| {
			readonly kind: 'span';
			readonly file: string;
			readonly from: number;
			readonly to: number;
			readonly lines: readonly CodeEvidenceLine[];
			/** Lines of the span the card does not show, after the last one shown. */
			readonly leftOut: number;
	  }
	| { readonly kind: 'index_line'; readonly file: string; readonly lines: readonly CodeEvidenceLine[] }
	| { readonly kind: 'none'; readonly file: string };

/** How many lines a card shows before it says how many it leaves out. */
export const EXCERPT_MAX_LINES = 14;

/** A span the analysis recorded: lines are 1-based and inclusive. */
export interface RecordedSpan {
	readonly elementId: string;
	readonly sourceId: string;
	readonly startLine: number;
	readonly endLine: number;
}

/** A source the analysis attached: its name is the file's path in the repository. */
export interface AttachedSource {
	readonly id: string;
	readonly name: string;
	readonly projectId?: string;
}

/** The place a page shows: the element it proves, the file and the line the index located. */
export interface CodePlaceQuery {
	readonly elementId?: string;
	readonly file: string;
	readonly line: number | null;
	/** The line of code the page already read at this place: a request's report keeps it as of its own sync. */
	readonly recorded?: string;
}

const samePath = (a: string, b: string) => a.replace(/^\.?\//, '') === b.replace(/^\.?\//, '');

/**
 * The span that proves the place: the element's own span in that file first,
 * else the span of that file holding the line, the narrowest one.
 */
export function spanForPlace(
	spans: readonly RecordedSpan[],
	sources: readonly AttachedSource[],
	place: CodePlaceQuery
): RecordedSpan | null {
	const inFile = spans.filter((s) => {
		const source = sources.find((x) => x.id === s.sourceId);
		return !!source && samePath(source.name, place.file);
	});
	const own = place.elementId ? inFile.find((s) => s.elementId === place.elementId) : undefined;
	if (own) return own;
	if (place.line === null) return null;
	const line = place.line;
	const holding = inFile.filter((s) => s.startLine <= line && line <= s.endLine).sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine));
	return holding[0] ?? null;
}

/** The lines `from` to `to` of `content`, numbered, cut after `max` lines. */
export function numberedExcerpt(content: string, from: number, to: number, max = EXCERPT_MAX_LINES): { lines: CodeEvidenceLine[]; leftOut: number } {
	const all = content.split(/\r?\n/);
	const first = Math.max(1, from);
	const last = Math.min(all.length, Math.max(first, to));
	const shown = Math.min(last, first + max - 1);
	const lines = all.slice(first - 1, shown).map((text, i) => ({ n: first + i, text }));
	return { lines, leftOut: Math.max(0, last - shown) };
}

/** Whether one of the span's lines, the ones past the excerpt included, carries the line the index recorded. */
function spanHolds(content: string, span: RecordedSpan, signature: string): boolean {
	return content
		.split(/\r?\n/)
		.slice(Math.max(0, span.startLine - 1), span.endLine)
		.some((line) => line.includes(signature));
}

/**
 * What the card shows: the span read from the attached source, else the line
 * the index recorded, else that no excerpt is held.
 */
export function codeEvidence(input: {
	readonly place: CodePlaceQuery;
	readonly span: RecordedSpan | null;
	/** The attached source's content, when a span was found and its source could be read. */
	readonly content: string | null;
	/** The line the implementation index recorded at the place (its signature). */
	readonly indexLine?: string | null;
}): CodeEvidence {
	const { place, content } = input;
	const signature = input.indexLine?.trim();
	// The source is the file as the analysis read it: a span that no longer holds the line the index found is older than the code (criterion 496d102c).
	const span = input.span && (!signature || content === null || spanHolds(content, input.span, signature)) ? input.span : null;
	if (span && content !== null) {
		const { lines, leftOut } = numberedExcerpt(content, span.startLine, span.endLine);
		if (lines.length > 0) return { kind: 'span', file: place.file, from: span.startLine, to: span.endLine, lines, leftOut };
	}
	if (signature) return { kind: 'index_line', file: place.file, lines: [{ n: place.line ?? 0, text: signature }] };
	return { kind: 'none', file: place.file };
}
