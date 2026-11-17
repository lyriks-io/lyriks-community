import { describe, expect, it } from 'vitest';
import { roleUses } from './role-uses';

const sources = {
	users: {
		permissions: [
			{ roleId: 'r1', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'r1', capabilityId: 'action:f1:a2', capabilitySource: 'feature' },
			{ roleId: 'r1', capabilityId: 'action:f2:a9', capabilitySource: 'feature' },
			{ roleId: 'r2', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'r3', capabilityId: 'f2', capabilitySource: 'feature' }
		]
	},
	features: { features: [{ id: 'f1', name: 'Issuance' }, { id: 'f2', name: 'Credit notes' }] },
	experience: { journeys: [{ id: 'j1', name: 'Pay an invoice', actorRoleIds: ['r1'] }] },
	definition: { businessObjective: { painPointLinks: [{ id: 'p1', text: 'Late payments', roleIds: ['r1', 'r3'] }] } }
} as never;

describe('where the specification uses a user', () => {
	it('names the features its rights reach, its permissions, its journeys and its symptoms', () => {
		const used = roleUses('r1', sources);
		expect(used.summary).toBe('Used by 2 features, 3 permissions, 1 journey and 1 symptom');
		expect(used.uses.map((u) => [u.kind, u.label, u.path])).toEqual([
			['feature', 'Credit notes', 'features/f2'],
			['feature', 'Issuance', 'features/f1'],
			['permissions', 'Permissions · 3 rights', 'users#kbt-permissions'],
			['journey', 'Journey · Pay an invoice', 'experience#kbt-journey_j1'],
			['symptom', 'Symptom · Late payments', '#kbt-problem']
		]);
	});

	it('says nothing of a user nothing uses', () => {
		expect(roleUses('r9', sources)).toEqual({ summary: '', uses: [] });
		// A right on the feature itself counts the feature.
		expect(roleUses('r3', sources).summary).toBe('Used by 1 feature, 1 permission and 1 symptom');
	});
});
