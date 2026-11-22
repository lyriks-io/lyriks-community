import { describe, expect, it } from 'vitest';
import { validateSectionItems } from './section-authoring-schema';

describe('section authoring schemas', () => {

	it('rejects guessed aliases, incomplete items, and invalid enums with precise paths', () => {
		const issues = validateSectionItems('features', {
			cores: [{ id: 'core-1', name: 'Chat', description: '', tone: 'chat' }],
			features: [{ id: 'feature-1', name: 'Send' }]
		});

		expect(issues.some((issue) => issue.path === 'cores[0].tone')).toBe(true);
		expect(issues.some((issue) => issue.path === 'features[0].coreId')).toBe(true);
		expect(issues.some((issue) => issue.path === 'features[0].description')).toBe(true);
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

describe('a permission carries no verb [criterion:464a725a]', () => {
	const grant = { roleId: 'r1', capabilityId: 'action:f1:a1', capabilitySource: 'feature' };

	it('never refuses a write because of a verb, known or not', () => {
		for (const action of ['read', 'execute', 'teleport', 42]) {
			expect(validateSectionItems('users', { permissions: [{ ...grant, action }] })).toEqual([]);
		}
	});

	it('still refuses a field nobody ever wrote', () => {
		expect(validateSectionItems('users', { permissions: [{ ...grant, verb: 'read' }] })).toEqual([
			{ path: 'permissions[0].verb', message: 'is not a supported field' }
		]);
	});
});
