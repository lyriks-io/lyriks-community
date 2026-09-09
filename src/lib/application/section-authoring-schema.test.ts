import { describe, expect, it } from 'vitest';
import { SECTION_ITEM_SCHEMAS, validateSectionItems } from './section-authoring-schema';

describe('section authoring schemas', () => {
	it('publishes the strict fields and enum values that were previously undiscoverable', () => {
		expect(SECTION_ITEM_SCHEMAS.features?.releases.fields).toHaveProperty('version');
		expect(SECTION_ITEM_SCHEMAS.features?.releases.fields).toHaveProperty('weekStart');
		expect(SECTION_ITEM_SCHEMAS.features?.mvpAssignments.fields.tier.enum).toContain('later');
		expect(SECTION_ITEM_SCHEMAS.users?.offStructureCapabilities.fields).toHaveProperty('label');
		expect(SECTION_ITEM_SCHEMAS.rules?.scenarios.fields).toHaveProperty('whenText');
		expect(SECTION_ITEM_SCHEMAS.rules?.issues.fields.severity.enum).toEqual([
			'critical',
			'major',
			'minor'
		]);
	});

	it('rejects guessed aliases, incomplete items, and invalid enums with precise paths', () => {
		const issues = validateSectionItems('features', {
			mvpAssignments: [{ featureId: 'feature-1', tier: 'could' }],
			releases: [{ id: 'release-1', name: 'MVP' }]
		});

		expect(issues).toContainEqual({
			path: 'mvpAssignments[0].tier',
			message: 'must be one of: must, should, later, out'
		});
		expect(issues.some((issue) => issue.path === 'releases[0].version')).toBe(true);
		expect(issues.some((issue) => issue.path === 'releases[0].weekStart')).toBe(true);
	});

	it('rejects UI-crashing rule and capability aliases', () => {
		const capabilityIssues = validateSectionItems('users', {
			offStructureCapabilities: [{ id: 'cap-1', name: 'Export', note: null }]
		});
		const scenarioIssues = validateSectionItems('rules', {
			scenarios: [{ id: 'edge-1', when: 'Submit' }]
		});

		expect(capabilityIssues.some((issue) => issue.path === 'offStructureCapabilities[0].name')).toBe(true);
		expect(capabilityIssues.some((issue) => issue.path === 'offStructureCapabilities[0].label')).toBe(true);
		expect(scenarioIssues.some((issue) => issue.path === 'scenarios[0].when')).toBe(true);
		expect(scenarioIssues.some((issue) => issue.path === 'scenarios[0].whenText')).toBe(true);
	});
});

describe('citations pass the strict item schemas', () => {
	// Regression: the schemas are `additionalProperties: false`, so adding
	// `sourceIds` to a domain type without declaring it here made every citation
	// save 400 — the field validated nowhere and broke everywhere.
	it('accepts sourceIds on a role, an issue and a scenario', () => {
		expect(
			validateSectionItems('users', {
				roles: [
					{
						id: 'role-admin',
						name: 'Admin',
						description: '',
						userCountMin: 1,
						userCountMax: null,
						tone: 'admin',
						sourceIds: ['src-interview']
					}
				]
			})
		).toEqual([]);

		expect(
			validateSectionItems('rules', {
				issues: [
					{
						id: 'issue-1',
						kind: 'contradiction',
						title: 'T',
						detail: '',
						severity: 'major',
						status: 'open',
						ownerRoleId: null,
						resolutionNote: '',
						relatedRuleIds: [],
						relatedFeatureId: null,
						relatedJourneyId: null,
						autoDetected: false,
						sourceIds: ['src-gdpr']
					}
				],
				scenarios: [
					{
						id: 'edge-1',
						title: 'T',
						given: '',
						whenText: '',
						then: '',
						expectedOutcome: 'success',
						relatedIssueId: null,
						relatedJourneyId: null,
						covered: false,
						sourceIds: ['src-gdpr']
					}
				]
			})
		).toEqual([]);
	});

	it('still accepts an item with no citations at all', () => {
		expect(
			validateSectionItems('users', {
				roles: [
					{
						id: 'role-admin',
						name: 'Admin',
						description: '',
						userCountMin: 1,
						userCountMax: null,
						tone: 'admin'
					}
				]
			})
		).toEqual([]);
	});
});
