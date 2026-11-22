import { describe, expect, it } from 'vitest';
import { computeRulesCoherence } from './coherence';
import { createEdgeCase, createEmptyRulesDraft, createIssue, type ConsolidatedRule, type Issue, type ProjectRulesDraft } from './draft';

const RULE: ConsolidatedRule = {
	id: 'sla-1',
	label: 'Answer within a day',
	category: 'business',
	source: 'sla',
	sourceRefId: 'sla-1',
	statement: 'Every ticket is answered within 24 hours.',
	mandatory: true
};
const issue = (id: string, overrides: Partial<Issue> = {}): Issue => createIssue({ id, ...overrides });
const draft = (overrides: Partial<ProjectRulesDraft>): ProjectRulesDraft => ({ ...createEmptyRulesDraft('p1'), inventory: [RULE], ...overrides });
const scored = (d: ProjectRulesDraft) => computeRulesCoherence(d);
const codes = (d: ProjectRulesDraft) => scored(d).issues.map((i) => i.code);

describe('the Rules step coherence, computed on every save', () => {
	it('gives a mirrored inventory with nothing reviewed yet its base, half the triage and half the edge-case credit', () => {
		expect(scored(draft({})).score).toBe(10 + 30 + 15 + 15);
		expect(codes(draft({}))).toEqual([]);
	});

	it('still scores what the author wrote when no rule reaches the inventory, and says the inventory is empty', () => {
		const authored = draft({ inventory: [], scenarios: [createEdgeCase({ id: 'e1' })] });
		expect(scored(authored).score).toBe(10 + 30 + 15 + 30);
		expect(codes(authored)).toEqual(['empty-inventory']);
	});

	it('withholds the 30 points while a critical contradiction is open, and only that kind of issue', () => {
		const open = draft({ issues: [issue('c1', { kind: 'contradiction', severity: 'critical' })] });
		expect(scored(open).score).toBe(10 + 0 + 0 + 15);
		expect(codes(open)).toEqual(['open-critical-contradiction', 'open-issues']);

		const notBlocking = [
			issue('c-resolved', { kind: 'contradiction', severity: 'critical', status: 'resolved' }),
			issue('c-major', { kind: 'contradiction', severity: 'major' }),
			issue('o-critical', { kind: 'overlap', severity: 'critical' })
		];
		expect(codes(draft({ issues: notBlocking }))).not.toContain('open-critical-contradiction');
	});

	it('gives the triage points in proportion to the issues settled', () => {
		const issues = [
			issue('a', { kind: 'overlap', status: 'resolved' }),
			issue('b', { kind: 'overlap', status: 'accepted_risk' }),
			issue('c', { kind: 'overlap', status: 'wont_fix' }),
			issue('d', { kind: 'overlap', status: 'in_review' })
		];
		expect(scored(draft({ issues })).score).toBe(10 + 30 + Math.round(30 * 0.75) + 15);
		expect(codes(draft({ issues }))).toEqual(['open-issues']);
	});

	it('gives the edge-case points in proportion to the open gaps a scenario covers, settled gaps aside', () => {
		const issues = [
			issue('missing', { kind: 'missing_rule' }),
			issue('edge', { kind: 'unhandled_edge' }),
			issue('settled', { kind: 'unhandled_edge', status: 'wont_fix' })
		];
		const halfCovered = draft({ issues, scenarios: [createEdgeCase({ id: 'e1', relatedIssueId: 'missing' })] });
		expect(scored(halfCovered).score).toBe(10 + 30 + Math.round(30 / 3) + 15);
		expect(codes(halfCovered)).toEqual(['open-issues', 'uncovered-gaps']);

		const allCovered = draft({
			issues,
			scenarios: [createEdgeCase({ id: 'e1', relatedIssueId: 'missing' }), createEdgeCase({ id: 'e2', relatedIssueId: 'edge' })]
		});
		expect(codes(allCovered)).toEqual(['open-issues']);
		expect(scored(allCovered).score).toBe(10 + 30 + Math.round(30 / 3) + 30);
	});
});
