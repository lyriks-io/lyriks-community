import { describe, expect, it } from 'vitest';
import { parseDefinitionDraft } from './parse-foundation-definition';

describe('parseDefinitionDraft — competitor normalization', () => {
	it('coerces a bare-string competitor into the full CompetitorEntry shape', () => {
		// Loosely-authored data (e.g. via MCP) once reached CompetitionSection raw and
		// crashed the Market tab on `competitor.strengths.length`.
		const draft = parseDefinitionDraft(
			{ competition: { directCompetitors: ['Loop Returns', 'AfterShip Returns'] } },
			'p1'
		);

		expect(draft.competition.directCompetitors).toEqual([
			{ name: 'Loop Returns', logoUrl: null, strengths: [], weaknesses: [] },
			{ name: 'AfterShip Returns', logoUrl: null, strengths: [], weaknesses: [] }
		]);
	});

	it('fills missing strengths/weaknesses on a partial competitor object', () => {
		const draft = parseDefinitionDraft(
			{ competition: { directCompetitors: [{ name: 'Acme', strengths: ['fast', 42] }] } },
			'p1'
		);

		expect(draft.competition.directCompetitors[0]).toEqual({
			name: 'Acme',
			logoUrl: null,
			strengths: ['fast'], // non-string entries dropped
			weaknesses: []
		});
	});

	it('preserves a well-formed competitor unchanged', () => {
		const entry = { name: 'Acme', logoUrl: 'x', strengths: ['a'], weaknesses: ['b'] };
		const draft = parseDefinitionDraft({ competition: { directCompetitors: [entry] } }, 'p1');
		expect(draft.competition.directCompetitors[0]).toEqual(entry);
	});
});

describe('parseDefinitionDraft — string-list normalization', () => {
	it('coerces object-shaped non-software alternatives to readable labels', () => {
		const draft = parseDefinitionDraft(
			{
				competition: {
					indirectCompetitors: [
						{ name: 'Spreadsheets' },
						{ label: 'Manual review process' },
						{ description: 'Email inbox triage' },
						{ nope: 42 },
						'Paper checklist'
					]
				}
			},
			'p1'
		);

		expect(draft.competition.indirectCompetitors).toEqual([
			'Spreadsheets',
			'Manual review process',
			'Email inbox triage',
			'Paper checklist'
		]);
	});
});

describe('parseDefinitionDraft — KPI normalization', () => {
	it('drops placeholder KPI rows that have no authored values', () => {
		const draft = parseDefinitionDraft(
			{
				businessObjective: {
					kpis: [
						{ name: '', currentValue: null, targetValue: null, unit: '%' },
						{ name: 'Median time-to-refund', currentValue: 7, targetValue: 3, unit: 'days' }
					]
				}
			},
			'p1'
		);

		expect(draft.businessObjective.kpis).toEqual([
			{ name: 'Median time-to-refund', currentValue: 7, targetValue: 3, unit: 'days' }
		]);
	});

	it('coerces KPIs given as bare strings or under a loose label key', () => {
		const draft = parseDefinitionDraft(
			{
				businessObjective: {
					kpis: ['Reduce average wait time', { label: 'Weekly active users' }, '   ']
				}
			},
			'p1'
		);

		expect(draft.businessObjective.kpis).toEqual([
			{ name: 'Reduce average wait time', currentValue: null, targetValue: null, unit: '%' },
			{ name: 'Weekly active users', currentValue: null, targetValue: null, unit: '%' }
		]);
	});
});

