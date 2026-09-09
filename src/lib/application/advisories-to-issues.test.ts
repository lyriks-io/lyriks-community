import { describe, expect, it } from 'vitest';
import { advisoriesToCandidateIssues } from './advisories-to-issues';
import type { BehaviorAdvisory } from './ports';

const specgap = (over: Partial<BehaviorAdvisory> = {}): BehaviorAdvisory => ({
	severity: 'medium',
	code: 'specgap',
	featureId: 'feat-dash',
	featureName: 'Spend dashboard',
	title: 'Behavior gaps — Spend dashboard',
	detail: '2 critical spec gap(s)',
	gaps: [
		{ entityName: 'Export CSV', reason: 'Action has no rules', suggestedFix: 'Add an allow/block rule.' },
		{ entityName: 'Spend dashboard', reason: 'No acceptance scenario', suggestedFix: '' }
	],
	...over
});

describe('advisoriesToCandidateIssues', () => {
	it('emits one issue per critical spec gap, titled with the engine reason', () => {
		const issues = advisoriesToCandidateIssues([specgap()]);
		expect(issues).toHaveLength(2);
		expect(issues[0]).toMatchObject({
			kind: 'missing_rule',
			severity: 'major',
			title: 'Spend dashboard: Action has no rules (Export CSV)'
		});
		expect(issues[0].detail).toContain('Add an allow/block rule.');
		// Gap located on the feature itself → no redundant "(Spend dashboard)" suffix.
		expect(issues[1].title).toBe('Spend dashboard: No acceptance scenario');
	});

	it('never emits the opaque "Behavior gaps — <feature>" blob (stale caches without structured gaps yield nothing)', () => {
		const issues = advisoriesToCandidateIssues([specgap({ gaps: undefined })]);
		expect(issues).toHaveLength(0);
	});

	it('caps per-feature gap issues and rolls the rest into one summary card', () => {
		const gaps = Array.from({ length: 5 }, (_, i) => ({
			entityName: `Action ${i}`,
			reason: `Gap ${i}`,
			suggestedFix: ''
		}));
		const issues = advisoriesToCandidateIssues([specgap({ gaps })]);
		expect(issues).toHaveLength(4);
		expect(issues[3].title).toBe('Spend dashboard: 2 more critical spec gap(s)');
	});

	it('keeps verify failures as a single contradiction issue', () => {
		const issues = advisoriesToCandidateIssues([
			{
				severity: 'high',
				code: 'verify',
				featureId: 'feat-dash',
				title: 'Behavior not verified — Spend dashboard',
				detail: '1 invariant violation(s)'
			}
		]);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ kind: 'contradiction', severity: 'critical' });
	});

	it('drops the capped coverage notice', () => {
		const issues = advisoriesToCandidateIssues([
			{ severity: 'low', code: 'capped', title: 'Behavior check limited', detail: '' }
		]);
		expect(issues).toHaveLength(0);
	});
});
