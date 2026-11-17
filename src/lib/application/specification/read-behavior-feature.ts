import type { BehaviorPort } from '$application/ports';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

/** Read one canonical behavior snapshot with all stable child ids intact. */
export class ReadBehaviorFeatureUseCase {
	constructor(private readonly behavior: Pick<BehaviorPort, 'readFeature'>) {}

	execute(projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> {
		return this.behavior.readFeature(projectId, featureId);
	}
}
