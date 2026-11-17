import { describe, expect, it, vi } from 'vitest';
import type { ProjectBehavior } from '$application/ports';
import { ProjectStateCache } from '../projection/project-state-cache';
import { ReadProjectBehaviorUseCase } from './read-project-behavior';

const answer = { projectInvariants: [], coreFeatures: [], stateVariables: {}, library: {}, registeredStateIds: [] } as unknown as ProjectBehavior;

function setup(readProjectBehavior: () => Promise<ProjectBehavior | null>) {
	const advisor = { readProjectBehavior: vi.fn(readProjectBehavior) };
	const cache = new ProjectStateCache<ProjectBehavior | null>({ fingerprint: async () => 'r' }, () => 'k');
	return { advisor, useCase: new ReadProjectBehaviorUseCase(advisor, cache) };
}

describe('what the engine holds for a project is asked once per state of the spec', () => {
	it('does not ask again while nothing moved', async () => {
		const { advisor, useCase } = setup(async () => answer);
		expect(await useCase.execute('p')).toBe(answer);
		expect(await useCase.execute('p')).toBe(answer);
		expect(advisor.readProjectBehavior).toHaveBeenCalledOnce();
	});

	it('asks again after no answer, so an engine back up is read at once', async () => {
		const { advisor, useCase } = setup(async () => null);
		expect(await useCase.execute('p')).toBeNull();
		advisor.readProjectBehavior.mockResolvedValueOnce(answer);
		expect(await useCase.execute('p')).toBe(answer);
	});
});
