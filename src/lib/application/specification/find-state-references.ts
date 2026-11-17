import type { EngineAnswer, UnspaghettitAdvisorPort } from '$application/ports';

/** Every place a feature reads or writes a state path: run before renaming or removing it. */
export class FindStateReferencesUseCase {
	constructor(private readonly advisor: Pick<UnspaghettitAdvisorPort, 'findStateReferences'>) {}

	execute(featureId: string, statePath: string): Promise<EngineAnswer | null> {
		return this.advisor.findStateReferences(featureId, statePath);
	}
}
