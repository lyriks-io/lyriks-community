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

describe('parseFeaturesDraft, a draft that still carries the roadmap, the MVP tiers or a status', () => {
	it('parses without its releases, sprints, work assignments, action owners, contributors, MVP tiers and status', () => {
		const draft = parseFeaturesDraft(
			{
				cores: [{ id: 'c1', name: 'Core', tone: 'customer' }],
				features: [{ id: 'f1', name: 'Feature', coreId: 'c1' }],
				releases: [{ id: 'r1', name: 'V1', version: 'V1', weekStart: 1, weekEnd: 6, order: 0, description: '' }],
				roadmapAssignments: [{ featureId: 'f1', releaseId: 'r1' }],
				actionRelease: { 'f1::send': 'r1' },
				sprints: [{ id: 's1', name: 'Sprint 1', order: 0 }],
				assignments: [{ id: 'ok', kind: 'feature', featureId: 'f1', assigneeId: 'u1', sprintId: 's1', order: 2 }],
				actionAssignments: { 'f1::send': 'u1' },
				featureRoles: { f1: ['u1'] },
				actionRoles: { 'f1::send': ['u1'] },
				mvpAssignments: [{ featureId: 'f1', tier: 'must' }],
				leafMeta: { f1: { status: 'done', objective: 'Bill on time.' } }
			},
			'p'
		);
		for (const key of ['releases', 'roadmapAssignments', 'actionRelease', 'sprints', 'assignments', 'actionAssignments', 'featureRoles', 'actionRoles', 'mvpAssignments'])
			expect(draft, key).not.toHaveProperty(key);
		expect(draft.features.map((f) => f.id)).toEqual(['f1']);
		// Whether a feature is built is read from the code, never from a stored status.
		expect(draft.leafMeta?.f1).toEqual({ objective: 'Bill on time.' });
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

	it('keeps the row a value signed on a draft is waiting in', () => {
		// An evolution request writes a signed value through to the features
		// section under its draft's own id, because the feature it amends may not
		// exist yet. Pruning it as an orphan destroyed what somebody signed.
		const draft = parseFeaturesDraft(
			{
				features: [{ id: 'f1', name: 'Feature', coreId: '' }],
				leafMeta: {
					f1: { objective: 'Hold the product.' },
					'draft:9f2': { objective: 'Signed, waiting for the freeze.' },
					'feat-gone': { objective: 'A feature that no longer exists.' }
				}
			},
			'p'
		);

		expect(draft.leafMeta?.['draft:9f2']?.objective).toBe('Signed, waiting for the freeze.');
		// The prune still does the job it was written for.
		expect(draft.leafMeta?.['feat-gone']).toBeUndefined();
	});
});

describe('parseFeaturesDraft: the stage set by hand', () => {
	it('keeps a stage and reads an override saved on the old nine-step scale as its stage', () => {
		const draft = parseFeaturesDraft(
			{
				features: [
					{ id: 'f1', name: 'One', coreId: '' },
					{ id: 'f2', name: 'Two', coreId: '' },
					{ id: 'f3', name: 'Three', coreId: '' }
				],
				leafMeta: { f1: { stage: 3 }, f2: { trl: 7 }, f3: { stage: 9 } }
			},
			'p'
		);
		expect(draft.leafMeta?.f1).toEqual({ stage: 3 });
		// Seven of nine is Simulated, the fourth stage; the old key is not kept.
		expect(draft.leafMeta?.f2).toEqual({ stage: 4 });
		expect(draft.leafMeta?.f3).toEqual({ stage: 5 });
	});
});
