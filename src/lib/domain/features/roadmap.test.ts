import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, type Feature, type ProjectFeaturesDraft } from './draft';
import {
	activeReleases,
	activeSprints,
	archivedSprints,
	releaseAllDone,
	releaseLifecycle,
	releaseProgress,
	shippedReleases,
	sprintAllDone,
	sprintLifecycle,
	sprintProgress,
	implementationDrift,
	nextReleaseVersion,
	releaseLabel
} from './roadmap';

function leaf(id: string): Feature {
	return { id, name: id, coreId: 'core-1', parentFamilyId: null, description: '', unspaghettitFeatureId: id };
}

/** Two leaves in one release, plus a sprint holding one feature and one action item. */
function fixture(): ProjectFeaturesDraft {
	const draft = createEmptyFeaturesDraft('p1');
	draft.features.push(leaf('f1'), leaf('f2'));
	draft.releases.push({
		id: 'r1', name: 'First', version: 'V1', weekStart: 1, weekEnd: 6, order: 0, description: ''
	});
	draft.roadmapAssignments.push({ featureId: 'f1', releaseId: 'r1' }, { featureId: 'f2', releaseId: 'r1' });
	draft.sprints = [{ id: 's1', name: 'Sprint 1', order: 0 }];
	draft.assignments = [
		{ id: 'a1', kind: 'feature', featureId: 'f1', assigneeId: null, sprintId: 's1', order: 0 },
		{ id: 'a2', kind: 'action', featureId: 'f2', actionId: 'act-1', assigneeId: null, sprintId: 's1', order: 1 }
	];
	return draft;
}

describe('release lifecycle', () => {
	it('is planned while nothing started, in-progress once any leaf moves', () => {
		const draft = fixture();
		expect(releaseLifecycle(draft, draft.releases[0])).toBe('planned');
		draft.leafMeta = { f1: { status: 'in-progress' } };
		expect(releaseLifecycle(draft, draft.releases[0])).toBe('in-progress');
		expect(releaseProgress(draft, 'r1')).toBe(0);
	});

	it('derives done only when non-empty and every leaf is done', () => {
		const draft = fixture();
		draft.leafMeta = { f1: { status: 'done' }, f2: { status: 'done' } };
		expect(releaseAllDone(draft, 'r1')).toBe(true);
		expect(releaseLifecycle(draft, draft.releases[0])).toBe('done');
		expect(releaseProgress(draft, 'r1')).toBe(100);
		// An empty release is never done.
		draft.roadmapAssignments = [];
		expect(releaseAllDone(draft, 'r1')).toBe(false);
		expect(releaseLifecycle(draft, draft.releases[0])).toBe('planned');
	});

	it('archived overrides derivation and survives a reopened feature', () => {
		const draft = fixture();
		draft.releases[0].archivedAt = '2026-08-17T00:00:00.000Z';
		draft.leafMeta = { f1: { status: 'in-progress' } };
		expect(releaseLifecycle(draft, draft.releases[0])).toBe('archived');
		expect(shippedReleases(draft).map((r) => r.id)).toEqual(['r1']);
		expect(activeReleases(draft)).toEqual([]);
	});

	it('splits active from shipped: derived-done counts as shipped, un-pinned', () => {
		const draft = fixture();
		draft.leafMeta = { f1: { status: 'done' }, f2: { status: 'done' } };
		expect(shippedReleases(draft).map((r) => r.id)).toEqual(['r1']);
		// A reopened feature pulls an UN-archived release back onto the board.
		draft.leafMeta.f2 = { status: 'in-progress' };
		expect(shippedReleases(draft)).toEqual([]);
		expect(activeReleases(draft).map((r) => r.id)).toEqual(['r1']);
	});
});

