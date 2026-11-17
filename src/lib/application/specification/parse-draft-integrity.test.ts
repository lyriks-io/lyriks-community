import { describe, expect, it } from 'vitest';
import { parseDataDraft } from './parse-data-draft';
import { parseExperienceDraft } from './parse-experience-draft';
import { parseRulesDraft } from './parse-rules-draft';
import { parseUsersDraft } from './parse-users-draft';

describe('draft parser identity integrity', () => {
	it('uses deterministic legacy ids and discards ambiguous duplicate ids', () => {
		const input = {
			fields: [
				{ name: 'Email', entityId: 'customer' },
				{ id: 'field-name', name: 'Name', entityId: 'customer' },
				{ id: 'field-name', name: 'Duplicate', entityId: 'customer' }
			]
		};
		const first = parseDataDraft(input, 'project');
		const second = parseDataDraft(input, 'project');

		expect(first.fields.map((field) => field.id)).toEqual([
			'field-legacy-email',
			'field-name'
		]);
		expect(second.fields.map((field) => field.id)).toEqual(
			first.fields.map((field) => field.id)
		);
	});

	it('normalizes Experience identities without retaining legacy view state', () => {
		const parsed = parseExperienceDraft(
			{
				activeTab: 'journeys',
				selectedJourneyId: 'journey-1',
				screens: [{ name: 'Checkout' }, { id: 'screen-a' }, { id: 'screen-a' }]
			},
			'project'
		);

		expect(parsed.screens.map((screen) => screen.id)).toEqual([
			'screen-legacy-checkout',
			'screen-a'
		]);
		expect(parsed).not.toHaveProperty('activeTab');
		expect(parsed).not.toHaveProperty('selectedJourneyId');
	});

	it('deduplicates users, permission grants, issues, and edge-case links', () => {
		const users = parseUsersDraft(
			{
				roles: [
					{ id: 'role-a', name: 'Admin', tone: 'admin' },
					{ id: 'role-a', name: 'Duplicate', tone: 'ops' }
				],
				permissions: [
					{
						roleId: 'role-a',
						capabilityId: 'edit_permissions',
						capabilitySource: 'system',
						action: 'read'
					},
					{
						roleId: 'role-a',
						capabilityId: 'edit_permissions',
						capabilitySource: 'system',
						action: 'read'
					}
				]
			},
			'project'
		);
		expect(users.roles).toHaveLength(1);
		expect(users.permissions).toHaveLength(1);

		const rules = parseRulesDraft(
			{
				issues: [{ id: 'issue-a' }, { id: 'issue-a' }],
				scenarios: [{ id: 'edge-a', relatedIssueId: 'missing' }],
				activeTab: 'issues',
				selectedIssueId: 'issue-a'
			},
			'project'
		);
		expect(rules.issues).toHaveLength(1);
		expect(rules.scenarios[0].relatedIssueId).toBeNull();
		expect(rules).not.toHaveProperty('activeTab');
		expect(rules).not.toHaveProperty('selectedIssueId');
	});
});
