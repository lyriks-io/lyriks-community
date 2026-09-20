import type {
	CriterionEvidenceState,
	CriterionEvidenceSummary,
	ImplementationCoverage
} from '$application/ports';

/**
 * The two evidence blocks a newer engine adds to `get_implementation_status`:
 * `verified: { actions, total }` (actions a passing test run stamped) and
 * `criteria: [...]` (what verifies each acceptance criterion, and how that last
 * went). The shipped engine sends neither, so each reads as `undefined` when
 * absent or unreadable: a missing block means "this engine does not say", which
 * a zero or an empty list would turn into a claim.
 *
 * Pure: the raw answer in, the port's shapes out. Kept out of the adapter so the
 * anti-corruption rules (what is kept, what is capped, what is dropped) can be
 * read and tested on their own.
 */

/** File lists are capped: enough to find the test, never the whole list. */
const MAX_FILES = 5;

const STATES: readonly CriterionEvidenceState[] = ['verified', 'failing', 'unverified', 'none'];

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const count = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

function firstFiles(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const files = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
	return files.length > 0 ? files.slice(0, MAX_FILES) : undefined;
}

/** `verified: { actions, total }`, or undefined when the engine did not report it. */
export function parseProvenActions(answer: unknown): ImplementationCoverage['proven'] {
	if (!isRow(answer) || !isRow(answer.verified)) return undefined;
	const actions = count(answer.verified.actions);
	const total = count(answer.verified.total);
	if (actions === undefined || total === undefined) return undefined;
	return { actions, total };
}

type Verification = NonNullable<CriterionEvidenceSummary['verification']>;

function parseLastResult(raw: unknown): Verification['lastResult'] {
	if (!isRow(raw) || typeof raw.passed !== 'boolean') return undefined;
	const at = text(raw.at);
	// A result without a date cannot be shown as "verified <when>": leave it out.
	if (!at) return undefined;
	const summary = text(raw.summary);
	return { passed: raw.passed, at, ...(summary ? { summary } : {}) };
}

function parseVerification(raw: unknown): Verification | undefined {
	if (!isRow(raw)) return undefined;
	// The kind says how to read the rest: without it the block means nothing.
	const kind = text(raw.kind);
	if (!kind) return undefined;
	const command = text(raw.command);
	const files = firstFiles(raw.files);
	const artifacts = firstFiles(raw.artifacts);
	const lastResult = parseLastResult(raw.lastResult);
	return {
		kind,
		...(command ? { command } : {}),
		...(files ? { files } : {}),
		...(artifacts ? { artifacts } : {}),
		...(lastResult ? { lastResult } : {})
	};
}

/**
 * The engine names the state. When it names one this build does not know, the
 * state is re-derived from the facts it stands for rather than guessed: not
 * indexed is `none`, a recorded result decides, and indexed without a result is
 * `unverified`.
 */
function stateOf(row: Row, verification: Verification | undefined): CriterionEvidenceState {
	const named = STATES.find((state) => state === row.state);
	if (named) return named;
	if (row.indexed === false) return 'none';
	if (verification?.lastResult) return verification.lastResult.passed ? 'verified' : 'failing';
	return row.indexed === true ? 'unverified' : 'none';
}

/** `criteria: [...]`, or undefined when the engine did not report the block. */
export function parseCriteriaEvidence(answer: unknown): ImplementationCoverage['criteria'] {
	if (!isRow(answer) || !Array.isArray(answer.criteria)) return undefined;
	const criteria: CriterionEvidenceSummary[] = [];
	for (const raw of answer.criteria) {
		if (!isRow(raw)) continue;
		const id = text(raw.criterionId);
		if (!id) continue; // nothing to attach the evidence to
		const verification = parseVerification(raw.verification);
		criteria.push({
			id,
			title: text(raw.title) ?? id,
			standing: text(raw.standing) ?? 'active',
			state: stateOf(raw, verification),
			stale: raw.stale === true,
			...(verification ? { verification } : {})
		});
	}
	return criteria;
}
