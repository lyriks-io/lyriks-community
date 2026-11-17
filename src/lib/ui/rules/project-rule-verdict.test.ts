import { describe, expect, it } from 'vitest';
import { projectRuleVerdict } from './project-rule-verdict';

describe('projectRuleVerdict', () => {
	it('reads proved only for a proof, and a bounded search as holding for its steps', () => {
		expect(projectRuleVerdict({ verdict: 'proved', summary: 'By induction.' })).toMatchObject({
			label: 'Proved',
			tone: 'success',
			detail: 'By induction.'
		});
		expect(projectRuleVerdict({ verdict: 'held-within-bound', maxSteps: 6 })).toMatchObject({
			kind: 'holds-within-bound',
			label: 'Holds for 6 steps',
			flaw: false
		});
	});

	it('counts a broken, impossible or contradicted statement as a flaw', () => {
		for (const verdict of ['broken', 'impossible', 'contradicted']) {
			expect(projectRuleVerdict({ verdict }).flaw).toBe(true);
		}
		expect(projectRuleVerdict({ verdict: 'unsettled' }).flaw).toBe(false);
	});

	it('never shows a verdict it does not know as a pass', () => {
		expect(projectRuleVerdict({ verdict: 'something-new' })).toMatchObject({ kind: 'not-settled', tone: 'neutral' });
	});
});
