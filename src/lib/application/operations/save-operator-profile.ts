import { normalizeOperatorProfile, type OperatorProfile } from '$domain/settings';
import type { OperatorProfileRepositoryPort } from '../ports';

/** Persists the operator's profile (normalized through the domain). */
export class SaveOperatorProfileUseCase {
	constructor(private readonly repo: OperatorProfileRepositoryPort) {}

	async execute(input: unknown): Promise<OperatorProfile> {
		const next = normalizeOperatorProfile(input);
		await this.repo.save(next);
		return next;
	}
}
