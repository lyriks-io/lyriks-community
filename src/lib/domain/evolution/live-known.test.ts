import { describe, expect, it } from 'vitest';
import { createEvolutionRequest } from './draft';
import { KNOWN_CLIP, pageKnowledge } from './live-known';

/** Every click hands the AI what the page already holds, so it never asks it (ac-evo-live-known). */
describe('what the page already holds [criterion:ac-leaf-ac-evo-live-known]', () => {
	const request = {
		...createEvolutionRequest(),
		title: 'Permettre au client de créer sa baguette',
		origin: 'customer_feedback' as const,
		requester: 'Les clients de la boulangerie'
	};

	it('names the title, the origin and the requester', () => {
		const known = pageKnowledge(request, []);
		expect(known).toMatchObject({ title: 'Permettre au client de créer sa baguette', origin: 'Customer feedback', requester: 'Les clients de la boulangerie', answers: [] });
		expect(pageKnowledge({ ...request, requester: '  ' }, []).requester).toBeNull();
	});

	it('lists every answer given, the Need and the texts of the steps, and leaves out the empty ones', () => {
		const withSteps = {
			...request,
			stepDescriptions: { ...request.stepDescriptions, solution: 'Le client choisit farine et cuisson.' },
			stepAnswers: { ...request.stepAnswers, solution: { ...request.stepAnswers.solution, examples: 'Une baguette bien cuite aux graines.' } }
		};
		const known = pageKnowledge(withSteps, [
			{ path: '00-need.situation', label: 'Current situation', value: 'Les clients ne peuvent pas composer leur baguette.' },
			{ path: '00-need.cost', label: 'What it costs', value: '  ' }
		]);
		expect(known.answers.map((a) => a.path)).toEqual(['00-need.situation', 'step.solution.description', 'step.solution.examples']);
		expect(known.answers[2].label).toBe('solution: How we will know it works');
	});

	it('cuts a long answer, enough to know it is answered and what it says', () => {
		const long = 'x'.repeat(KNOWN_CLIP + 50);
		const [answer] = pageKnowledge(request, [{ path: '00-need.description', label: 'Description', value: long }]).answers;
		expect(answer.value).toHaveLength(KNOWN_CLIP + 3);
		expect(answer.value.endsWith('...')).toBe(true);
	});
});
