import { describe, expect, it } from 'vitest';
import { deduplicateFeatureIds, detectDuplicateFeatureIds, remapFeatureIds } from './dedup';
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

describe('remapFeatureIds', () => {
	it('rewrites every reference to a renamed feature id', () => {
		const draft = draftWith({
			features: [createFeature('c', null, { id: 'old' })],
			mvpAssignments: [{ featureId: 'old', tier: 'must' }],
			roadmapAssignments: [{ featureId: 'old', releaseId: 'r1' }],
			leafMeta: { old: { dependsOn: ['old', 'other'] } },
			actionAssignments: { 'old::act-1': 'user-1' }
		});
		const out = remapFeatureIds(draft, new Map([['old', 'new']]));
		expect(out.features[0].id).toBe('new');
		expect(out.features[0].unspaghettitFeatureId).toBe('new'); // stays in lockstep
		expect(out.mvpAssignments[0].featureId).toBe('new');
		expect(out.roadmapAssignments[0].featureId).toBe('new');
		expect(out.leafMeta).toHaveProperty('new');
		expect(out.leafMeta!.new.dependsOn).toEqual(['new', 'other']);
		expect(out.actionAssignments).toHaveProperty('new::act-1');
	});

	it('leaves unmapped ids untouched and does not mutate the input', () => {
		const draft = draftWith({ features: [createFeature('', null, { id: 'keep' })] });
		const out = remapFeatureIds(draft, new Map([['other', 'x']]));
		expect(out.features[0].id).toBe('keep');
		expect(out).not.toBe(draft);
	});
});

describe('deduplicateFeatureIds', () => {
	it('renames only the second+ occurrence and reports the change', () => {
		let n = 0;
		const mint = () => `fresh-${++n}`;
		const draft = draftWith({
			features: [createFeature('', null, { id: 'dup', name: 'first' }), createFeature('', null, { id: 'dup', name: 'second' })]
		});
		const { draft: cleaned, remapped } = deduplicateFeatureIds(draft, mint);
		expect(cleaned.features[0].id).toBe('dup'); // first kept
		expect(cleaned.features[1].id).toBe('fresh-1'); // second renamed
		expect(cleaned.features[1].unspaghettitFeatureId).toBe('fresh-1');
		expect(remapped).toEqual({ dup: 'fresh-1' });
		expect(detectDuplicateFeatureIds(cleaned)).toEqual([]);
	});

	it('is a no-op on an already-unique draft', () => {
		const draft = draftWith({ features: [createFeature('', null, { id: 'a' }), createFeature('', null, { id: 'b' })] });
		const { draft: cleaned, remapped } = deduplicateFeatureIds(draft, () => 'x');
		expect(remapped).toEqual({});
		expect(cleaned).toBe(draft);
	});
});
