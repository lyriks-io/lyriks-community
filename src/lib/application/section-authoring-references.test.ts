import { describe, expect, it } from 'vitest';
import { validateSectionReferences } from './section-authoring-references';

describe('references resolve inside the payload', () => {
	// Before this guard the parsers dropped these rows and answered 200: half the
	// write vanished and the author was never told which id was wrong.
	it('names the invented id and the collection to author first (features)', () => {
		const issues = validateSectionReferences('features', {
			cores: [{ id: 'core-chat', name: 'Chat' }],
			families: [],
			features: [{ id: 'feat-send', name: 'Send', coreId: 'core-chat', parentFamilyId: null }],
			releases: [{ id: 'release-v1', name: 'V1' }],
			mvpAssignments: [
				{ featureId: 'feat-send', tier: 'must' },
				{ featureId: 'feat-typo', tier: 'should' }
			],
			roadmapAssignments: [{ featureId: 'feat-send', releaseId: 'release-v2' }]
		});

		expect(issues.map((issue) => issue.path)).toEqual([
			'mvpAssignments[1].featureId',
			'roadmapAssignments[0].releaseId'
		]);
		expect(issues[0].message).toContain('"feat-typo"');
		expect(issues[0].message).toContain('features[]');
		expect(issues[1].message).toContain('releases[]');
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
