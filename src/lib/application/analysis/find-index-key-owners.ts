import { indexKeyOwners, type IndexKeyOwners } from '$domain/implementation';
import type { BehaviorPort } from '../ports';
import { readProjectIndexUnits } from './read-project-index-units';

/** The owners of the keys asked, and the features whose keys could not be read. */
export interface KeyOwnersAnswer extends IndexKeyOwners {
	readonly unread: readonly string[];
}

/**
 * Which feature declares each index key, and the unit it travels with
 * (feat-100, action af8d9001, criterion 60ba2862): a repository sends what
 * changed without reading every feature of the project first.
 */
export class FindIndexKeyOwnersUseCase {
	constructor(private readonly behavior: Pick<BehaviorPort, 'readProject' | 'readFeature'>) {}

	async execute(projectId: string, keys: readonly string[]): Promise<KeyOwnersAnswer> {
		const { features, unread } = await readProjectIndexUnits(this.behavior, projectId);
		return { ...indexKeyOwners(features, keys), unread };
	}
}
