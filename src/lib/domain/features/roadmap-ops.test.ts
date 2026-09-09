import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, type Feature, type ProjectFeaturesDraft } from './draft';
import { applyRoadmapOperations, RoadmapOperationError } from './roadmap-ops';

const NOW = '2026-08-17T12:00:00.000Z';

function leaf(id: string): Feature {
	return { id, name: id, coreId: 'core-1', parentFamilyId: null, description: '', unspaghettitFeatureId: id };
}

function fixture(): ProjectFeaturesDraft {
	const draft = createEmptyFeaturesDraft('p1');
	draft.features.push(leaf('f1'), leaf('f2'));
	draft.releases.push({
		id: 'r1', name: 'First', version: 'V1', weekStart: 1, weekEnd: 6, order: 0, description: ''
	});
	draft.roadmapAssignments.push({ featureId: 'f1', releaseId: 'r1' });
	draft.actionRelease = { 'f1::act-1': 'r1' };
	draft.sprints = [{ id: 's1', name: 'Sprint 1', order: 0 }];
	draft.assignments = [
		{ id: 'a1', kind: 'feature', featureId: 'f1', assigneeId: null, sprintId: 's1', order: 0 }
	];
	return draft;
}

describe('applyRoadmapOperations', () => {
	it('creates a release with the next order and a derived version', () => {
		const draft = fixture();
		const [result] = applyRoadmapOperations(draft, [{ op: 'create_release', name: 'Next' }], NOW);
		const created = draft.releases.find((r) => r.id === result.id)!;
		expect(created.order).toBe(1);
		expect(created.version).toBe('V2');
		expect(created.name).toBe('Next');
	});

	it('archives and unarchives with the injected instant', () => {
		const draft = fixture();
		applyRoadmapOperations(draft, [{ op: 'archive_release', releaseId: 'r1' }], NOW);
		expect(draft.releases[0].archivedAt).toBe(NOW);
		// Idempotent: a second archive keeps the original stamp.
		applyRoadmapOperations(draft, [{ op: 'archive_release', releaseId: 'r1' }], '2027-01-01T00:00:00.000Z');
		expect(draft.releases[0].archivedAt).toBe(NOW);
		applyRoadmapOperations(draft, [{ op: 'unarchive_release', releaseId: 'r1' }], NOW);
		expect(draft.releases[0].archivedAt).toBeUndefined();
	});

	it('remove_release cascades roadmap assignments and per-action overrides', () => {
		const draft = fixture();
		applyRoadmapOperations(draft, [{ op: 'remove_release', releaseId: 'r1' }], NOW);
		expect(draft.releases).toEqual([]);
		expect(draft.roadmapAssignments).toEqual([]);
		expect(draft.actionRelease).toEqual({});
	});

	it('remove_sprint detaches its work items instead of dropping them', () => {
		const draft = fixture();
		applyRoadmapOperations(draft, [{ op: 'remove_sprint', sprintId: 's1' }], NOW);
		expect(draft.sprints).toEqual([]);
		expect(draft.assignments![0].sprintId).toBeNull();
	});

	it('assign_feature_to_release upserts, and null unschedules', () => {
		const draft = fixture();
		applyRoadmapOperations(
			draft,
			[
				{ op: 'create_release', id: 'r2', name: 'Second' },
				{ op: 'assign_feature_to_release', featureId: 'f1', releaseId: 'r2' },
				{ op: 'assign_feature_to_release', featureId: 'f2', releaseId: 'r2' }
			],
			NOW
		);
		expect(draft.roadmapAssignments).toEqual([
			{ featureId: 'f1', releaseId: 'r2' },
			{ featureId: 'f2', releaseId: 'r2' }
		]);
		applyRoadmapOperations(draft, [{ op: 'assign_feature_to_release', featureId: 'f1', releaseId: null }], NOW);
		expect(draft.roadmapAssignments).toEqual([{ featureId: 'f2', releaseId: 'r2' }]);
	});

	it('set_feature_sprint and set_feature_assignee queue the feature on demand', () => {
		const draft = fixture();
		applyRoadmapOperations(
			draft,
			[
				{ op: 'set_feature_sprint', featureId: 'f2', sprintId: 's1' },
				{ op: 'set_feature_assignee', featureId: 'f2', assigneeId: 'user-1' }
			],
			NOW
		);
		const created = draft.assignments!.find((a) => a.featureId === 'f2')!;
		expect(created.kind).toBe('feature');
		expect(created.sprintId).toBe('s1');
		expect(created.assigneeId).toBe('user-1');
	});

	it('set_feature_status writes leafMeta without clobbering other fields', () => {
		const draft = fixture();
		draft.leafMeta = { f1: { objective: 'Keep me' } };
		applyRoadmapOperations(draft, [{ op: 'set_feature_status', featureId: 'f1', status: 'done' }], NOW);
		expect(draft.leafMeta.f1).toEqual({ objective: 'Keep me', status: 'done' });
	});

	it('names the failing operation when a reference is unknown', () => {
		const draft = fixture();
		expect(() =>
			applyRoadmapOperations(
				draft,
				[
					{ op: 'archive_release', releaseId: 'r1' },
					{ op: 'set_feature_status', featureId: 'nope', status: 'done' }
				],
				NOW
			)
		).toThrowError(RoadmapOperationError);
		expect(() =>
			applyRoadmapOperations(draft, [{ op: 'remove_sprint', sprintId: 'nope' }], NOW)
		).toThrowError(/operations\[0\]/);
	});
});
