import { describe, expect, it } from 'vitest';
import { sortByVerdict, type RuleVerdict, type RuleVerdictTone } from './rule-verdicts';

// Draft feat-rules-edge-cases of request eeda5853: once the solver answered,
// a feature's rules read from the most worrying verdict to the most reassuring.

const verdict = (tone: RuleVerdictTone): RuleVerdict => ({ kind: 'no-flaw', label: tone, tone, flaw: tone === 'danger' });
const rule = (id: string, tone?: RuleVerdictTone) => ({ id, verdict: tone ? verdict(tone) : undefined });
const ids = (rules: { id: string }[]) => rules.map((r) => r.id);

describe('sortByVerdict', () => {
	it('reads broken first, then warnings, then the grey verdicts, then what holds, then the unknown', () => {
		const rules = [
			rule('proved', 'success'),
			rule('pending'),
			rule('bounded', 'neutral'),
			rule('broken', 'danger'),
			rule('hidden', 'warning')
		];
		expect(ids(sortByVerdict(rules, (r) => r.verdict))).toEqual([
			'broken',
			'hidden',
			'bounded',
			'proved',
			'pending'
		]);
	});

	it("keeps the model's order within one verdict", () => {
		const rules = [rule('a', 'success'), rule('b', 'danger'), rule('c', 'success'), rule('d', 'danger')];
		expect(ids(sortByVerdict(rules, (r) => r.verdict))).toEqual(['b', 'd', 'a', 'c']);
	});

	it('leaves the order as it was while no verdict is known', () => {
		const rules = [rule('c'), rule('a'), rule('b')];
		expect(ids(sortByVerdict(rules, (r) => r.verdict))).toEqual(['c', 'a', 'b']);
	});
});
