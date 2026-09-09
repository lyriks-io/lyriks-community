import { describe, it, expect } from 'vitest';
import { parseFeaturesDraft } from './parse-features-draft';
import { familiesDirectlyUnderCore, featuresDirectlyUnderCore } from '$domain/features';

describe('parseFeaturesDraft — tree-position normalization', () => {
	// Regression: a family/feature authored WITHOUT parentFamilyId (e.g. via the
	// MCP set_section) used to keep `undefined`, which the strict `=== null` tree
	// helpers rejected — the node (and its leaves) vanished from the board while
	// the leaf count still counted them.
	it('normalizes a missing parentFamilyId to null so nodes render under their core', () => {
		const draft = parseFeaturesDraft(
			{
				cores: [{ id: 'core-a', name: 'Core A', tone: 'ops' }],
				families: [{ id: 'fam-1', name: 'Fam', coreId: 'core-a' }], // no parentFamilyId
				features: [{ id: 'feat-1', name: 'Feat', coreId: 'core-a' }] // no parentFamilyId
			},
			'proj-1'
		);

		expect(draft.families[0].parentFamilyId).toBeNull();
		expect(draft.features[0].parentFamilyId).toBeNull();
		expect(familiesDirectlyUnderCore(draft, 'core-a').map((f) => f.id)).toEqual(['fam-1']);
		expect(featuresDirectlyUnderCore(draft, 'core-a').map((f) => f.id)).toEqual(['feat-1']);
	});

	it('coerces an unknown tone to custom and a missing coreId to empty string', () => {
		const draft = parseFeaturesDraft(
			{
				cores: [{ id: 'c', name: 'C', tone: 'not-a-tone' }],
				features: [{ id: 'f', name: 'F' }] // no coreId
			},
			'proj-1'
		);
		expect(draft.cores[0].tone).toBe('custom');
		expect(draft.features[0].coreId).toBe('');
		expect(draft.features[0].parentFamilyId).toBeNull();
	});

	it('preserves an explicit parentFamilyId', () => {
		const draft = parseFeaturesDraft(
			{
				features: [{ id: 'f', name: 'F', coreId: 'c', parentFamilyId: 'fam-x' }]
			},
			'proj-1'
		);
		expect(draft.features[0].parentFamilyId).toBe('fam-x');
	});
});

describe('parseFeaturesDraft — work distribution (sprints + assignments)', () => {
	it('keeps well-formed sprints and coerces order', () => {
		const draft = parseFeaturesDraft(
			{ sprints: [{ id: 's1', name: 'Sprint 1', order: 'nope' }, { name: 'no id' }] },
			'p'
		);
		expect(draft.sprints).toEqual([{ id: 's1', name: 'Sprint 1', startDate: undefined, endDate: undefined, order: 0 }]);
	});

	it('keeps valid assignments and drops malformed ones (bad kind, missing target id, bad assignee)', () => {
		const draft = parseFeaturesDraft(
			{
				cores: [{ id: 'c1', name: 'Core', tone: 'customer' }],
				features: [{ id: 'f1', name: 'Feature', coreId: 'c1' }],
				sprints: [{ id: 's1', name: 'Sprint 1', order: 0 }],
				assignments: [
					{ id: 'ok', kind: 'feature', featureId: 'f1', assigneeId: 'u1', sprintId: null, order: 2 },
					{ id: 'ok-null', kind: 'core', coreId: 'c1', assigneeId: null, sprintId: 's1', order: 0 },
					{ id: 'bad-kind', kind: 'epic', featureId: 'f1', assigneeId: null },
					{ id: 'no-target', kind: 'feature', assigneeId: null },
					{ id: 'no-action-id', kind: 'action', featureId: 'f1', assigneeId: null },
					{ id: 'bad-assignee', kind: 'feature', featureId: 'f1', assigneeId: 42 }
				]
			},
			'p'
		);
		expect(draft.assignments!.map((a) => a.id)).toEqual(['ok', 'ok-null']);
		expect(draft.assignments![0]).toMatchObject({ kind: 'feature', featureId: 'f1', assigneeId: 'u1', order: 2 });
		expect(draft.assignments![1]).toMatchObject({ kind: 'core', coreId: 'c1', assigneeId: null, sprintId: 's1' });
	});

	it('preserves legacy actionAssignments (for one-time migration)', () => {
		const draft = parseFeaturesDraft(
			{ actionAssignments: { 'f1::send': 'u1', bogus: 5 } },
			'p'
		);
		expect(draft.actionAssignments).toEqual({ 'f1::send': 'u1' });
	});

	it('defaults sprints/assignments to empty arrays when absent', () => {
		const draft = parseFeaturesDraft({}, 'p');
		expect(draft.sprints).toEqual([]);
		expect(draft.assignments).toEqual([]);
	});
});

describe('parseFeaturesDraft — requirement sources', () => {
	it('normalizes stable source ids and drops malformed leaf metadata', () => {
		const draft = parseFeaturesDraft(
			{
				features: [{ id: 'f1', name: 'Feature', coreId: '' }],
				leafMeta: {
					f1: { sourceIds: ['source-1', 'source-1', 42], sourceLink: 'Legacy citation' },
					f2: 'invalid'
				}
			},
			'p'
		);

		expect(draft.leafMeta).toEqual({
			f1: { sourceIds: ['source-1'], sourceLink: 'Legacy citation' }
		});
	});
});