describe('sprint lifecycle', () => {
	it('derives item statuses per target kind: features from leafMeta, actions from the row', () => {
		const draft = fixture();
		expect(sprintLifecycle(draft, draft.sprints![0])).toBe('planned');
		draft.leafMeta = { f1: { status: 'done' } };
		expect(sprintLifecycle(draft, draft.sprints![0])).toBe('in-progress');
		expect(sprintProgress(draft, 's1')).toBe(50);
		draft.assignments![1].status = 'done';
		expect(sprintAllDone(draft, 's1')).toBe(true);
		expect(sprintLifecycle(draft, draft.sprints![0])).toBe('done');
	});

	it('never derives done for an empty sprint', () => {
		const draft = fixture();
		draft.assignments = [];
		expect(sprintAllDone(draft, 's1')).toBe(false);
		expect(sprintProgress(draft, 's1')).toBe(0);
	});

	it('splits pickers on the archive stamp, not on derived done', () => {
		const draft = fixture();
		draft.leafMeta = { f1: { status: 'done' } };
		draft.assignments![1].status = 'done';
		// Done but not archived: still offered by pickers/filters.
		expect(activeSprints(draft).map((s) => s.id)).toEqual(['s1']);
		draft.sprints![0].archivedAt = '2026-08-17T00:00:00.000Z';
		expect(activeSprints(draft)).toEqual([]);
		expect(archivedSprints(draft).map((s) => s.id)).toEqual(['s1']);
		expect(sprintLifecycle(draft, draft.sprints![0])).toBe('archived');
	});
});

describe('implementationDrift', () => {
	const base = {
		status: 'in-progress' as const,
		found: 4,
		expected: 4,
		syncedAt: '2026-08-10T10:00:00.000Z',
		specUpdatedAt: '2026-08-10T09:00:00.000Z'
	};

	it('reports nothing when the claim matches the evidence', () => {
		expect(implementationDrift({ ...base, status: 'done' })).toBeNull();
		expect(implementationDrift({ ...base, status: 'backlog', found: 1 })).toBeNull();
	});

	it('flags a done feature the code map has not fully located', () => {
		expect(implementationDrift({ ...base, status: 'done', found: 3 })).toBe(
			'done-but-code-incomplete'
		);
	});

	it('flags a fully located feature nobody marked done', () => {
		expect(implementationDrift(base)).toBe('code-complete-but-not-done');
	});

	it('flags a spec edited after the last sync, whatever the counters say', () => {
		const moved = { ...base, specUpdatedAt: '2026-08-11T08:00:00.000Z' };
		expect(implementationDrift({ ...moved, status: 'done' })).toBe('spec-moved-since-sync');
		expect(implementationDrift({ ...moved, status: 'done', found: 1 })).toBe(
			'spec-moved-since-sync'
		);
	});

	it('needs both timestamps: an unknown one cannot prove the spec moved', () => {
		expect(implementationDrift({ ...base, specUpdatedAt: null })).toBe(
			'code-complete-but-not-done'
		);
		expect(implementationDrift({ ...base, syncedAt: null })).toBe('code-complete-but-not-done');
		expect(implementationDrift({ ...base, specUpdatedAt: 'not-a-date' })).toBe(
			'code-complete-but-not-done'
		);
	});

	it('does not fire on a sync that landed after the edit', () => {
		expect(
			implementationDrift({
				...base,
				status: 'done',
				specUpdatedAt: '2026-08-10T09:59:59.000Z'
			})
		).toBeNull();
	});
});

describe('release helpers shared by the dashboard and the API', () => {
	it('nextReleaseVersion skips badges already on the board, whatever their case', () => {
		const draft = fixture(); // holds V1
		expect(nextReleaseVersion(draft)).toBe('V2');
		draft.releases.push({
			id: 'r2', name: 'MVP', version: 'MVP', weekStart: 1, weekEnd: 2, order: 1, description: ''
		});
		draft.releases.push({
			id: 'r3', name: 'Two', version: 'v2', weekStart: 3, weekEnd: 4, order: 2, description: ''
		});
		expect(nextReleaseVersion(draft)).toBe('V3');
		expect(nextReleaseVersion(createEmptyFeaturesDraft('p2'))).toBe('V1');
	});

	it('releaseLabel says the badge, and the name only when it adds something', () => {
		expect(releaseLabel({ version: 'V1', name: 'Checkout' })).toBe('V1 "Checkout"');
		expect(releaseLabel({ version: 'MVP', name: 'mvp' })).toBe('MVP');
		expect(releaseLabel({ version: ' V2 ', name: '' })).toBe('V2');
		expect(releaseLabel({ version: '', name: 'Spring' })).toBe('"Spring"');
		expect(releaseLabel({ version: '', name: '' })).toBe('the release');
	});
});
