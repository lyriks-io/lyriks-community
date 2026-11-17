import { describe, expect, it } from 'vitest';
import { auditPoints, codePoints, type Gap } from '../coherence';
import { ISSUE_KINDS } from '../rules';
import { FINAL_CHECK_KIND, gapKind, issueKind, typeTitle } from './finding-kinds';
import { healthFindings } from './findings';

const gap = (fields: Partial<Gap>): Gap => ({ id: 'g', severity: 'medium', title: 't', detail: '', sourceStep: 'features', blocking: false, ...fields });

describe('every type of point says what it means on hover [criterion:4996a6b4]', () => {
	it('takes the meaning its emitter wrote first: the behavior engine knows what a Dead end is', () => {
		const kind = gapKind(gap({ kindLabel: 'Dead end', kindMeaning: 'A state a person can reach and then do nothing more.', checkId: 'behavior.model-check', provenance: 'behavior' }));
		expect(kind).toEqual({ label: 'Dead end', meaning: 'A state a person can reach and then do nothing more.' });
	});

	it('reads a gap of the check catalogue as the property it breaks, with who says so', () => {
		const kind = gapKind(gap({ kindLabel: 'Step without a screen', checkId: 'experience.plan.step-unlinked' }));
		expect(kind.label).toBe('Journey step without a screen');
		expect(kind.meaning).toContain('Every step happens on a screen');
		expect(kind.meaning).toContain('deterministic check');
	});

	it('never leaves a meaning empty, nor a label: an unknown check says who says so', () => {
		const kind = gapKind(gap({ checkId: 'nowhere', provenance: 'reviewed' }));
		expect(kind.label).toBe('Other point to review');
		expect(kind.meaning).toContain('AI consistency review');
	});

	it('explains the completeness audit and the code under their own names', () => {
		const [audit] = auditPoints([{ code: 'stale-audit', severity: 'blocking', message: 'Run the audit again.', path: 'scope' }]);
		const [code] = codePoints({ codeLinked: true, openAnalyses: [], features: [{ featureId: 'f', name: 'F', locatedActions: 2, provenActions: 0, criteria: null, drifted: false }] });
		const [a, c] = healthFindings([audit, code]).map((f) => f.kind);
		expect(a.label).toBe('Missing from the specification');
		expect(a.meaning).toMatch(/completeness audit/);
		expect(c.label).toBe('Not confirmed by the code');
		expect(c.meaning).toMatch(/code is linked/);
	});

	it('gives every kind of issue of the rules register its title and its own meaning', () => {
		const meanings = ISSUE_KINDS.map((k) => issueKind(k.code));
		expect(meanings.map((k) => k.label)).toEqual(ISSUE_KINDS.map((k) => typeTitle(k.label)));
		expect(new Set(meanings.map((k) => k.label)).size).toBe(ISSUE_KINDS.length);
		expect(new Set(meanings.map((k) => k.meaning)).size).toBe(ISSUE_KINDS.length);
	});
});

describe('every type of point is named in plain product words [criterion:72cb0b50]', () => {
	it('writes a title for the shorthand a check gives its points', () => {
		expect(gapKind(gap({ kindLabel: 'Criterion testing no feature', checkId: 'rules.criteria-attached' })).label).toBe('Criterion attached to no feature');
		expect(gapKind(gap({ kindLabel: 'Screen no step visits', checkId: 'experience.plan.screen-unvisited' })).label).toBe('Screen no journey step opens');
		expect(gapKind(gap({ kindLabel: 'Not reached', kindMeaning: 'm', provenance: 'behavior' })).label).toBe('Action or goal never reached');
		expect(gapKind(gap({ kindLabel: 'Matrix not compared' })).label).toBe('Permissions not checked against the rules');
		expect(gapKind(gap({ kindLabel: 'Spec gap', kindMeaning: 'm' })).label).toBe('Behavior too thin to check');
		expect(issueKind('unhandled_edge').label).toBe('Failure with no behavior described');
		expect(FINAL_CHECK_KIND.label).toBe('Could not be confirmed');
	});

	it('reads the same title whichever check raised the type, so its points group as one', () => {
		expect(issueKind('dead_rule').label).toBe(gapKind(gap({ kindLabel: 'Dead rule', kindMeaning: 'm' })).label);
		expect(typeTitle('Invariant violation')).toBe(typeTitle('Broken'));
	});

	it('keeps the words of a type already plain, or one no title is written for yet', () => {
		expect(typeTitle('Dead end')).toBe('Dead end');
		expect(typeTitle('Missing rule')).toBe('Missing rule');
		expect(gapKind(gap({ kindLabel: 'Something brand new', kindMeaning: 'm' })).label).toBe('Something brand new');
	});
});
