import { describe, expect, it } from 'vitest';
import { parseUsersDraft, parseUsersWrite } from './parse-users-draft';

const roles = [
	{ id: 'member', name: 'Member', description: '', userCountMin: 1, userCountMax: null, tone: 'customer' },
	{ id: 'admin', name: 'Admin', description: '', userCountMin: 1, userCountMax: null, tone: 'admin' }
];
const grant = (roleId: string, capabilityId: string, action?: string) => ({
	roleId,
	capabilityId,
	capabilitySource: 'feature',
	...(action ? { action } : {})
});

describe('a write that still names a verb is accepted, and says the verb was ignored [criterion:464a725a]', () => {
	it('keeps one access per role and capability, without the verb', () => {
		const draft = parseUsersDraft(
			{
				roles,
				permissions: [
					grant('member', 'action:f1:a1', 'create'),
					grant('member', 'action:f1:a1', 'teleport'),
					grant('admin', 'action:f1:a1', 'read'),
					grant('member', 'action:f1:a2')
				]
			},
			'p1'
		);
		expect(draft.permissions).toEqual([
			{ roleId: 'member', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'admin', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'member', capabilityId: 'action:f1:a2', capabilitySource: 'feature' }
		]);
	});

	it('answers with one short note naming the ignored verb and kind', () => {
		const write = parseUsersWrite(
			{
				roles,
				permissions: [grant('member', 'action:f1:a1', 'read'), grant('member', 'action:f1:a1', 'update')],
				capabilityProfiles: [{ capabilityId: 'action:f1:a1', kind: 'data' }]
			},
			'p1'
		);
		expect(write.draft.permissions).toHaveLength(1);
		expect(write.ignored).toContain('permissions[].action ignored on 2 row(s)');
		expect(write.ignored).toContain('capabilityProfiles ignored');
		expect('capabilityProfiles' in write.draft).toBe(false);
	});

	it('says nothing when the write carries no verb and no kind', () => {
		expect(parseUsersWrite({ roles, permissions: [grant('member', 'action:f1:a1')] }, 'p1').ignored).toBeNull();
		expect(parseUsersWrite({ roles, capabilityProfiles: [] }, 'p1').ignored).toBeNull();
	});
});
