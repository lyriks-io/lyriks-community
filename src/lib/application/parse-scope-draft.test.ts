import { describe, expect, it } from 'vitest';
import { parseScopeDraft } from './parse-scope-draft';
import { SECTIONS } from '$lib/shared/sections';

describe('parseScopeDraft', () => {
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
