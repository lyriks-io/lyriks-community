import { describe, it, expect } from 'vitest';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft, type WorkAssignment } from './draft';
import {
	assignmentToTarget,
	findAssignment,
	queueByAssignee,
	sprintsInUse,
	workItemLabel,
	workItemStatus
} from './queue';

function draftWith(assignments: WorkAssignment[], leafMeta = {}): ProjectFeaturesDraft {
	const d = createEmptyFeaturesDraft('p1');
	d.cores = [{ id: 'core-a', name: 'Billing', description: '', tone: 'custom' }];
	d.features = [
		{ id: 'f1', name: 'Invoice', coreId: 'core-a', parentFamilyId: null, unspaghettitFeatureId: 'f1', description: '' },
		{ id: 'f2', name: 'Dunning', coreId: 'core-a', parentFamilyId: null, unspaghettitFeatureId: 'f2', description: '' }
	];
	d.assignments = assignments;
	d.leafMeta = leafMeta;
	return d;
}

const a = (over: Partial<WorkAssignment>): WorkAssignment => ({
	id: over.id ?? 'a1',
	kind: over.kind ?? 'feature',
	assigneeId: over.assigneeId ?? null,
	sprintId: over.sprintId ?? null,
	order: over.order ?? 0,
	...over
});

describe('workItemStatus', () => {
	it('reads feature status from leafMeta (backlog → todo)', () => {
		const d = draftWith([a({ kind: 'feature', featureId: 'f1' })], { f1: { status: 'in-progress' } });
		expect(workItemStatus(d, d.assignments![0])).toBe('in-progress');
	});

	it('defaults a feature with no leafMeta to todo', () => {
		const d = draftWith([a({ kind: 'feature', featureId: 'f2' })]);
		expect(workItemStatus(d, d.assignments![0])).toBe('todo');
	});

	it('reads core/action status from the assignment itself', () => {
		const d = draftWith([a({ id: 'x', kind: 'core', coreId: 'core-a', status: 'done' })]);
		expect(workItemStatus(d, d.assignments![0])).toBe('done');
	});
});

describe('workItemLabel', () => {
	it('resolves live names for core and feature, falling back to the snapshot label', () => {
		const d = draftWith([
			a({ id: 'c', kind: 'core', coreId: 'core-a' }),
			a({ id: 'f', kind: 'feature', featureId: 'f1' }),
			a({ id: 'gone', kind: 'feature', featureId: 'missing', label: 'Removed Feature' })
		]);
		expect(workItemLabel(d, d.assignments![0])).toBe('Billing');
		expect(workItemLabel(d, d.assignments![1])).toBe('Invoice');
		expect(workItemLabel(d, d.assignments![2])).toBe('Removed Feature');
	});

	it('resolves an action name via the supplied resolver', () => {
		const d = draftWith([a({ id: 'act', kind: 'action', featureId: 'f1', actionId: 'send' })]);
		const label = workItemLabel(d, d.assignments![0], (fid, aid) =>
			fid === 'f1' && aid === 'send' ? 'Send Invoice' : undefined
		);
		expect(label).toBe('Send Invoice');
	});
});

describe('queueByAssignee', () => {
	it('groups by member, sorts by order, and surfaces the next non-done task', () => {
		const d = draftWith(
			[
				a({ id: '1', kind: 'feature', featureId: 'f1', assigneeId: 'u1', order: 1 }),
				a({ id: '2', kind: 'feature', featureId: 'f2', assigneeId: 'u1', order: 0 }),
				a({ id: '3', kind: 'core', coreId: 'core-a', assigneeId: 'u2', order: 0, status: 'todo' })
			],
			{ f2: { status: 'done' } }
		);
		const groups = queueByAssignee(d);
		const u1 = groups.find((g) => g.assigneeId === 'u1')!;
		// order 0 first (f2, done) then order 1 (f1)
		expect(u1.items.map((i) => i.id)).toEqual(['2', '1']);
		expect(u1.next!.id).toBe('1'); // f2 is done, so next is f1
		expect(u1.doneCount).toBe(1);
		expect(u1.totalCount).toBe(2);
	});

	it('puts the unassigned bucket last', () => {
		const d = draftWith([
			a({ id: '1', kind: 'feature', featureId: 'f1', assigneeId: null }),
			a({ id: '2', kind: 'feature', featureId: 'f2', assigneeId: 'u1' })
		]);
		const groups = queueByAssignee(d);
		expect(groups.at(-1)!.assigneeId).toBeNull();
	});

	it('filters to one sprint when asked', () => {
		const d = draftWith([
			a({ id: '1', kind: 'feature', featureId: 'f1', assigneeId: 'u1', sprintId: 's1' }),
			a({ id: '2', kind: 'feature', featureId: 'f2', assigneeId: 'u1', sprintId: 's2' })
		]);
		const groups = queueByAssignee(d, { sprintId: 's1' });
		expect(groups).toHaveLength(1);
		expect(groups[0].items.map((i) => i.id)).toEqual(['1']);
	});
});

describe('findAssignment / assignmentToTarget / sprintsInUse', () => {
	it('finds an assignment by its target key', () => {
		const d = draftWith([a({ id: 'x', kind: 'action', featureId: 'f1', actionId: 'send' })]);
		expect(findAssignment(d, { kind: 'action', featureId: 'f1', actionId: 'send' })?.id).toBe('x');
		expect(findAssignment(d, { kind: 'feature', featureId: 'f1' })).toBeNull();
	});

	it('round-trips a target through assignmentToTarget', () => {
		const item = a({ id: 'x', kind: 'action', featureId: 'f1', actionId: 'send' });
		expect(assignmentToTarget(item)).toEqual({ kind: 'action', featureId: 'f1', actionId: 'send' });
	});

	it('reports which sprints are referenced', () => {
		const d = draftWith([
			a({ id: '1', kind: 'feature', featureId: 'f1', sprintId: 's1' }),
			a({ id: '2', kind: 'feature', featureId: 'f2', sprintId: null })
		]);
		expect([...sprintsInUse(d)]).toEqual(['s1']);
	});
});
