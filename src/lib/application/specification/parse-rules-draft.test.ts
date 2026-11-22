import { describe, expect, it } from 'vitest';
import { createEmptyRulesDraft } from '$domain/rules';
import { parseRulesDraft } from './parse-rules-draft';

describe('the Rules section gate on untrusted payloads', () => {
	it('reads anything but an object as an empty Rules section for the project', () => {
		for (const input of [null, undefined, 'issues', 42]) expect(parseRulesDraft(input, 'p1')).toEqual(createEmptyRulesDraft('p1'));
	});

	it('pins the project and never takes the inventory from the caller, which the load recomputes', () => {
		const parsed = parseRulesDraft({ projectId: 'other', inventory: [{ id: 'forged' }], issues: [], scenarios: [] }, 'p1');
		expect(parsed.projectId).toBe('p1');
		expect(parsed.inventory).toEqual([]);
	});

	it('keeps a well-formed issue as sent', () => {
		const issue = {
			id: 'i1',
			kind: 'missing_rule',
			title: 'Refund after 30 days',
			detail: 'Nobody decided.',
			severity: 'critical',
			status: 'accepted_risk',
			ownerRoleId: 'role-finance',
			resolutionNote: 'Owned by finance.',
			relatedRuleIds: ['r1', 'r2'],
			relatedFeatureId: 'f-refund',
			relatedJourneyId: null,
			autoDetected: true,
			detectionKey: 'refund-window',
			sourceIds: ['doc-1']
		};
		expect(parseRulesDraft({ issues: [issue] }, 'p1').issues).toEqual([issue]);
	});

	it('falls back to a safe value for every unknown or malformed field of an issue', () => {
		const [issue] = parseRulesDraft(
			{
				issues: [
					{
						id: 'i1',
						kind: 'catastrophe',
						title: 7,
						severity: 'urgent',
						status: 'done',
						ownerRoleId: 3,
						relatedRuleIds: ['r1', 'r1', '', 9, 'r2'],
						autoDetected: 'yes',
						detectionKey: ''
					}
				]
			},
			'p1'
		).issues;
		expect(issue).toMatchObject({
			kind: 'contradiction',
			title: '',
			severity: 'major',
			status: 'open',
			ownerRoleId: null,
			relatedRuleIds: ['r1', 'r2'],
			autoDetected: false
		});
		expect(issue).not.toHaveProperty('detectionKey');
	});

	it('links an edge case only to an issue the same payload carries, and reads its outcome and coverage strictly', () => {
		const { scenarios } = parseRulesDraft(
			{
				issues: [{ id: 'i1', kind: 'unhandled_edge' }],
				scenarios: [
					{ id: 'e1', title: 'Card declined', expectedOutcome: 'error', relatedIssueId: 'i1', covered: true },
					{ id: 'e2', expectedOutcome: 'explodes', relatedIssueId: 'i-gone', covered: 'yes' }
				]
			},
			'p1'
		);
		expect(scenarios.map((s) => [s.id, s.expectedOutcome, s.relatedIssueId, s.covered])).toEqual([
			['e1', 'error', 'i1', true],
			['e2', 'success', null, false]
		]);
	});
});
