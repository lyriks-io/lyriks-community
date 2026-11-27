import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, type RetrospecDocument } from './document';
import { reviewJobsOf, whatJobsValidate, whatTopicsValidate } from './review-jobs';
import { canReviewElement, specValidationBoard, waitingOn, type SpecElement } from './spec-validation';
import { eligibleValidators, reviewSeats, type TeamMember } from './spec-validators';

const element = (id: string): SpecElement => ({ id, title: id });
const requirements = ['requirements:runtime', 'requirements:languages', 'requirements:security', 'requirements:compliance', 'requirements:accessibility'];
const defaults = [
	{ job: 'product', scenario: '598259ed', yes: ['product', 'role:r', 'permissions', 'feature:f', 'action:f:a', 'term:t'], no: ['datamap', 'journey:j'] },
	{ job: 'design', scenario: 'eae759dd', yes: ['flow:f', 'branding', 'journey:j', 'component:c', 'requirements:accessibility'], no: ['stack:api', 'feature:f', 'requirements:runtime'] },
	{ job: 'tech', scenario: 'c3a8991b', yes: ['datamap', 'stack:api', 'health:performance', ...requirements], no: ['product', 'term:t', 'data:retention', 'constraint:c'] },
	{ job: 'development', scenario: '469264f2', yes: ['action:f:a', 'rule:f:r', 'flow:f', 'data:retention', 'constraint:c'], no: ['branding', 'product', 'feature:f', 'stack:api', 'datamap', ...requirements] },
	{ job: 'qa', scenario: '726484f0', yes: ['feature:f', 'action:f:a', 'rule:f:r', 'journey:j', 'health:performance', ...requirements], no: ['term:t', 'permissions', 'stack:api'] },
	{ job: 'security', scenario: '5642351b', yes: ['permissions', 'data:retention', 'constraint:c', 'requirements:security', 'requirements:compliance'], no: ['requirements:runtime', 'requirements:languages', 'requirements:accessibility', 'term:t'] },
	{ job: 'business', scenario: 'aee20fdf', yes: ['product', 'problem', 'target', 'core:c', 'feature:f', 'term:t'], no: ['stack:api', 'action:f:a', 'permissions'] }
];

const lead = { id: 'lead@example.test', name: 'Lead' };
const ana = { id: 'ana@example.test', name: 'Ana' };
const bob = { id: 'bob@example.test', name: 'Bob' };

function act(doc: RetrospecDocument, acts: RetrospecAct[], actor = lead): RetrospecDocument {
	const out = applyRetrospecActs(doc, acts, { actor, now: '2026-11-24T10:00:00.000Z' });
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
}
const validate = (itemId: string): RetrospecAct => ({ op: 'validate', itemId, title: itemId, tab: 'spec360' });

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
		const other = { id: 'other@example.test', name: 'Other' };
		const team = [{ person: lead, jobIds: ['product', 'development', 'qa'] }, { person: other, jobIds: ['development', 'qa'] }];
		expect(eligibleValidators(reviewSeats(lead, team, [other], 'action:f:a'))).toEqual([lead, other]);
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

describe('one validation per job, like a code owner team [criterion:f02f078b]', () => {
	const team: TeamMember[] = [{ person: ana, jobIds: ['development'] }, { person: bob, jobIds: ['development'] }];
	const constraint = element('constraint:c');

	it('waits on the lead and on every holder until one of them validates', () => {
		const board = specValidationBoard({ doc: act(emptyRetrospecDocument(), [validate('product')]), elements: [constraint], team, viewer: lead, baselines: [] });
		expect(board.standings['constraint:c']).toMatchObject({ state: 'todo', required: [lead, ana, bob], missing: [lead, ana, bob] });
	});

	it('no longer waits on the other holders once one gave the job its validation [unspa:2e49df91:942d5827:d72c985d]', () => {
		const doc = act(act(emptyRetrospecDocument(), [validate('product')]), [validate('constraint:c')], ana);
		const board = specValidationBoard({ doc, elements: [constraint], team, viewer: lead, baselines: [] });
		expect(board.standings['constraint:c']).toMatchObject({ state: 'waiting', required: [lead, ana], missing: [lead] });
		expect(waitingOn(board, bob)).toEqual([]);
		expect(canReviewElement(doc, constraint, team, bob, false)).toBe(false);
		expect(canReviewElement(doc, constraint, team, ana, false)).toBe(true);
		const settled = specValidationBoard({ doc: act(doc, [validate('constraint:c')]), elements: [constraint], team, viewer: lead, baselines: [] });
		expect(settled.standings['constraint:c'].state).toBe('ok');
		expect(settled.pct).toBe(100);
	});

	it('waits on every holder again when the one who validated withdraws', () => {
		const given = act(act(emptyRetrospecDocument(), [validate('product')]), [validate('constraint:c')], ana);
		const doc = act(given, [{ op: 'withdraw', itemId: 'constraint:c' }], ana);
		const board = specValidationBoard({ doc, elements: [constraint], team, viewer: lead, baselines: [] });
		expect(board.standings['constraint:c'].missing).toEqual([lead, ana, bob]);
	});

	it('keeps a holder asked by name required in person', () => {
		const asked = act(act(emptyRetrospecDocument(), [validate('product')]), [{ op: 'request_validation', itemId: 'constraint:c', title: 'c', to: bob }]);
		const doc = act(asked, [validate('constraint:c')], ana);
		const board = specValidationBoard({ doc, elements: [constraint], team, viewer: lead, baselines: [] });
		expect(board.standings['constraint:c'].missing).toEqual([lead, bob]);
	});

	it('lets the lead give every job they hold with their own validation', () => {
		const leading: TeamMember[] = [{ person: lead, jobIds: ['development'] }, ...team];
		const doc = act(emptyRetrospecDocument(), [validate('constraint:c')]);
		const board = specValidationBoard({ doc, elements: [constraint], team: leading, viewer: lead, baselines: [] });
		expect(board.standings['constraint:c'].state).toBe('ok');
	});

	it('counts the validations needed by seat, never by person', () => {
		const board = specValidationBoard({ doc: act(emptyRetrospecDocument(), [validate('constraint:c')], ana), elements: [constraint], team, viewer: lead, baselines: [] });
		// Seats: the lead (Ana, who started the run) and Development; Ana's one validation fills both.
		expect(board.lead).toEqual(ana);
		expect(board.pct).toBe(100);
	});
});

