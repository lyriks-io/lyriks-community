/**
 * A non-blocking integrity note about a saved draft. Distinct from a
 * `CoherenceIssue` (which feeds the 0–100 score): a warning says "this saved,
 * but something references what isn't there" — a dangling ref, an orphaned
 * assignment, an unrenderable node. The save still succeeds; the point is
 * *visibility*, so an automated author (the MCP) or a human sees the problem
 * instead of a green `coherenceScore` on silently-broken data.
 *
 * Section-agnostic on purpose: every `save-*-draft` result can carry a
 * `warnings: DraftWarning[]` channel with the same shape.
 */
export interface DraftWarning {
	/** Stable, machine-readable kind, e.g. `dangling-family-ref`. */
	readonly code: string;
	/** The offending id/path, when there is a single one to point at. */
	readonly ref?: string;
	/** Human-readable explanation, safe to surface verbatim. */
	readonly message: string;
}
