import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft } from '$domain/foundation';
import { classificationOf, classificationProblem, withClassification } from './classification';
import { classificationChips } from './glance';

const saved = '2026-10-27T10:00:00.000Z';
const identity = () => ({ ...createEmptyIdentityDraft('p'), industry: 'legal', productType: 'production_product', formFactors: ['api' as const], lastSavedAt: saved });
const definition = () => ({ ...createEmptyDefinitionDraft('p'), lastSavedAt: saved });

describe('the product classification', () => {
	it('reads what the spec holds, and nothing for a part never saved', () => {
		expect(classificationOf(identity(), definition())).toEqual({ marketType: 'b2b', industry: 'legal', productType: 'production_product', formFactors: ['api'] });
		expect(classificationOf({ ...identity(), lastSavedAt: null }, { ...definition(), lastSavedAt: null })).toMatchObject({ marketType: null, industry: null, productType: null });
	});

	it('keeps only the choices the catalogues offer, an industry typed by the team aside', () => {
		const ok = { marketType: 'b2c', industry: 'Wine trade', productType: 'mvp', formFactors: ['api', 'web_interface'] };
		expect(classificationProblem(ok)).toBeNull();
		expect(classificationProblem({ ...ok, marketType: 'b2x' })).toContain('market');
		expect(classificationProblem({ ...ok, productType: 'toy' })).toContain('product type');
		expect(classificationProblem({ ...ok, formFactors: ['telepathy'] })).toContain('form factor');
		expect(classificationProblem({ ...ok, industry: ' ' })).toContain('industry');
	});

	it('writes the market into the definition and the rest into the identity', () => {
		const next = withClassification(identity(), definition(), { marketType: 'b2c', industry: 'retail', productType: 'mvp', formFactors: ['api', 'api', 'desktop_gui'] });
		expect(next.definition.market.marketType).toBe('b2c');
		expect(next.identity).toMatchObject({ industry: 'retail', productType: 'mvp', formFactors: ['api', 'desktop_gui'] });
	});

	it('keeps what was there for a choice left empty', () => {
		const next = withClassification(identity(), definition(), { marketType: null, industry: null, productType: null, formFactors: [] });
		expect(next.identity).toMatchObject({ industry: 'legal', productType: 'production_product', formFactors: [] });
		expect(next.definition.market.marketType).toBe('b2b');
	});
});

describe('the chips a classification reads as, grouped by what each fills [criterion:3bb5b091]', () => {
	it('names each choice from its catalogue, an industry typed by the team as typed, under its dimension', () => {
		expect(classificationChips({ marketType: 'b2c', industry: 'Wine trade', productType: 'mvp', formFactors: [] })).toEqual([
			{ dimension: 'Market', labels: ['B2C'] },
			{ dimension: 'Industry', labels: ['Wine trade'] },
			{ dimension: 'Product type', labels: ['MVP'] }
		]);
		expect(classificationChips({ marketType: null, industry: null, productType: null, formFactors: [] })).toEqual([]);
	});

	it('keeps the form factors together in one group, and leaves out what was not chosen', () => {
		const groups = classificationChips({ marketType: null, industry: null, productType: null, formFactors: ['desktop_gui', 'cli'] as never });
		expect(groups.map((g) => g.dimension)).toEqual(['Form factors']);
		expect(groups[0].labels.length).toBe(2);
	});
});
