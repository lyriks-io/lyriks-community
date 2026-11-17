import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft } from '$domain/foundation';
import type { AiSuggesterPort, PersonaContextPassage } from '../ports';
import { SuggestPersonasUseCase } from './suggest-personas';

function capture() {
	const seen: PersonaContextPassage[][] = [];
	const ai = { suggestPersonas: async (c: readonly PersonaContextPassage[]) => (seen.push([...c]), []) };
	return { seen, useCase: new SuggestPersonasUseCase(ai as unknown as AiSuggesterPort) };
}

describe('SuggestPersonasUseCase [criterion:6b26cc3b]', () => {
	const identity = { ...createEmptyIdentityDraft('p1'), brief: 'Employees book rooms.' };
	const definition = createEmptyDefinitionDraft('p1');
	definition.businessObjective.affectedPersonas = ['employee', 'site_manager'];

	it('seeds an empty Users section from the legacy affected personas', async () => {
		const { seen, useCase } = capture();
		await useCase.execute(identity, definition, 0);
		expect(seen[0].filter((p) => p.where === 'affected persona').map((p) => p.text)).toEqual([
			'employee',
			'site_manager'
		]);
	});

	it('stops offering them once a persona is described, keeping the brief', async () => {
		const { seen, useCase } = capture();
		await useCase.execute(identity, definition, 2);
		expect(seen[0].some((p) => p.where === 'affected persona')).toBe(false);
		expect(seen[0].some((p) => p.where === 'brief')).toBe(true);
	});
});
