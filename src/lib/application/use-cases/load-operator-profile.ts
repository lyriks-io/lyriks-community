import type { OperatorProfile } from '$domain/settings';
import type { OperatorProfileRepositoryPort } from '../ports';

/** Reads the single operator's profile (Community / solo editions). */
export class LoadOperatorProfileUseCase {
	constructor(private readonly repo: OperatorProfileRepositoryPort) {}

	execute(): Promise<OperatorProfile> {
		return this.repo.load();
	}
}
