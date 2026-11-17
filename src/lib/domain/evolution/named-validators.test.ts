import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { nameValidatorsAct, updateNeedAct, validateFieldAct, validateStepAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { fieldValidationOf } from './field-versions';
import { isStepValidated, readPath } from './path';
import { stepOfTarget, stepTarget, suggestedFor, withoutGoneValidators } from './named-validators';

/**
 * Naming who validates an answer or a step (ac-evo-req-named-validators): once
 * someone is named, every person named is expected, and only them; with nobody
 * named, the default rule applies.
 */

const ana: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const bo: Actor = { id: 'bo@team.test', kind: 'person', role: 'member', channel: 'page' };
const cy: Actor = { id: 'cy@team.test', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { id: 'vi@team.test', kind: 'person', role: 'viewer', channel: 'page' };
const team = new Set(['ana@team.test', 'bo@team.test', 'cy@team.test']);

let counter = 0;
const ctxFor = (actor: Actor, solo = false): ActContext => ({
	actor,
	at: '2026-10-22T09:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace: solo,
	validators: solo ? null : team
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const open = (overrides: Partial<EvolutionRequest> = {}): EvolutionRequest =>
	createEvolutionRequest({ id: 'req-1', title: 'Pickup reminders', origin: 'customer_feedback', stage: 'specification', ...overrides });

const situation = '00-need.situation';
const said = 'Bags are never picked up.';
const written = (over: Partial<EvolutionRequest> = {}) => ok(updateNeedAct(ctxFor(ana), open(over), { situation: said }));
const validate = (actor: Actor, request: EvolutionRequest) => ok(validateFieldAct(ctxFor(actor), request, { key: situation, liveValue: said }));

describe('an answer named on its people waits for every one of them (ac-evo-req-named-validators)', () => {
	it('reads validated only once every person named validated its current version', () => {
		let request = ok(nameValidatorsAct(ctxFor(ana), written(), { target: situation, people: ['Bo@Team.test', 'cy@team.test'] }));
		expect(request.namedValidators).toEqual([{ target: situation, people: ['bo@team.test', 'cy@team.test'], gone: [] }]);
		request = validate(bo, request);
		expect(fieldValidationOf(request, situation)).toMatchObject({ status: 'unvalidated', needed: 2, counted: 1, expected: ['bo@team.test', 'cy@team.test'] });
		request = validate(cy, request);
		expect(fieldValidationOf(request, situation)).toMatchObject({ status: 'validated', counted: 2 });
	});

	it('shows a validation by someone not named, and counts it for nothing', () => {
		let request = ok(nameValidatorsAct(ctxFor(ana), written(), { target: situation, people: ['bo@team.test'] }));
		request = validate(cy, request);
		const reading = fieldValidationOf(request, situation);
		expect(reading.validations.map((v) => v.by)).toEqual(['cy@team.test']);
		expect(reading).toMatchObject({ status: 'unvalidated', counted: 0, needed: 1 });
	});

	it('replaces the number of validations per answer on the answer named, and only there', () => {
		const request = validate(bo, ok(nameValidatorsAct(ctxFor(ana), written({ validationsPerAnswer: 3 }), { target: situation, people: ['bo@team.test'] })));
		expect(fieldValidationOf(request, situation).status).toBe('validated');
	});

	it('goes back to the default rule once the names are cleared', () => {
		let request = validate(cy, ok(nameValidatorsAct(ctxFor(ana), written(), { target: situation, people: ['bo@team.test'] })));
		expect(fieldValidationOf(request, situation).status).toBe('unvalidated');
		request = ok(nameValidatorsAct(ctxFor(ana), request, { target: situation, people: [] }));
		expect(request.namedValidators).toEqual([]);
		expect(fieldValidationOf(request, situation).status).toBe('validated');
	});

	it('records who named whom in the history', () => {
		const request = ok(nameValidatorsAct(ctxFor(ana), written(), { target: situation, people: ['bo@team.test'] }));
		expect(request.history.at(-1)).toMatchObject({ authorId: 'ana@team.test', summary: `${situation}: bo@team.test expected to validate` });
	});
});

describe('a step validated as a whole waits for every person named on it', () => {
	const fs = stepTarget('functional_spec');
	it('stands on one validation by default, on every person named once someone is', () => {
		const step = (request: EvolutionRequest, actor: Actor) => ok(validateStepAct(ctxFor(actor), request, 'approval'));
		const approval = stepTarget('approval');
		const atAcceptance = open({ stage: 'acceptance' });
		expect(isStepValidated(step(atAcceptance, cy), 'approval')).toBe(true);
		let request = ok(nameValidatorsAct(ctxFor(ana), atAcceptance, { target: approval, people: ['ana@team.test', 'bo@team.test'] }));
		request = step(request, cy);
		expect(isStepValidated(request, 'approval')).toBe(false);
		request = step(step(request, ana), bo);
		expect(isStepValidated(request, 'approval')).toBe(true);
		const reading = readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'approval');
		expect(reading?.validation).toMatchObject({ validated: true, expected: ['ana@team.test', 'bo@team.test'] });
	});

	it('names a whole step by its target, never one of its answers', () => {
		expect(stepOfTarget(fs)).toBe('functional_spec');
		expect(stepOfTarget('step.functional_spec.refusals')).toBeNull();
		expect(stepOfTarget('step.solution.examples')).toBe('solution');
		expect(stepOfTarget('step.solution.description')).toBe('solution');
		expect(stepOfTarget('00-need.objectives')).toBe('need');
		expect(stepOfTarget('step:impact_analysis')).toBeNull();
	});
});

describe('who may name, and when', () => {
	it('refuses a viewer, a finished request and a step nobody validates', () => {
		expect(reasonOf(nameValidatorsAct(ctxFor(viewer), written(), { target: situation, people: ['bo@team.test'] }))).toBe(
			'A viewer reads and comments, but does not name who validates.'
		);
		expect(reasonOf(nameValidatorsAct(ctxFor(ana), { ...written(), status: 'closed' }, { target: situation, people: ['bo@team.test'] }))).toBe('This request is closed.');
		expect(reasonOf(nameValidatorsAct(ctxFor(ana), written(), { target: 'step:impact_analysis', people: ['bo@team.test'] }))).toBe(
			'The Impact analysis, the Build and the Deployment are not validated by people: nobody is named on them.'
		);
	});

	it('keeps the names of a frozen answer, and lets the Approval be named until the change is approved', () => {
		const frozen = written({ stage: 'implementation' });
		expect(reasonOf(nameValidatorsAct(ctxFor(ana), frozen, { target: situation, people: ['bo@team.test'] }))).toBe(
			'This can no longer be validated: its version is frozen, or the change is approved.'
		);
		expect(nameValidatorsAct(ctxFor(ana), frozen, { target: stepTarget('approval'), people: ['bo@team.test'] }).ok).toBe(true);
		expect(reasonOf(nameValidatorsAct(ctxFor(ana), open({ stage: 'delivered' }), { target: stepTarget('approval'), people: ['bo@team.test'] }))).toBe(
			'This can no longer be validated: its version is frozen, or the change is approved.'
		);
	});

	it('names only members who validate, and nobody when alone, though names left can be cleared', () => {
		expect(reasonOf(nameValidatorsAct(ctxFor(ana), written(), { target: situation, people: ['vi@team.test'] }))).toBe(
			'Only members who validate are named: never a viewer, an AI client, nor someone outside the workspace.'
		);
		expect(reasonOf(nameValidatorsAct(ctxFor(ana, true), written(), { target: situation, people: ['bo@team.test'] }))).toBe(
			'You are alone in the workspace: there is nobody to name.'
		);
		const left = written({ namedValidators: [{ target: situation, people: ['bo@team.test'], gone: [] }] });
		expect(ok(nameValidatorsAct(ctxFor(ana, true), left, { target: situation, people: [] })).namedValidators).toEqual([]);
	});
});

describe('a person named who left the workspace is no longer waited on', () => {
	it('moves them out of the names, kept as gone, and the default rule applies once nobody is left', () => {
		let request = ok(nameValidatorsAct(ctxFor(ana), written(), { target: situation, people: ['bo@team.test'] }));
		request = validate(cy, request);
		expect(fieldValidationOf(request, situation).status).toBe('unvalidated');
		request = withoutGoneValidators(request, new Set(['ana@team.test', 'cy@team.test']));
		expect(request.namedValidators).toEqual([{ target: situation, people: [], gone: ['bo@team.test'] }]);
		expect(fieldValidationOf(request, situation).status).toBe('validated');
	});

	it('keeps the names through a save and drops a record that names nobody', () => {
		const stored = written({
			namedValidators: [
				{ target: situation, people: ['bo@team.test'], gone: ['dee@team.test'] },
				{ target: stepTarget('approval'), people: [], gone: [] }
			]
		});
		const read = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [stored] })), 'p').requests[0];
		expect(read.namedValidators).toEqual([{ target: situation, people: ['bo@team.test'], gone: ['dee@team.test'] }]);
		const { namedValidators: _dropped, ...before } = open();
		expect(parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [before] })), 'p').requests[0].namedValidators).toEqual([]);
	});
});

describe('the people offered first are those the step calls for (ac-evo-req-validator-suggestions)', () => {
	it('reads each step against the jobs it calls for', () => {
		expect(suggestedFor('need', ['product'])).toBe(true);
		expect(suggestedFor('solution', ['tech'])).toBe(false);
		expect(suggestedFor('functional_spec', ['design'])).toBe(true);
		expect(suggestedFor('technical_spec', ['security'])).toBe(true);
		expect(suggestedFor('approval', ['business'])).toBe(true);
		expect(suggestedFor('approval', [])).toBe(false);
	});
});
