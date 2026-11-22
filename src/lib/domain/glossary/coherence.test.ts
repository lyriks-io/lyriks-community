import { describe, expect, it } from 'vitest';
import { computeGlossaryCoherence } from './coherence';
import { createEmptyGlossaryDraft, createTerm } from './draft';

const glossary = (...terms: ReturnType<typeof createTerm>[]) => ({ ...createEmptyGlossaryDraft('p'), terms });
const codes = (d: ReturnType<typeof glossary>) => computeGlossaryCoherence(d).issues.map((i) => i.code);

describe('the Glossary coherence', () => {
	it('scores 0 until a term is named, unnamed rows aside', () => {
		const result = computeGlossaryCoherence(glossary(createTerm({ term: '  ', definition: 'orphan' })));
		expect([result.score, result.issues.map((i) => i.code)]).toEqual([0, ['empty-glossary']]);
	});

	it('scores 100 with nothing to fix when every term is defined, approved and exemplified', () => {
		const full = glossary(createTerm({ term: 'Order', definition: 'A purchase.', status: 'approved', example: 'Order #12' }));
		expect([computeGlossaryCoherence(full).score, codes(full)]).toEqual([100, []]);
	});

	it('gives definitions, approvals and examples their share in proportion, and names what is missing', () => {
		const half = glossary(
			createTerm({ term: 'Order', definition: 'A purchase.', status: 'approved', example: 'Order #12' }),
			createTerm({ term: 'Refund' })
		);
		expect(computeGlossaryCoherence(half).score).toBe(10 + 20 + 15 + 10);
		expect(codes(half)).toEqual(['undefined-terms', 'unapproved-terms']);
	});
});
