import { describe, expect, it } from 'vitest';
import { specificationGate, specificationHold, specificationLeft } from './specification-hold';
import { crossStageAct, gateReading, openRequestAct, runCoherenceAct, type ActContext, type ActOutcome } from './acts';
import type { Actor, EvolutionRequest } from './draft';
import { SPEC_STEPS } from './path';

const relay: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'ai_client' };
let counter = 0;
const ctx: ActContext = { actor: relay, at: '2026-10-28T12:00:00.000Z', newId: () => `id-${++counter}` };
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const byPerson = { validation: 'validated', humanValidated: true };
const byAiAlone = { validation: 'validated', humanValidated: false };
const refused = { validation: 'refused', humanValidated: true };
const untouched = {};

/** A request at the Impact analysis whose coherence check ran clean: only the Specification can hold the freeze. */
function atImpactAnalysis(): EvolutionRequest {
	const opened = ok(
		openRequestAct(ctx, { title: 'Fix the problems', origin: 'technical_debt', requester: '', leafIds: ['feat-a'], knownLeafIds: new Set(['feat-a']) })
	);
	const validated: EvolutionRequest = {
		...opened,
		stepValidations: SPEC_STEPS.map((step) => ({ step, validatorIds: [], validations: [{ by: 'ana', kind: 'person' as const, at: ctx.at }] }))
	};
	const entered = ok(crossStageAct(ctx, validated, { criticalEmptyCount: 0 }));
	return ok(runCoherenceAct(ctx, entered, { report: { status: 'ready', projectScore: 91, requestDelta: 0, ranAt: ctx.at }, findings: [] }));
}

describe('the Specification is validated as the page asks it: answers, actions and journey [criterion:ac-leaf-ac-evo-form-step-lock]', () => {
	it('counts an item only when a person stands behind it as it reads now', () => {
		const hold = specificationHold([byPerson, byAiAlone, refused, untouched, byPerson]);
		expect(hold).toEqual({ total: 5, validated: 2 });
		expect(specificationLeft(hold)).toBe(3);
	});

	it('holds nothing back when the Specification asks nothing', () => {
		expect(specificationGate(specificationHold([])).ok).toBe(true);
		expect(specificationGate(undefined).ok).toBe(true);
	});

	it('refuses the freeze with how many items are left, and says how to get through', () => {
		const gate = specificationGate(specificationHold([byPerson, byAiAlone, untouched]));
		expect(gate.ok).toBe(false);
		if (!gate.ok) {
			expect(gate.reason).toBe('A person validates the Specification first: 2 of 3 left.');
			expect(gate.detail).toMatch(/each action, each path of the journey and each change to the data/);
			expect(gate.detail).toMatch(/waive the gate with a stated reason/);
		}
	});

	it('the freeze waits for it, on the page and through the MCP alike, and the gate reading says so', () => {
		const request = atImpactAnalysis();
		const waiting = specificationHold([byPerson, byAiAlone]);
		expect(reasonOf(crossStageAct(ctx, request, { criticalEmptyCount: 0, specification: waiting }))).toBe(
			'A person validates the Specification first: 1 of 2 left.'
		);
		const reading = gateReading(request, 0, waiting);
		expect(reading.next).toBe('implementation');
		expect(reading.verdict.ok ? '' : reading.verdict.reason).toBe('A person validates the Specification first: 1 of 2 left.');
		const frozen = ok(crossStageAct(ctx, request, { criticalEmptyCount: 0, specification: specificationHold([byPerson, byPerson]) }));
		expect(frozen.stage).toBe('implementation');
		expect(frozen.specVersion).toBe(1);
	});

	it('a person still crosses it with a named waiver, as at every gate', () => {
		const crossed = ok(
			crossStageAct(ctx, atImpactAnalysis(), { criticalEmptyCount: 0, specification: specificationHold([byAiAlone]), waiverReason: 'Read aloud in the meeting.' })
		);
		expect(crossed.stage).toBe('implementation');
		expect(crossed.waivers[0]).toMatchObject({ stage: 'implementation', reason: 'Read aloud in the meeting.' });
	});
});
