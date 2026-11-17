import { describe, expect, it } from 'vitest';
import { applyRetrospecActs } from './acts';
import { emptyRetrospecDocument } from './document';
import { canReviewElement, specValidationBoard, type SpecElement } from './spec-validation';
import { requiredValidators, type TeamMember } from './spec-validators';

const element = (id: string): SpecElement => ({
	id, title: id,
	owner: ['datamap', 'data', 'stack', 'health', 'requirements', 'constraint'].includes(id.split(':')[0]) ? 'tech'
		: ['flow', 'branding', 'journey', 'component'].includes(id.split(':')[0]) ? 'design' : 'product'
});
const requirements = ['requirements:runtime', 'requirements:languages', 'requirements:security', 'requirements:compliance', 'requirements:accessibility'];
const defaults = [
	{ job: 'product', scenario: '598259ed', yes: ['product', 'permissions', 'feature:f', 'action:f:a', 'term:t'], no: ['datamap', 'journey:j'] },
	{ job: 'design', scenario: 'eae759dd', yes: ['flow:f', 'branding', 'journey:j', 'component:c'], no: ['stack:api', 'feature:f'] },
	{ job: 'tech', scenario: 'c3a8991b', yes: ['datamap', 'data:retention', 'stack:api', 'health:performance', 'constraint:c', ...requirements], no: ['product', 'term:t'] },
	{ job: 'development', scenario: '469264f2', yes: ['action:f:a', 'rule:f:r', 'flow:f', 'datamap', 'data:retention', 'stack:api', 'constraint:c', ...requirements], no: ['branding', 'product', 'feature:f'] },
	{ job: 'qa', scenario: '726484f0', yes: ['feature:f', 'action:f:a', 'rule:f:r', 'health:performance', ...requirements], no: ['term:t', 'permissions', 'stack:api'] },
	{ job: 'security', scenario: '5642351b', yes: ['permissions', 'constraint:c', 'requirements:security', 'requirements:compliance'], no: ['requirements:runtime', 'requirements:languages', 'requirements:accessibility', 'term:t'] },
	{ job: 'business', scenario: 'aee20fdf', yes: ['product', 'problem', 'target', 'core:c', 'feature:f', 'term:t'], no: ['stack:api', 'action:f:a', 'permissions'] }
];

describe('every built-in project job reviews its declared Knowledge topics [criterion:e3296696]', () => {
	it.each(defaults)('$job has matching read-only review rights [unspa:2e49df91:49fd4fc9:$scenario]', ({ job, yes, no }) => {
		const person = { id: `${job}@example.test`, name: job };
		const team: TeamMember[] = [{ person, jobIds: [job] }];
		const doc = emptyRetrospecDocument();
		const elements = [...yes, ...no].map(element);
		const board = specValidationBoard({ doc, elements, team, viewer: null, baselines: [] });
		for (const id of yes) {
			expect(board.standings[id].required, id).toEqual([person]);
			expect(canReviewElement(doc, element(id), team, person, false), id).toBe(true);
		}
		for (const id of no) {
			expect(board.standings[id].required, id).toEqual([]);
			expect(canReviewElement(doc, element(id), team, person, false), id).toBe(false);
		}
	});

	it('does not infer a built-in job from a custom name [unspa:2e49df91:49fd4fc9:4ebd2aed]', () => {
		const person = { id: 'custom@example.test', name: 'Person' };
		const team: TeamMember[] = [{ person, jobIds: ['custom-job'], jobNames: ['Tech'] }];
		const doc = emptyRetrospecDocument();
		expect(canReviewElement(doc, element('stack:api'), team, person, false)).toBe(false);
		const requested = applyRetrospecActs(doc, [{ op: 'request_validation', itemId: 'stack:api', title: 'API', to: person }], {
			actor: { id: 'lead@example.test', name: 'Lead' }, now: '2026-11-13T00:10:00.000Z'
		});
		if (!requested.ok) throw new Error(requested.reason);
		expect(canReviewElement(requested.doc, element('stack:api'), team, person, false)).toBe(true);
		expect(canReviewElement(requested.doc, element('stack:storage'), team, person, false)).toBe(false);
	});

	it('counts a lead holding several matching jobs once, then other reviewers in team order', () => {
		const lead = { id: 'lead@example.test', name: 'Lead' };
		const other = { id: 'other@example.test', name: 'Other' };
		const team = [{ person: lead, jobIds: ['product', 'development', 'qa'] }, { person: other, jobIds: ['development', 'qa'] }];
		expect(requiredValidators('product', lead, team, [other], 'action:f:a')).toEqual([lead, other]);
	});

	it('keeps role defaults after cancelling an additional request for the same person', () => {
		const person = { id: 'developer@example.test', name: 'Developer' };
		const team = [{ person, jobIds: ['development'] }];
		const result = applyRetrospecActs(emptyRetrospecDocument(), [
			{ op: 'request_validation', itemId: 'action:f:a', title: 'Action', to: person },
			{ op: 'cancel_validation_request', itemId: 'action:f:a', title: 'Action', to: person }
		], { actor: { id: 'lead@example.test', name: 'Lead' }, now: '2026-11-13T00:10:00.000Z' });
		if (!result.ok) throw new Error(result.reason);
		expect(canReviewElement(result.doc, element('action:f:a'), team, person, false)).toBe(true);
	});
});
