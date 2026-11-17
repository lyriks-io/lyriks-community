import type { EngineAnswer, UnspaghettitAdvisorPort } from '$application/ports';

/**
 * The TypeScript module mirroring a feature (its enum states, state value
 * types, action parameters and event names), as source for the repository to
 * save, so the code stops compiling when the model changes under it.
 */
export class GenerateBehaviorTypesUseCase {
	constructor(private readonly advisor: Pick<UnspaghettitAdvisorPort, 'generateTypesSource'>) {}

	execute(featureId: string): Promise<EngineAnswer | null> {
		return this.advisor.generateTypesSource(featureId);
	}
}
