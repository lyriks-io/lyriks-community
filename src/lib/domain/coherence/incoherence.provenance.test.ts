import { describe, expect, it } from 'vitest';
import { nextBestFix, provenanceOf, toProductCoherence } from './incoherence';
import type { CoherenceAnalysis, Gap } from './draft';

const resolve = (step: string) => ({
	capabilityId: step,
	capabilityTitle: step === 'rules' ? 'Features › Rules & edge cases' : step,
	fixRoute: `/p/${step}`
});

describe('what a card carries', () => {
	it('derives provenance from the emitting tier when the gap declares none', () => {
		expect(provenanceOf({ id: 'dpo-type_compat-0' })).toBe('proven');
		expect(provenanceOf({ id: 'semantic-inconsistent' })).toBe('reviewed');
		expect(provenanceOf({ id: 'unspa-dead-action-0' })).toBe('behavior');
		expect(provenanceOf({ id: 'gap-users-coverage' })).toBe('detected');
		expect(provenanceOf({ id: 'gap-rules-issue-missing-x', provenance: 'declared' })).toBe('declared');
	});

	it('keeps the precise kind, the subject, the action and the destination, and falls back honestly', () => {
		const declared: Gap = {
			id: 'gap-rules-issue-missing-i1',
			severity: 'medium',
			title: 'The navigation rail is already dark',
			detail: 'why',
			sourceStep: 'rules',
			blocking: false,
			kind: 'missing',
			kindLabel: 'Missing rule',
			provenance: 'declared',
			subject: 'Dark theme',
			action: 'Decide the rule and add it to the inventory.'
		};
		const legacy: Gap = {
			id: 'gap-data-forgotten',
			severity: 'low',
			title: '2 tables have no schema',
			detail: 'Derive them.',
			sourceStep: 'data',
			blocking: false
		};
		const analysis: CoherenceAnalysis = { dimensions: [], gaps: [legacy, declared], readinessScore: 0, checksRun: ['rules.open-issues', 'data.tables-modeled', 'glossary.defined'] };
		const pc = toProductCoherence(analysis, resolve);
		const card = pc.incoherences.find((i) => i.id === declared.id)!;
		expect(card.kindLabel).toBe('Missing rule');
		expect(card.provenance).toBe('declared');
		expect(card.subject).toBe('Dark theme');
		expect(card.nextBestAction).toBe('Decide the rule and add it to the inventory.');
		expect(card.capabilityTitle).toBe('Features › Rules & edge cases');
		const old = pc.incoherences.find((i) => i.id === legacy.id)!;
		expect(old.kindLabel).toBe('Broken reference');
		expect(old.provenance).toBe('detected');
		expect(old.nextBestAction).toBe('Derive them.');
		expect(pc.checks).toEqual({ run: 3, passing: 3, failing: 0 });
		expect(pc.settled).toEqual([]);
	});

	it('puts what blocks the build first, then what weighs most', () => {
		const g = (id: string, severity: Gap['severity'], blocking: boolean): Gap => ({
			id, severity, blocking, title: id, detail: '', sourceStep: 'data'
		});
		const pc = toProductCoherence(
			{ dimensions: [], gaps: [g('low', 'low', false), g('high', 'high', false), g('block', 'medium', true)], readinessScore: 0 },
			resolve
		);
		expect(pc.incoherences.map((i) => i.id)).toEqual(['block', 'high', 'low']);
		expect(nextBestFix(pc)?.id).toBe('block');
	});

	it('counts a settled gap as a failing check: a decision never turns a check green', () => {
		const gap: Gap = { id: 'gap-users-coverage', severity: 'high', title: 't', detail: '', sourceStep: 'users', blocking: false, checkId: 'users.feature-reachable' };
		const pc = toProductCoherence(
			{
				dimensions: [],
				gaps: [],
				readinessScore: 0,
				checksRun: ['users.feature-reachable'],
				settled: [{ gap, decision: { id: 'd', gapId: gap.id, status: 'accepted_risk', reason: 'r', authorId: 'a', authorKind: 'person', decidedAt: '', gapTitle: 't', supersededById: null } }]
			},
			resolve
		);
		expect(pc.checks).toEqual({ run: 1, passing: 0, failing: 1 });
		expect(pc.settled[0].incoherence.capabilityTitle).toBe('users');
	});
});
