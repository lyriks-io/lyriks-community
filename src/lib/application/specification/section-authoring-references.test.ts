import { describe, expect, it } from 'vitest';
import { validateSectionReferences } from './section-authoring-references';

describe('references resolve inside the payload', () => {
	it('rejects a scalar field declaring a relation and an unknown field type', () => {
		const issues = validateSectionReferences('data', {
			entities: [{ id: 'record' }, { id: 'owner' }],
			fields: [{ id: 'owner-id', entityId: 'record', type: 'string', relationTargetEntityId: 'owner' }, { id: 'count', entityId: 'record', type: 'integerish' }]
		});
		expect(issues.map(i => i.path)).toEqual(['fields[0].type', 'fields[1].type']);
		expect(issues[0].message).toContain('"relation"');
	});
	// Before this guard the parsers dropped these rows and answered 200: half the
	// write vanished and the author was never told which id was wrong.
	it('names the invented id and the collection to author first (features)', () => {
		const issues = validateSectionReferences('features', {
			cores: [{ id: 'core-chat', name: 'Chat' }],
			families: [],
			features: [
				{ id: 'feat-send', name: 'Send', coreId: 'core-chat', parentFamilyId: null },
				{ id: 'feat-read', name: 'Read', coreId: 'core-typo', parentFamilyId: null }
			]
		});

		expect(issues.map((issue) => issue.path)).toEqual(['features[1].coreId']);
		expect(issues[0].message).toContain('"core-typo"');
		expect(issues[0].message).toContain('cores[]');
	});

	it('accepts null for the references that are genuinely optional', () => {
		expect(
			validateSectionReferences('data', {
				hosts: [{ id: 'host-1' }],
				databases: [{ id: 'db-1', hostId: 'host-1' }],
				entities: [
					{ id: 'entity-msg', databaseId: 'db-1' },
					{ id: 'entity-draft', databaseId: null }
				],
				fields: [
					{
						id: 'f-1',
						entityId: 'entity-msg',
						parentFieldId: null,
						relationTargetEntityId: null
					},
					{ id: 'f-2', entityId: 'entity-msg', relationTargetEntityId: 'entity-draft' }
				]
			})
		).toEqual([]);
	});

	it('catches a field hung off an entity that does not exist', () => {
		const issues = validateSectionReferences('data', {
			hosts: [],
			databases: [],
			entities: [{ id: 'entity-msg' }],
			fields: [{ id: 'f-1', entityId: 'entity-ghost' }]
		});

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toBe('fields[0].entityId');
	});

	it('rejects a grant on a role or a system capability that does not exist', () => {
		const issues = validateSectionReferences('users', {
			roles: [{ id: 'role-admin' }],
			permissions: [
				{ roleId: 'role-admin', capabilityId: 'edit_permissions', capabilitySource: 'system' },
				{ roleId: 'role-ghost', capabilityId: 'edit_permissions', capabilitySource: 'system' },
				{ roleId: 'role-admin', capabilityId: 'invented_capability', capabilitySource: 'system' },
				{ roleId: 'role-admin', capabilityId: 'cap-export', capabilitySource: 'off_structure' }
			]
		});

		expect(issues.map((issue) => issue.path)).toEqual([
			'permissions[1].roleId',
			'permissions[2].capabilityId'
		]);
		expect(issues[1].message).toContain('offStructureCapabilities');
	});

	it('ignores sections with no declared references', () => {
		expect(validateSectionReferences('glossary', { terms: [{ id: 't1' }] })).toEqual([]);
	});
});

describe('an AI client writing what a deletion does is told what it may write [criterion:99e7cc77]', () => {
	const issuesOf = (field: Record<string, unknown>) =>
		validateSectionReferences('data', {
			entities: [{ id: 'user' }, { id: 'bookmark' }],
			fields: [{ id: 'f1', entityId: 'bookmark', type: 'relation', relationTargetEntityId: 'user', ...field }]
		}).filter((i) => i.path.endsWith('.onDelete'));

	it('accepts what the code states, and a relation that states nothing', () => {
		expect(issuesOf({ onDelete: 'cascade' })).toEqual([]);
		expect(issuesOf({ onDelete: 'set_null' })).toEqual([]);
		expect(issuesOf({})).toEqual([]);
	});

	it('refuses an unknown value, a scalar field, and set_null on a required link', () => {
		expect(issuesOf({ onDelete: 'nuke' })[0].message).toMatch(/cascade, set_null or restrict/);
		expect(issuesOf({ type: 'string', relationTargetEntityId: null, onDelete: 'cascade' })[0].message).toMatch(/relation field/);
		expect(issuesOf({ isRequired: true, onDelete: 'set_null' })[0].message).toMatch(/required link is never empty/);
	});
});
