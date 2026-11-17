import type { Gap } from './draft';

/**
 * Where the problem a point names lies (criterion c86ea441 of the review of
 * What Lyriks noticed), in the reader's words: most points are gaps of the
 * specification or of Lyriks's own records, and reading them as defects of
 * the product sends people to fix code that does nothing wrong. Pure.
 *
 *   product       the shipped product does something wrong: an issue whose
 *                 detail cites the code, a criterion that failed against it;
 *   specification the specification is incomplete or inconsistent, nothing is
 *                 known to be wrong in the product;
 *   records       Lyriks's own bookkeeping is behind: the audit not run since
 *                 the project changed, a source not cited, an analysis not
 *                 finalized, code read against an older spec, criteria with no
 *                 recorded result.
 */
export type PointOrigin = 'product' | 'specification' | 'records';

export const POINT_ORIGINS: readonly PointOrigin[] = ['product', 'specification', 'records'];

/** The small label a point carries, and the filter that narrows to it. */
export const POINT_ORIGIN_LABEL: Readonly<Record<PointOrigin, string>> = {
	product: 'In the product',
	specification: 'In the specification',
	records: "In Lyriks's records"
};

/** What the label means: the first line of the point's sheet, before what settles it. */
const ORIGIN_MEANS: Readonly<Record<PointOrigin, string>> = {
	product: 'Something is wrong in the product as it ships: the code was read or tested doing it.',
	specification: 'Nothing is known to be wrong in the product: the specification does not settle this yet.',
	records: "Nothing is known to be wrong in the product: Lyriks's own records are behind."
};

/** The first line of a sheet: what the origin means, then what settles it when the point says so. */
export function originLine(origin: PointOrigin, settles?: string | null): string {
	const then = (settles ?? '').trim();
	if (!then) return ORIGIN_MEANS[origin];
	return `${ORIGIN_MEANS[origin]} ${then.charAt(0).toUpperCase()}${then.slice(1)}${/[.!?]$/.test(then) ? '' : '.'}`;
}

/** The audit issues that are Lyriks's bookkeeping rather than a gap of the specification. */
const RECORDS_AUDIT_CODES: ReadonlySet<string> = new Set(['audit-stale', 'extracted-source-missing', 'source-unreachable', 'source-empty']);

/** What the code says, apart from a failure: Lyriks has not read or recorded it against the spec as it stands. */
const RECORDS_CODE_CHECKS: ReadonlySet<string> = new Set(['code.drift', 'code.unproven', 'code.criteria-unverified', 'code.analysis-open']);

/**
 * A text that points at the code: the "Where the code says it:" line an issue
 * read from the code carries, or a source file named with its line.
 */
export function citesCode(text: string | null | undefined): boolean {
	const t = text ?? '';
	return /where the code says it\s*:/i.test(t) || /[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|svelte|vue|py|rs|go|java|kt|rb|php|cs|sql)(?::\d+)/.test(t);
}

/** Where the problem of a point of Project health lies. */
export function gapOrigin(gap: Pick<Gap, 'checkId' | 'detail'>): PointOrigin {
	const check = gap.checkId ?? '';
	if (check === 'code.criteria-failing') return 'product';
	if (RECORDS_CODE_CHECKS.has(check)) return 'records';
	if (check.startsWith('audit.') && RECORDS_AUDIT_CODES.has(check.slice('audit.'.length))) return 'records';
	if (check === 'rules.open-issues' && citesCode(gap.detail)) return 'product';
	return 'specification';
}
