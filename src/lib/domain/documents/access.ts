import type { DocumentSource } from './draft';
import { sourceHref } from './link';

/**
 * Whether a register row can be consulted by someone other than its author.
 *
 * A citation is evidence only if the reader can reach what it cites, through
 * one of two doors: a link anyone can follow (a web address, an uploaded file,
 * inline data), or the content itself carried in the note. A `file://` path, a
 * machine-local path or a prose reference typed into `url` opens for nobody:
 * the row LOOKS sourced and is not, which is worse than an honest gap, so it
 * is reported rather than tolerated.
 *
 *  - `link`         `url` is followable; the note is a citation on top of it
 *  - `inline`       no address; the note IS the source (what was used, verbatim)
 *  - `unreachable`  `url` names something nobody else can open
 *  - `empty`        nothing to open and nothing to read
 */
export type SourceAccess = 'link' | 'inline' | 'unreachable' | 'empty';

type AccessInput = Partial<Pick<DocumentSource, 'url' | 'note'>>;

export function sourceAccess(source: AccessInput): SourceAccess {
	const url = (source.url ?? '').trim();
	const note = (source.note ?? '').trim();
	if (url && sourceHref({ url })) return 'link';
	if (url) return 'unreachable';
	return note ? 'inline' : 'empty';
}

/** One row a reader cannot consult, with the sentence every surface reports for it. */
export interface SourceAccessIssue {
	id: string;
	access: Extract<SourceAccess, 'unreachable' | 'empty'>;
	message: string;
}

const URL_PREVIEW = 60;

function preview(url: string): string {
	const trimmed = url.trim();
	return trimmed.length > URL_PREVIEW ? `${trimmed.slice(0, URL_PREVIEW)}...` : trimmed;
}

/**
 * The rows of a register that nobody but their author can consult. Same
 * wording on every surface (the write response, the completion report, the
 * page) so the fix is described once.
 */
export function sourceAccessIssues(
	sources: ReadonlyArray<Partial<DocumentSource> & { id: string }>
): SourceAccessIssue[] {
	const issues: SourceAccessIssue[] = [];
	for (const source of sources) {
		const access = sourceAccess(source);
		if (access === 'link' || access === 'inline') continue;
		const title = (source.title ?? '').trim() || source.id;
		issues.push({
			id: source.id,
			access,
			message:
				access === 'unreachable'
					? `Source "${title}" cannot be opened: "${preview(source.url ?? '')}" is not a web address (a file:// path, a local path or a plain reference opens for nobody else). Give a web address, or clear the url and carry what you used, verbatim, in the note, with the local path there as provenance.`
					: `Source "${title}" has nothing to open and nothing to read. Give a web address, or carry what you used, verbatim, in the note.`
		});
	}
	return issues;
}