describe('what a job makes a person validate', () => {
	it('reads Tech apart from Development', () => {
		expect(whatJobsValidate(['tech'])).toBe('the data map, stack, operations and requirements');
		expect(whatJobsValidate(['development'])).toBe('the actions, rules, feature flows, data and technical constraints');
	});

	it('names a group of requirements only when the job does not review them all', () => {
		expect(whatJobsValidate(['design'])).toBe('the feature flows, branding, journeys, components and accessibility requirements');
		expect(whatJobsValidate(['tech', 'security'])).not.toContain('security requirements');
	});

	it('reads nothing for a job the workspace added', () => {
		expect(whatJobsValidate(['custom-job'])).toBeNull();
		expect(whatJobsValidate([])).toBeNull();
	});
});

describe('a job validates the topics its workspace chose, else its defaults [criterion:e3296696]', () => {
	const person = { id: 'ops@example.test', name: 'Ops' };
	const doc = emptyRetrospecDocument();

	it('makes a job the workspace added validate the topic it ticked [unspa:2e49df91:49fd4fc9:11b0cf37]', () => {
		const team: TeamMember[] = [{ person, jobIds: ['ops'], jobTopics: { ops: ['stack', 'health'] } }];
		expect(canReviewElement(doc, element('stack:api'), team, person, false)).toBe(true);
		expect(canReviewElement(doc, element('health:performance'), team, person, false)).toBe(true);
		expect(canReviewElement(doc, element('datamap'), team, person, false)).toBe(false);
	});

	it('no longer asks Tech for the stack once unticked [unspa:2e49df91:49fd4fc9:58fa1677]', () => {
		const team: TeamMember[] = [{ person, jobIds: ['tech'], jobTopics: { tech: ['datamap'] } }];
		expect(canReviewElement(doc, element('stack:api'), team, person, false)).toBe(false);
		expect(canReviewElement(doc, element('datamap'), team, person, false)).toBe(true);
	});

	it('asks Development for the stack once ticked [unspa:2e49df91:49fd4fc9:deba71a4]', () => {
		const team: TeamMember[] = [{ person, jobIds: ['development'], jobTopics: { development: ['stack'] } }];
		expect(canReviewElement(doc, element('stack:api'), team, person, false)).toBe(true);
		expect(canReviewElement(doc, element('action:f:a'), team, person, false)).toBe(false);
	});

	it('leaves a job the workspace added validating nothing until chosen [unspa:2e49df91:49fd4fc9:53fc56f2]', () => {
		const team: TeamMember[] = [{ person, jobIds: ['ops'], jobTopics: { ops: [] } }];
		expect(canReviewElement(doc, element('data:retention'), team, person, false)).toBe(false);
		expect(reviewJobsOf('data:retention', { ops: [] })).toEqual(['development', 'security']);
	});

	it('puts the starting jobs first, then the jobs the workspace added', () => {
		expect(reviewJobsOf('stack:api', { ops: ['stack'] })).toEqual(['tech', 'ops']);
		expect(reviewJobsOf('requirements:accessibility')).toEqual(['design', 'tech', 'qa']);
		expect(reviewJobsOf('unknown:x')).toEqual(['product']);
	});

	it('reads what the chosen topics make one validate', () => {
		expect(whatJobsValidate(['ops'], { ops: ['stack', 'health'] })).toBe('the stack and operations');
		expect(whatTopicsValidate(['requirements:runtime', 'term'])).toBe('the platform requirements and glossary');
	});
});
