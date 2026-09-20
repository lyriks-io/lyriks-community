import { describe, expect, it } from 'vitest';
import { createEmptyUsersDraft } from '$domain/users';
import { capabilityRegistry, validateCapabilityReferences } from './capability-registry';

describe('canonical capability registry', () => {
	const draft = createEmptyUsersDraft('p');
	const registry = capabilityRegistry(draft, { features: [], journeys: [], surfaces: [{ id: 'screen:editor', label: 'Editor', source: 'surface', sourceRefId: 'editor', sourceRefLabel: 'Editor' }] });
	it('exposes the exact permission payload and supported verbs', () => {
		expect(registry.find(r => r.capabilityId === 'screen:editor')).toMatchObject({ capabilitySource: 'surface', actions: ['view', 'create', 'read', 'update', 'delete'] });
	});
	it('rejects bare screen ids and gives the correction before persistence', () => {
		const issues = validateCapabilityReferences({ ...draft, permissions: [{ roleId: 'author', capabilitySource: 'surface', capabilityId: 'editor' }] }, registry);
		expect(issues[0].message).toContain('Use "screen:editor"');
	});
	it('rejects dangling ids and mismatched source namespaces', () => {
		for (const grant of [{ capabilityId: 'screen:unknown', capabilitySource: 'surface' as const }, { capabilityId: 'screen:editor', capabilitySource: 'feature' as const }]) {
			expect(validateCapabilityReferences({ ...draft, permissions: [{ ...grant, roleId: 'author' }] }, registry)).toHaveLength(1);
		}
	});
	it('accepts a grant that resolves exactly', () => {
		expect(validateCapabilityReferences({ ...draft, permissions: [{ roleId: 'author', capabilitySource: 'surface', capabilityId: 'screen:editor' }] }, registry)).toEqual([]);
	});
});
