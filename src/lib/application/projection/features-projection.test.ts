import { describe, it, expect } from 'vitest';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import { UNSPA_FEATURE_FORMAT, UNSPA_PROJECT_FORMAT, UNSPA_VERSION } from '$lib/unspa-schema';
import {
	buildFeaturesProjection,
	featuresDraftToBehaviorOps,
	featuresResidueFromDraft,
	type FeaturesResidue
} from './features-projection';
import { createEmptyFeaturesDraft, type WorkAssignment } from '$domain/features';

function feat(id: string, name: string, tags: { type: string; value: string }[]): UnspaFeatureSnapshot {
	return { format: UNSPA_FEATURE_FORMAT, version: UNSPA_VERSION, feature: { id, name, description: '', tags } };
}
function proj(featureIds: string[]): UnspaProjectSnapshot {
	return {
		format: UNSPA_PROJECT_FORMAT,
		version: UNSPA_VERSION,
		project: { id: 'p1', name: 'P', description: '', tags: [], featureIds, createdAt: 'x', updatedAt: 'x' }
	};
}

describe('buildFeaturesProjection', () => {
	const residue: FeaturesResidue = {
		cores: [{ id: 'core-bill', name: 'Billing', description: '', tone: 'invoicing' }],
		families: [
			{ id: 'fam-rec', name: 'Recurring', coreId: 'core-bill', parentFamilyId: null, description: '' }
		],
		releases: [
			{ id: 'rel-1', name: 'MVP', version: 'V1', weekStart: 1, weekEnd: 6, order: 0, description: '' }
		],
		lastSavedAt: null
	};

	it('joins kernel leaves + tags with residue decoration, in project order', () => {
		const kernel = {
			project: proj(['f2', 'f1']),
			features: [
				feat('f1', 'Invoice', [
					{ type: 'core', value: 'Billing' },
					{ type: 'family', value: 'Recurring' },
					{ type: 'mvp', value: 'must' },
					{ type: 'phase', value: 'V1' }
				]),
				feat('f2', 'Dunning', [{ type: 'core', value: 'Billing' }])
			]
		};

		const draft = buildFeaturesProjection('p1', kernel, residue);

		// Order follows the kernel project's featureIds.
		expect(draft.features.map((f) => f.id)).toEqual(['f2', 'f1']);
		// Decoration comes straight from residue.
		expect(draft.cores).toHaveLength(1);
		// Membership resolves tags → residue object ids.
		const f1 = draft.features.find((f) => f.id === 'f1')!;
		expect(f1.coreId).toBe('core-bill');
		expect(f1.parentFamilyId).toBe('fam-rec');
		expect(f1.unspaghettitFeatureId).toBe('f1');
		expect(draft.mvpAssignments).toEqual([{ featureId: 'f1', tier: 'must' }]);
		expect(draft.roadmapAssignments).toEqual([{ featureId: 'f1', releaseId: 'rel-1' }]);
	});

	it('matches membership tags case-insensitively (kernel lowercases tag values on write)', () => {
		// Regression: authoring behavior on a leaf via the engine re-writes its tags
		// lowercased ("Billing" -> "billing"). A case-sensitive match against the
		// proper-case residue name silently emptied the Features page.
		const kernel = {
			project: proj(['f1']),
			features: [
				feat('f1', 'Invoice', [
					{ type: 'core', value: 'billing' },
					{ type: 'family', value: 'recurring' },
					{ type: 'mvp', value: 'must' },
					{ type: 'phase', value: 'v1' }
				])
			]
		};
		const draft = buildFeaturesProjection('p1', kernel, residue);
		const f1 = draft.features.find((f) => f.id === 'f1')!;
		expect(f1.coreId).toBe('core-bill');
		expect(f1.parentFamilyId).toBe('fam-rec');
		expect(draft.roadmapAssignments).toEqual([{ featureId: 'f1', releaseId: 'rel-1' }]);
	});

	it('invents no decoration for a leaf the kernel does not place', () => {
		const kernel = { project: proj(['f1']), features: [feat('f1', 'Invoice', [])] };
		const draft = buildFeaturesProjection('p1', kernel, null);
		expect(draft.cores).toEqual([]);
		expect(draft.features[0]).toMatchObject({ id: 'f1', coreId: '', parentFamilyId: null });
	});

	/** The binding runs both ways: membership authored in unspa reaches the wizard. */
	it('materialises a core the kernel names but the residue has never seen', () => {
		const kernel = {
			project: proj(['f1']),
			// lowercased exactly as the engine stores tag values
			features: [feat('f1', 'Voice reply', [{ type: 'core', value: 'voice mode' }])]
		};
		const draft = buildFeaturesProjection('p1', kernel, null);
		expect(draft.cores).toEqual([
			{ id: 'core-voice-mode', name: 'Voice Mode', description: '', tone: 'custom' }
		]);
		expect(draft.features[0].coreId).toBe('core-voice-mode');
	});

	it('materialises every missing segment of a family path under that core', () => {
		const kernel = {
			project: proj(['f1']),
			features: [
				feat('f1', 'Folders', [
					{ type: 'core', value: 'library' },
					{ type: 'family', value: 'organize/nesting' }
				])
			]
		};
		const draft = buildFeaturesProjection('p1', kernel, null);
		expect(draft.families).toEqual([
			{ id: 'family-organize', name: 'Organize', coreId: 'core-library', parentFamilyId: null, description: '' },
			{
				id: 'family-organize-nesting',
				name: 'Nesting',
				coreId: 'core-library',
				parentFamilyId: 'family-organize',
				description: ''
			}
		]);
		expect(draft.features[0].parentFamilyId).toBe('family-organize-nesting');
	});

	it('never duplicates a core the residue already owns, whatever the tag casing', () => {
		const kernel = {
			project: proj(['f1', 'f2']),
			features: [
				feat('f1', 'A', [{ type: 'core', value: 'BILLING' }]),
				feat('f2', 'B', [{ type: 'core', value: 'billing' }])
			]
		};
		const draft = buildFeaturesProjection('p1', kernel, residue);
		expect(draft.cores.filter((c) => c.name.toLowerCase() === "billing")).toHaveLength(1);
		expect(draft.features.map((f) => f.coreId)).toEqual(['core-bill', 'core-bill']);
	});

	it('mints one object for a tag shared by many leaves, stable across loads', () => {
		const kernel = {
			project: proj(['f1', 'f2']),
			features: [
				feat('f1', 'A', [{ type: 'core', value: 'voice mode' }]),
				feat('f2', 'B', [{ type: 'core', value: 'voice mode' }])
			]
		};
		const first = buildFeaturesProjection('p1', kernel, null);
		const second = buildFeaturesProjection('p1', kernel, null);
		expect(first.cores).toHaveLength(1);
		expect(second.cores).toEqual(first.cores); // same id on every load
	});

	it('falls back to feature array order when the project snapshot is absent', () => {
		const kernel = { project: null, features: [feat('a', 'A', []), feat('b', 'B', [])] };
		const draft = buildFeaturesProjection('p1', kernel, residue);
		expect(draft.features.map((f) => f.id)).toEqual(['a', 'b']);
	});

	it('round-trips sprints + assignments through residue (Lyriks-owned decoration)', () => {
		const kernel = { project: proj(['f1']), features: [feat('f1', 'Invoice', [{ type: 'core', value: 'Billing' }])] };
		const withWork: FeaturesResidue = {
			...residue,
			sprints: [{ id: 's1', name: 'Sprint 1', order: 0 }],
			assignments: [
				{ id: 'w1', kind: 'feature', featureId: 'f1', assigneeId: 'u1', sprintId: 's1', order: 0 }
			]
		};
		const draft = buildFeaturesProjection('p1', kernel, withWork);
		expect(draft.sprints).toEqual(withWork.sprints);
		expect(draft.assignments).toEqual(withWork.assignments);
		// And the inverse split keeps them in the residue.
		expect(featuresResidueFromDraft(draft).assignments).toEqual(withWork.assignments);
		expect(featuresResidueFromDraft(draft).sprints).toEqual(withWork.sprints);
	});

	it('never turns sprints/assignments into BehaviorOps (invisible to the kernel)', () => {
		const draft = createEmptyFeaturesDraft('p1');
		draft.cores = [{ id: 'c', name: 'Billing', description: '', tone: 'invoicing' }];
		draft.features = [
			{ id: 'f1', name: 'Invoice', coreId: 'c', parentFamilyId: null, unspaghettitFeatureId: 'f1', description: '' }
		];
		draft.sprints = [{ id: 's1', name: 'Sprint 1', order: 0 }];
		draft.assignments = [
			{ id: 'w1', kind: 'action', featureId: 'f1', actionId: 'send', assigneeId: 'u1', sprintId: 's1', order: 0 } as WorkAssignment
		];
		const ops = featuresDraftToBehaviorOps(draft, { auxFeatureIds: [], currentProjectTags: [] });
		const serialized = JSON.stringify(ops);
		expect(serialized).not.toContain('w1');
		expect(serialized).not.toContain('s1');
		expect(serialized).not.toContain('assignee');
		// Only shell + project-id + project-tags ops, all behavior — no assignment op kinds.
		expect(ops.every((o) => o.kind.startsWith('upsert') || o.kind.startsWith('setProject'))).toBe(true);
	});
});
