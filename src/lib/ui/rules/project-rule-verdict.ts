import type { RuleVerdict, RuleVerdictKind, RuleVerdictTone } from '$application/analysis/rule-verdicts';

/**
 * The oracle's verdict on one project statement, as the Rules tab shows it.
 * Pure. "Proved" is the induction's alone: a search that found no break
 * within its bound reads "Holds for N steps", never proved.
 */

const ORACLE: Readonly<Record<string, { kind: RuleVerdictKind; label: string; tone: RuleVerdictTone; flaw: boolean }>> = {
	proved: { kind: 'proved', label: 'Proved', tone: 'success', flaw: false },
	broken: { kind: 'broken', label: 'Broken', tone: 'danger', flaw: true },
	impossible: { kind: 'impossible', label: 'Impossible', tone: 'danger', flaw: true },
	contradicted: { kind: 'contradicted', label: 'Contradicted', tone: 'danger', flaw: true },
	unsettled: { kind: 'unsettled', label: 'Unsettled', tone: 'warning', flaw: false },
	'out-of-reach': { kind: 'out-of-reach', label: "Out of the solver's reach", tone: 'neutral', flaw: false },
	'never-exercised': { kind: 'never-exercised', label: 'Never exercised', tone: 'warning', flaw: false }
};

export function projectRuleVerdict(row: Readonly<Record<string, unknown>>): RuleVerdict {
	const verdict = String(row.verdict ?? '');
	const summary = typeof row.summary === 'string' && row.summary ? { detail: row.summary } : {};
	if (verdict === 'held-within-bound') {
		const steps = typeof row.maxSteps === 'number' ? row.maxSteps : null;
		return {
			kind: 'holds-within-bound',
			label: steps === null ? 'Holds within the bound' : `Holds for ${steps} steps`,
			tone: 'neutral',
			flaw: false,
			...summary
		};
	}
	const known = ORACLE[verdict];
	if (known) return { ...known, ...summary };
	return { kind: 'not-settled', label: 'Not settled', tone: 'neutral', flaw: false, ...summary };
}