describe('parseDefinitionDraft — business requirement row normalization', () => {
	it('drops empty SLAs, constraints, and custom rows; keeps risks', () => {
		const draft = parseDefinitionDraft(
			{
				business: {
					risks: ['', 'Assumes finance teams trust auto-approval'],
					slas: [
						{ metric: '', commitment: '', penalty: '' },
						{ metric: 'Triage first response', commitment: '< 1 business day', penalty: '' }
					],
					contractualConstraints: ['', { label: 'Audit export must be available' }],
					custom: [
						{ label: '', value: '' },
						{ label: 'Merchant onboarding', value: 'Import active orders first' }
					]
				}
			},
			'p1'
		);

		expect(draft.business.risks).toEqual(['Assumes finance teams trust auto-approval']);
		expect(draft.business.slas).toEqual([
			{ metric: 'Triage first response', commitment: '< 1 business day', penalty: '' }
		]);
		// The retired free-text blocks are folded into the Constraints list, under Business.
		expect(draft.constraints.items.map(({ theme, description }) => ({ theme, description }))).toEqual([
			{ theme: 'Business', description: 'Audit export must be available' },
			{ theme: 'Business', description: 'Merchant onboarding: Import active orders first' }
		]);
	});
});

describe('parseDefinitionDraft — integration normalization', () => {
	it('folds a bare-string integration into `system` with sensible defaults', () => {
		// Bare strings once rendered as blank rows in the Integrations table (every
		// field undefined) though they name a real system.
		const draft = parseDefinitionDraft(
			{ technical: { integrations: ['Shopify Orders API', 'Stripe Refunds'] } },
			'p1'
		);

		expect(draft.technical.integrations).toEqual([
			{ system: 'Shopify Orders API', direction: 'both', criticality: 'medium' },
			{ system: 'Stripe Refunds', direction: 'both', criticality: 'medium' }
		]);
	});

	it('fills missing direction/criticality on a partial integration object', () => {
		const draft = parseDefinitionDraft(
			{ technical: { integrations: [{ system: 'ERP', direction: 'in' }] } },
			'p1'
		);
		expect(draft.technical.integrations[0]).toEqual({
			system: 'ERP',
			direction: 'in',
			criticality: 'medium'
		});
	});

	it('preserves a well-formed integration unchanged', () => {
		const entry = { system: 'Payroll', direction: 'out', criticality: 'high' };
		const draft = parseDefinitionDraft({ technical: { integrations: [entry] } }, 'p1');
		expect(draft.technical.integrations[0]).toEqual(entry);
	});

	/**
	 * `encryption` and `expectedCertifications` are closed vocabularies that no
	 * write path enforced, so prose landed inside them and consumers guessed. The
	 * parser now keeps the codes and relocates the prose, losing nothing.
	 */
	describe('security closed vocabularies', () => {
		const sentence =
			"Relies on Android's own full-disk encryption for the application sandbox. No data is transmitted.";

		const constraintsOf = (draft: ReturnType<typeof parseDefinitionDraft>) =>
			draft.constraints.items.map(({ theme, description }) => ({ theme, description }));

		it('keeps real codes and moves prose out of encryption into the constraints', () => {
			const draft = parseDefinitionDraft(
				{ security: { encryption: ['at_rest', sentence] } },
				'p1'
			);
			expect(draft.security.encryption).toEqual(['at_rest']);
			expect(constraintsOf(draft)).toEqual([{ theme: 'Security', description: `Encryption: ${sentence}` }]);
		});

		it('does the same for certifications, and keeps the free security requirements', () => {
			const existing = { label: 'Access', value: 'No account, no credential.' };
			const draft = parseDefinitionDraft(
				{
					security: {
						custom: [existing],
						expectedCertifications: ['ISO_27001', 'We do not seek certification.']
					}
				},
				'p1'
			);
			expect(draft.security.expectedCertifications).toEqual(['ISO_27001']);
			expect(constraintsOf(draft)).toEqual([
				{ theme: 'Security', description: 'Access: No account, no credential.' },
				{ theme: 'Compliance', description: 'We do not seek certification.' }
			]);
		});

		it('is idempotent: re-parsing moves nothing a second time', () => {
			const once = parseDefinitionDraft({ security: { encryption: [sentence] } }, 'p1');
			const twice = parseDefinitionDraft(
				JSON.parse(JSON.stringify(once)) as Record<string, unknown>,
				'p1'
			);
			expect(twice.security.encryption).toEqual([]);
			expect(twice.constraints.items).toEqual(once.constraints.items);
		});

		it('leaves a draft that already uses only codes untouched', () => {
			const draft = parseDefinitionDraft(
				{ security: { encryption: ['at_rest', 'in_transit'], expectedCertifications: ['HIPAA'] } },
				'p1'
			);
			expect(draft.security.encryption).toEqual(['at_rest', 'in_transit']);
			expect(draft.security.expectedCertifications).toEqual(['HIPAA']);
			expect(draft.constraints.items).toEqual([]);
		});
	});
});

