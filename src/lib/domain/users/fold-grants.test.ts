import { describe, expect, it } from 'vitest';
import { foldGrants } from './fold-grants';
import type { PermissionGrant } from './draft';

/** Grants as a retrospec stored them before 2026-11-02: one line per verb. */
const perVerb = (roleId: string, capabilityId: string, verbs: string[]) =>
	verbs.map((action) => ({ roleId, capabilityId, capabilitySource: 'feature', action }) as PermissionGrant);

describe('grants written with verbs are read as one access each [criterion:8554bd0d]', () => {
	it('folds the lines of one role and one capability into one access, without its verb', () => {
		const stored = [
			...perVerb('member', 'action:f1:a1', ['create', 'read', 'update', 'delete']),
			...perVerb('admin', 'action:f1:a1', ['read']),
			...perVerb('member', 'action:f1:a2', ['read', 'execute'])
		];
		expect(foldGrants(stored)).toEqual([
			{ roleId: 'member', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'admin', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'member', capabilityId: 'action:f1:a2', capabilitySource: 'feature' }
		]);
	});

	it('counts accesses, never lines: 3 roles over 81 actions hold at most 243', () => {
		const roles = ['visitor', 'user', 'admin'];
		const actions = Array.from({ length: 81 }, (_, i) => `action:f:a${i}`);
		const stored = roles.flatMap((role) => actions.flatMap((capabilityId) => perVerb(role, capabilityId, ['create', 'read', 'update', 'delete'])));
		expect(stored).toHaveLength(972);
		expect(foldGrants(stored)).toHaveLength(243);
	});

	it('keeps one grant per source when an id is stored under two sources', () => {
		const grants: PermissionGrant[] = [
			{ roleId: 'r', capabilityId: 'x', capabilitySource: 'feature' },
			{ roleId: 'r', capabilityId: 'x', capabilitySource: 'off_structure' }
		];
		expect(foldGrants(grants)).toEqual(grants);
	});

	it('is idempotent', () => {
		const once = foldGrants(perVerb('member', 'action:f1:a1', ['read', 'update']));
		expect(foldGrants(once)).toEqual(once);
	});
});
