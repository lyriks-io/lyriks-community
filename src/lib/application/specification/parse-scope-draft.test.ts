import { describe, expect, it } from 'vitest';
import { SCOPE_AUDIT_LOG_LIMIT } from '$domain/scope';
import { parseScopeDraft } from './parse-scope-draft';
import { SECTIONS } from '$lib/shared/sections';

describe('parseScopeDraft', () => {
	it('keeps where the specification stops and each group, and drops any approvalId sent [criterion:3a1f96bc]', () => {
		const draft = parseScopeDraft(
			{
				mode: 'selected_scope',
				boundary: {
					covers: ' The application. ',
					decision: 'The owner asked for the application only.',
					decidedAt: '2026-11-12',
					groups: [{ name: 'Website', summary: 'the public pages' }, { name: 'Website', summary: 'a second line' }, { name: '', summary: 'no name' }]
				},
				capabilities: [{ id: 'c1', name: 'Read the website', disposition: 'excluded', rationale: 'Outside the app.', group: ' Website ', approvalId: 'approval-1' }],
				sectionAssessments: [{ section: 'glossary', applicability: 'not_applicable', status: 'ready', rationale: 'No terms.', approvalId: 'approval-2' }]
			},
			'p1'
		);
		expect(draft.boundary).toEqual({ covers: 'The application.', decision: 'The owner asked for the application only.', decidedAt: '2026-11-12', groups: [{ name: 'Website', summary: 'the public pages' }], approval: null });
		expect(draft.capabilities[0]).toEqual({ id: 'c1', name: 'Read the website', description: '', sourceIds: [], featureIds: [], disposition: 'excluded', rationale: 'Outside the app.', group: 'Website' });
		expect(draft.sectionAssessments.find((a) => a.section === 'glossary')).toEqual({ section: 'glossary', applicability: 'not_applicable', status: 'ready', rationale: 'No terms.' });
		expect(parseScopeDraft({}, 'p1').boundary).toEqual({ covers: '', decision: '', decidedAt: null, groups: [], approval: null });
		const approval = { by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z', leftOut: 'fnv1a-1' };
		expect(parseScopeDraft({ boundary: { approval } }, 'p1').boundary.approval).toEqual(approval);
		expect(parseScopeDraft({ boundary: { approval: { by: 'x' } } }, 'p1').boundary.approval).toBeNull();
	});

	it('ignores retired operator assessments without mutating stored history or losing Baselines', () => {
		const stored = {
			sectionAssessments: [
				{ section: 'supervision', applicability: 'required', status: 'not_started' },
				{ section: 'finops', applicability: 'required', status: 'not_started' },
				{ section: 'baselines', applicability: 'required', status: 'ready' }
			]
		};
		const before = structuredClone(stored);
		const draft = parseScopeDraft(stored, 'project-1');

		expect(draft.sectionAssessments.map((row) => row.section)).not.toContain('supervision');
		expect(draft.sectionAssessments.map((row) => row.section)).not.toContain('finops');
		expect(draft.sectionAssessments).toContainEqual(
			expect.objectContaining({ section: 'baselines', status: 'ready' })
		);
		expect(stored).toEqual(before);
	});

	it('canonicalizes ids, enums and all assessable sections', () => {
		const draft = parseScopeDraft(
			{
				mode: 'full_product',
				capabilities: [
					{
						id: 'cap-1',
						name: 'Send',
						sourceIds: ['source-1', 'source-1', 42],
						featureIds: ['feature-1'],
						disposition: 'included'
					},
					{ id: 'cap-1', name: 'Duplicate' }
				],
				sectionAssessments: [
					{ section: 'features', applicability: 'required', status: 'ready' },
					{ section: 'scope', applicability: 'required', status: 'ready' }
				]
			},
			'project-1'
		);

		expect(draft.capabilities).toHaveLength(1);
		expect(draft.capabilities[0].sourceIds).toEqual(['source-1']);
		expect(draft.sectionAssessments.map((assessment) => assessment.section)).toEqual(
			SECTIONS.filter((section) => section !== 'scope')
		);
		expect(
			draft.sectionAssessments.find((assessment) => assessment.section === 'features')?.status
		).toBe('ready');
		expect(
			draft.sectionAssessments.find((assessment) => assessment.section === 'coherence')
				?.applicability
		).toBe('derived');
	});

	it('reads the audit ledger back: unknown kinds and verdicts read safely, an undated row dropped, at most the cap', () => {
		const row = { performedAt: '2026-11-17T10:00:00.000Z', scopeFingerprint: 's', modelFingerprint: 'm', kind: 'completion', actor: 'ana@acme.io', score: 88, verdict: 'ready', blockingIssues: 2, failedChecks: ['journeys'] };
		const draft = parseScopeDraft({ auditLog: [row, { ...row, kind: 'party', verdict: 'shipped', actor: '' }, { ...row, performedAt: '' }, null] }, 'p');
		expect(draft.auditLog).toEqual([row, { ...row, kind: 'audit', verdict: 'unverified', actor: 'unknown' }]);
		expect(parseScopeDraft({ auditLog: Array.from({ length: SCOPE_AUDIT_LOG_LIMIT + 5 }, () => row) }, 'p').auditLog).toHaveLength(SCOPE_AUDIT_LOG_LIMIT);
	});

	it('folds migration-era Foundation assessments into one strict verdict', () => {
		const draft = parseScopeDraft(
			{
				sectionAssessments: [
					{ section: 'initialization', status: 'ready', applicability: 'required' },
					{ section: 'framing', status: 'in_progress', applicability: 'required' },
					{ section: 'foundations', status: 'ready', applicability: 'required' }
				]
			},
			'project-1'
		);

		expect(
			draft.sectionAssessments.filter((assessment) => assessment.section === 'foundation')
		).toEqual([
			expect.objectContaining({
				section: 'foundation',
				status: 'in_progress',
				applicability: 'required'
			})
		]);
		expect(
			draft.sectionAssessments.some((assessment) =>
				['initialization', 'framing', 'foundations'].includes(assessment.section)
			)
		).toBe(false);
	});
});
