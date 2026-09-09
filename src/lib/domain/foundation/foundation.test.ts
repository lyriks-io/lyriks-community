import { describe, expect, it } from 'vitest';
import {
	createEmptyIdentityDraft,
	withoutLegacyDefinitionFields,
	type FoundationIdentityDraft
} from './identity';
import { identityCanAdvance, missingIdentityRequirements } from './can-advance';
import { computeIdentityCoherence } from './identity-coherence';

function filledDraft(): FoundationIdentityDraft {
	return {
		...createEmptyIdentityDraft('p1'),
		productName: 'PayFlow',
		brief: 'A lightweight tool to automate invoicing and dunning for European SMBs end to end.',
		formFactors: ['web_interface', 'api']
	};
}

describe('identityCanAdvance', () => {
	it('blocks an empty draft and lists only identity-owned requirements', () => {
		const draft = createEmptyIdentityDraft('p1');
		expect(identityCanAdvance(draft)).toBe(false);
		expect(missingIdentityRequirements(draft)).toEqual([
			'Product name',
			'Brief',
			'At least one form factor'
		]);
	});

	it('unlocks once identity, brief and form factor are present', () => {
		expect(identityCanAdvance(filledDraft())).toBe(true);
		expect(missingIdentityRequirements(filledDraft())).toHaveLength(0);
	});
});

describe('computeIdentityCoherence', () => {
	it('scores only the visible identity fields', () => {
		expect(computeIdentityCoherence(createEmptyIdentityDraft('p1')).score).toBe(0);
		expect(computeIdentityCoherence(filledDraft()).score).toBe(100);
	});

	it('flags inconsistent authoring pattern settings', () => {
		const draft = filledDraft();
		draft.activatedPatterns = ['plain_text'];
		const codes = computeIdentityCoherence(draft).issues.map((issue) => issue.code);
		expect(codes).toContain('default-format-not-activated');
		expect(codes).toContain('family-default-not-activated');
	});
});

describe('legacy definition migration boundary', () => {
	it('removes the retired business, market and competition copy from writes', () => {
		const legacy = {
			...filledDraft(),
			mainProblem: 'Manual work',
			painPoints: ['Slow'],
			expectedOutcome: 'Faster',
			kpis: [],
			successCriteria: ['One'],
			failureCriteria: [],
			marketType: 'b2b',
			customerSize: [],
			industrySectors: [],
			languages: [],
			regulations: [],
			competitors: [],
			differentiators: [],
			claimedCategory: ''
		} satisfies FoundationIdentityDraft;

		const canonical = withoutLegacyDefinitionFields(legacy) as unknown as Record<string, unknown>;
		expect(canonical.mainProblem).toBeUndefined();
		expect(canonical.marketType).toBeUndefined();
		expect(canonical.competitors).toBeUndefined();
	});
});