describe('parseDefinitionDraft, constraints', () => {
	it('keeps each constraint with its id, theme and description', () => {
		const draft = parseDefinitionDraft(
			{ constraints: { items: [{ id: 'c1', theme: 'Legal', description: 'Invoices are kept ten years.' }], sourceIds: ['s1'] } },
			'p1'
		);
		expect(draft.constraints.items).toEqual([{ id: 'c1', theme: 'Legal', description: 'Invoices are kept ten years.' }]);
		expect(draft.constraints.sourceIds).toEqual(['s1']);
	});

	it('drops a row with no theme or no description', () => {
		const draft = parseDefinitionDraft(
			{ constraints: { items: [{ id: 'a', theme: '', description: 'x' }, { id: 'b', theme: 'Ops', description: ' ' }] } },
			'p1'
		);
		expect(draft.constraints.items).toEqual([]);
	});

	it('folds the technical and security custom requirements in, with ids stable across re-parses', () => {
		const legacy = {
			technical: { custom: [{ label: 'Offline mode', value: 'Read-only when the ERP link is down' }] },
			security: { custom: [{ label: '', value: 'No account, no credential.' }] }
		};
		const once = parseDefinitionDraft(legacy, 'p1');
		expect(once.constraints.items).toEqual([
			{ id: 'legacy-technical-0', theme: 'Technical', description: 'Offline mode: Read-only when the ERP link is down' },
			{ id: 'legacy-security-0', theme: 'Security', description: 'No account, no credential.' }
		]);
		expect(parseDefinitionDraft(legacy, 'p1').constraints.items).toEqual(once.constraints.items);
	});

	it('never folds the same legacy entry twice once the constraints were saved', () => {
		const saved = parseDefinitionDraft({ business: { contractualConstraints: ['Data stays in the EU'] } }, 'p1');
		const mixed = parseDefinitionDraft(
			{ ...JSON.parse(JSON.stringify(saved)), business: { contractualConstraints: ['Data stays in the EU'] } },
			'p1'
		);
		expect(mixed.constraints.items).toHaveLength(1);
	});
});

describe('parseDefinitionDraft, sources per question', () => {
	it('keeps the sources each question cites', () => {
		const draft = parseDefinitionDraft(
			{ constraints: { questionSources: { runtime: ['s1'], compliance: ['s2', 's3'] } } },
			'p1'
		);
		expect(draft.constraints.questionSources).toEqual({
			runtime: ['s1'],
			languages: [],
			security: [],
			compliance: ['s2', 's3'],
			accessibility: []
		});
	});

	it('carries the sources cited per block before, Technical to the runtime and Security to security and compliance', () => {
		const draft = parseDefinitionDraft(
			{ technical: { sourceIds: ['tech'] }, security: { sourceIds: ['sec'] } },
			'p1'
		);
		expect(draft.constraints.questionSources).toEqual({
			runtime: ['tech'],
			languages: [],
			security: ['sec'],
			compliance: ['sec'],
			accessibility: []
		});
	});

	it('never re-carries block sources once the questions hold their own', () => {
		const draft = parseDefinitionDraft(
			{ security: { sourceIds: ['sec'] }, constraints: { questionSources: { security: [] } } },
			'p1'
		);
		expect(draft.constraints.questionSources.security).toEqual([]);
		expect(draft.constraints.questionSources.compliance).toEqual([]);
	});

	it('folds what Access cited into Security, each source once', () => {
		const draft = parseDefinitionDraft(
			{ constraints: { questionSources: { access: ['a', 'b'], security: ['b', 'c'] } } },
			'p1'
		);
		expect(draft.constraints.questionSources.security).toEqual(['b', 'c', 'a']);
		expect(draft.constraints.questionSources).not.toHaveProperty('access');
	});
});
