import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, type Feature } from '$domain/features';
import { workItemCandidates } from './work-item-candidates';

function leaf(id: string, coreId = 'c1', parentFamilyId: string | null = null): Feature {
	return { id, name: id, coreId, parentFamilyId, description: '', unspaghettitFeatureId: id };
}

describe('workItemCandidates', () => {
	it('lists cores, leaf features and their actions, with queue/sprint state', () => {
		const draft = createEmptyFeaturesDraft('p1');
		draft.cores.push({ id: 'c1', name: 'Billing', description: '', tone: 'invoicing' });
		draft.features.push(leaf('f1'), leaf('f2'));
		draft.sprints = [{ id: 's1', name: 'Sprint 1', order: 0 }];
		draft.assignments = [
			{ id: 'a1', kind: 'feature', featureId: 'f1', assigneeId: null, sprintId: 's1', order: 0 },
			{ id: 'a2', kind: 'action', featureId: 'f2', actionId: 'act-1', assigneeId: null, sprintId: null, order: 1 }
		];
		const actions = {
			f2: [{ id: 'act-1', name: 'Send invoice', intent: '', surfaceId: 's', surfaceName: 'Invoice' }]
		};

		const out = workItemCandidates(draft, actions);
		expect(out.map((c) => c.key)).toEqual(['core:c1', 'feature:f1', 'feature:f2', 'action:f2::act-1']);
		expect(out[0]).toMatchObject({ kind: 'core', label: 'Billing', context: null, queued: false, sprintId: null });
		expect(out[1]).toMatchObject({ kind: 'feature', label: 'f1', context: 'Billing', queued: true, sprintId: 's1' });
		expect(out[3]).toMatchObject({ kind: 'action', label: 'Send invoice', context: 'f2', queued: true, sprintId: null });
	});
});
