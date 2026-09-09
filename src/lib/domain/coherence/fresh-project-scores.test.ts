import { describe, it, expect } from 'vitest';
import {
	computeDefinitionCoherence,
	computeIdentityCoherence,
	computeOperationsCoherence,
	createEmptyDefinitionDraft,
	createEmptyIdentityDraft,
	createEmptyOperationsDraft
} from '$domain/foundation';
import { computeRulesCoherence, createEmptyRulesDraft } from '$domain/rules';

/**
 * A project that was only just created must not read as partly built. Every
 * section score here is credit for AUTHORED content — never for a default value
 * the creation flow itself wrote, and never for "nothing is broken yet".
 */
describe('a freshly created project scores honestly', () => {
	const identity = { ...createEmptyIdentityDraft('p'), productName: 'test' };

	it('gives the rules section no credit for an empty corpus', () => {
		expect(computeRulesCoherence(createEmptyRulesDraft('p')).score).toBe(0);
	});

	it('gives the definition slice no credit for the default market type', () => {
		expect(computeDefinitionCoherence(createEmptyDefinitionDraft('p')).score).toBe(0);
	});

	it('leaves the Foundation dimension in single digits with only a product name', () => {
		const foundation = Math.round(
			(computeIdentityCoherence(identity).score +
				computeDefinitionCoherence(createEmptyDefinitionDraft('p')).score +
				computeOperationsCoherence(
					createEmptyOperationsDraft('p'),
					identity.sourceMode !== 'greenfield'
				).score) /
				3
		);
		expect(foundation).toBeLessThanOrEqual(9);
	});
});
