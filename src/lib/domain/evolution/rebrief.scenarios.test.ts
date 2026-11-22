import { describe, expect, it } from 'vitest';
import { rebriefAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { isStepValidated } from './path';

/**
 * The scenarios of "Send the request back to its specification" (feat-31,
 * action 8032a834), each run against the code. A deleted dossier is out of the
 * run: a rebrief moves it no more than a crossing (rule 3dac3bfe, scenario 83efd801).
 */
const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
const ctx = (actor: Actor, soloWorkspace = false): ActContext => ({ actor, at: '2026-11-20T03:00:00.000Z', newId: () => 'id', soloWorkspace });
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);
const validated = (step: 'technical_spec' | 'approval') => ({ step, validatorIds: [], validations: [{ by: 'ana', kind: 'person' as const, at: 't' }] });
const at = (over: Partial<EvolutionRequest>): EvolutionRequest => ({ ...createEvolutionRequest({ id: 'r', status: 'open', stage: 'specification' }), ...over });
const built = () => at({ stage: 'implementation', frozen: true, specVersion: 1, stepValidations: [validated('technical_spec'), validated('approval')] });

describe('Send the request back to its specification (feat-31 8032a834)', () => {
	it('a designer reopens the frozen version from the build [unspa:13e955f6:8032a834:0d7ea44c]', () => {
		expect(isStepValidated(built(), 'technical_spec')).toBe(true);
		const outcome = rebriefAct(ctx(person), built());
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.request.stage).toBe('specification');
		expect(outcome.request.frozen).toBe(false);
		expect(outcome.request.specVersion).toBe(1);
		expect(isStepValidated(outcome.request, 'technical_spec')).toBe(false);
		expect(isStepValidated(outcome.request, 'approval')).toBe(false);
	});

	it('a request in Specify is not sent back [unspa:13e955f6:8032a834:90f4bdf5]', () => {
		expect(reasonOf(rebriefAct(ctx(person), at({})))).toBe('The request is already in specification.');
	});

	it('a closed request is not rebriefed [unspa:13e955f6:8032a834:c6fa882f]', () => {
		expect(reasonOf(rebriefAct(ctx(person), at({ stage: 'delivered', status: 'closed', frozen: true, specVersion: 1 })))).toBe('A closed request cannot be rebriefed.');
	});

	it('an AI cannot send a request back in a team [unspa:13e955f6:8032a834:6c0357ec]', () => {
		expect(reasonOf(rebriefAct(ctx(client), at({ stage: 'coherence' })))).toBe('An AI client cannot rebrief a request.');
	});

	it('a deleted request is not sent back [unspa:13e955f6:8032a834:83efd801]', () => {
		const deleted = at({ stage: 'coherence', status: 'deleted' });
		expect(reasonOf(rebriefAct(ctx(person), deleted))).toBe('This request is deleted.');
		// Even where an AI may act alone, the dossier stays where it was.
		expect(reasonOf(rebriefAct(ctx(client, true), deleted))).toBe('This request is deleted.');
	});
});
