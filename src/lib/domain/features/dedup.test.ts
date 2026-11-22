import { describe, expect, it } from 'vitest';
import { detectDuplicateFeatureIds } from './dedup';
import { createEmptyFeaturesDraft, createFeature, type ProjectFeaturesDraft } from './draft';

function draftWith(over: Partial<ProjectFeaturesDraft>): ProjectFeaturesDraft {
	return { ...createEmptyFeaturesDraft('p1'), ...over };
}

describe('detectDuplicateFeatureIds', () => {
	it('finds ids used more than once', () => {
		const draft = draftWith({
			features: [createFeature('', null, { id: 'a' }), createFeature('', null, { id: 'a' }), createFeature('', null, { id: 'b' })]
		});
		expect(detectDuplicateFeatureIds(draft)).toEqual(['a']);
	});
	it('is empty for a unique set', () => {
		const draft = draftWith({ features: [createFeature('', null, { id: 'a' }), createFeature('', null, { id: 'b' })] });
		expect(detectDuplicateFeatureIds(draft)).toEqual([]);
	});
});
