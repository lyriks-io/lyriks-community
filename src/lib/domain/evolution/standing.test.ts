import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, evolutionStanding } from '.';

describe('where a request stands on Changes (ac-evo-board-1, criterion b2f17eef)', () => {
	it('reads in progress while open, an approved change waiting to go live included', () => {
		expect(evolutionStanding(createEvolutionRequest({ stage: 'specification' }))).toBe('open');
		expect(evolutionStanding(createEvolutionRequest({ stage: 'delivered' }))).toBe('open');
	});

	it('reads completed once live, canceled when cancelled or closed before going live', () => {
		expect(evolutionStanding(createEvolutionRequest({ stage: 'delivered', status: 'closed' }))).toBe('deployed');
		expect(evolutionStanding(createEvolutionRequest({ stage: 'delivered', status: 'cancelled' }))).toBe('canceled');
		expect(evolutionStanding(createEvolutionRequest({ stage: 'coherence', status: 'closed' }))).toBe('canceled');
	});
});
