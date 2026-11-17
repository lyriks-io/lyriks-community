import { describe, expect, it } from 'vitest';
import {
	countEvolutionsInProgress,
	createDraftLeaf,
	createEvolutionRequest,
	isEvolutionInProgress
} from '.';

describe('evolutions in progress (project card counter, criterion eeb38837)', () => {
	const drafted = () => [createDraftLeaf({ name: 'Export invoices' })];

	it('counts an open request in a working stage that carries a drafted feature', () => {
		expect(isEvolutionInProgress(createEvolutionRequest({ stage: 'specification', drafts: drafted() }))).toBe(true);
		expect(isEvolutionInProgress(createEvolutionRequest({ stage: 'acceptance', drafts: drafted() }))).toBe(true);
	});

	it('counts a frozen request even when its drafts were written into the features', () => {
		expect(isEvolutionInProgress(createEvolutionRequest({ stage: 'implementation', specVersion: 1 }))).toBe(true);
	});

	it('leaves out a request that only names its need', () => {
		expect(isEvolutionInProgress(createEvolutionRequest({ stage: 'specification' }))).toBe(false);
	});

	it('leaves out delivered, draft, closed and deleted requests', () => {
		expect(isEvolutionInProgress(createEvolutionRequest({ stage: 'delivered', drafts: drafted() }))).toBe(false);
		expect(isEvolutionInProgress(createEvolutionRequest({ stage: 'draft', drafts: drafted() }))).toBe(false);
		expect(
			isEvolutionInProgress(createEvolutionRequest({ stage: 'coherence', status: 'closed', drafts: drafted() }))
		).toBe(false);
		expect(
			isEvolutionInProgress(createEvolutionRequest({ stage: 'coherence', status: 'deleted', drafts: drafted() }))
		).toBe(false);
	});

	it('counts the scenario of the criterion: two of four', () => {
		const requests = [
			createEvolutionRequest({ stage: 'specification', drafts: drafted() }),
			createEvolutionRequest({ stage: 'coherence', drafts: drafted() }),
			createEvolutionRequest({ stage: 'specification' }),
			createEvolutionRequest({ stage: 'delivered', drafts: drafted() })
		];
		expect(countEvolutionsInProgress(requests)).toBe(2);
	});
});
