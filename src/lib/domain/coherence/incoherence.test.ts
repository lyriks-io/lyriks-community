import { describe, expect, it } from 'vitest';
import { inferKind } from './incoherence';

describe('inferKind', () => {
	it('does not classify a missing official reference as a workflow action', () => {
		expect(
			inferKind({
				id: 'gap-architecture-refs',
				severity: 'low',
				title: '6 tech choices without an official reference',
				detail: '',
				sourceStep: 'architecture',
				blocking: false
			})
		).toBe('dangling');
	});

	it('honors the explicit kind emitted by deterministic checkers', () => {
		expect(
			inferKind({
				id: 'opaque-engine-id',
				kind: 'missing',
				severity: 'high',
				title: 'Opaque finding',
				detail: '',
				sourceStep: 'features',
				blocking: true
			})
		).toBe('missing');
	});
});

// Criterion 97f2df12: the proof travels to the card as is.
describe('toProductCoherence: a proven finding', () => {
	it('carries the proof of a gap to its card', async () => {
		const { toProductCoherence } = await import('./incoherence');
		const proof = { given: 'the starting state', when: ['Take one (qty 3)'], then: 'the stock is negative' };
		const product = toProductCoherence(
			{
				gaps: [{ id: 'unspa-proven-0', severity: 'high', title: 'The system shall...', detail: 'x', sourceStep: 'features', blocking: true, proof }],
				dimensions: [],
				readinessScore: 50,
				coherenceScore: 50
			} as never,
			() => ({ capabilityId: 'features', capabilityTitle: 'Features', fixRoute: '/f' })
		);
		expect(product.incoherences[0]?.proof).toEqual(proof);
	});
});
