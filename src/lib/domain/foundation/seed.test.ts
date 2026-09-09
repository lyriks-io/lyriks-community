import { describe, expect, it } from 'vitest';
import { createEmptyIdentityDraft, type FoundationIdentityDraft } from './identity';
import { createEmptyDefinitionDraft } from './definition';
import { seedDefinitionFromIdentity } from './seed';

describe('seedDefinitionFromIdentity', () => {
	it('migrates legacy identity values into pristine definition slices', () => {
		const identity = {
			...createEmptyIdentityDraft('p1'),
			mainProblem: 'Manual work',
			painPoints: ['Slow'],
			expectedOutcome: 'Faster',
			kpis: [],
			successCriteria: ['One'],
			failureCriteria: [],
			marketType: 'b2g',
			customerSize: ['public'],
			industrySectors: ['Government'],
			languages: ['fr'],
			regulations: ['GDPR'],
			competitors: [],
			differentiators: ['Air-gapped'],
			claimedCategory: 'Specification platform'
		} satisfies FoundationIdentityDraft;

		const definition = seedDefinitionFromIdentity(createEmptyDefinitionDraft('p1'), identity);
		expect(definition.businessObjective.mainProblem).toBe('Manual work');
		expect(definition.market.marketType).toBe('b2g');
		expect(definition.competition.differentiators).toEqual(['Air-gapped']);
	});

	it('does not clobber an authored definition slice', () => {
		const definition = createEmptyDefinitionDraft('p1');
		definition.businessObjective.mainProblem = 'Canonical value';
		const legacy = {
			...createEmptyIdentityDraft('p1'),
			mainProblem: 'Old value'
		} as FoundationIdentityDraft;

		expect(seedDefinitionFromIdentity(definition, legacy).businessObjective.mainProblem).toBe(
			'Canonical value'
		);
	});
});

describe('untrustworthy identity competitor rows', () => {
	// Live regression (studio, 2026-07-23): a competitor with no `strengths`
	// array threw "x.strengths is not iterable" out of this seeder, 500ing every
	// page that loads a definition draft — including the home dashboard, which
	// loads one per project to score coherence. The whole app was unreachable
	// after login. Programmatic (MCP) authoring produces exactly these partial rows.
	const seedWith = (competitors: unknown) =>
		seedDefinitionFromIdentity(createEmptyDefinitionDraft('p1'), {
			...createEmptyIdentityDraft('p1'),
			competitors
		} as unknown as FoundationIdentityDraft).competition.directCompetitors;

	it('survives a competitor missing strengths/weaknesses', () => {
		expect(seedWith([{ name: 'Zapier' }])).toEqual([
			{ name: 'Zapier', logoUrl: null, strengths: [], weaknesses: [] }
		]);
	});

	it('survives a competitor authored as a bare string', () => {
		expect(seedWith(['Make.com'])).toEqual([
			{ name: 'Make.com', logoUrl: null, strengths: [], weaknesses: [] }
		]);
	});

	it('keeps the values a well-formed row does carry', () => {
		expect(
			seedWith([{ name: 'n8n', logoUrl: 'https://x/y.png', strengths: ['OSS'], weaknesses: [] }])
		).toEqual([{ name: 'n8n', logoUrl: 'https://x/y.png', strengths: ['OSS'], weaknesses: [] }]);
	});

	it('drops non-string members instead of rendering them', () => {
		expect(seedWith([{ name: 'X', strengths: ['ok', 42, null] }])[0].strengths).toEqual(['ok']);
	});
});
