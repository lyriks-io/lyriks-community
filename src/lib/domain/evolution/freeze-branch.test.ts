import { describe, expect, it } from 'vitest';
import { crossStageAct, gateFor, gateReading, openRequestAct, runCoherenceAct, type ActContext, type ActOutcome } from './acts';
import { freezeBranchRefusal, type FreezeBranchHold } from './code-branch';
import type { Actor, EvolutionRequest } from './draft';
import { SPEC_STEPS } from './path';

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let counter = 0;
const ctx: ActContext = { actor: person, at: '2026-11-23T08:00:00.000Z', newId: () => `id-${++counter}` };
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const linkedWithoutBranch: FreezeBranchHold = { codeLinked: true, deploymentBranch: '' };
const linkedOnMain: FreezeBranchHold = { codeLinked: true, deploymentBranch: 'main' };
const noCodeLinked: FreezeBranchHold = { codeLinked: false, deploymentBranch: '' };
const NAME_IT = 'Name the deployment branch before the build: this change goes through a commit on a branch of its own.';

/** A request at the Impact analysis whose coherence check ran clean: nothing else holds the freeze. */
function atImpactAnalysis(): EvolutionRequest {
	const opened = ok(
		openRequestAct(ctx, { title: 'Follow the code of a change', origin: 'internal_idea', requester: '', leafIds: ['feat-a'], knownLeafIds: new Set(['feat-a']) })
	);
	const validated: EvolutionRequest = {
		...opened,
		stepValidations: SPEC_STEPS.map((step) => ({ step, validatorIds: [], validations: [{ by: 'ana', kind: 'person' as const, at: ctx.at }] }))
	};
	const entered = ok(crossStageAct(ctx, validated, { criticalEmptyCount: 0 }));
	return ok(runCoherenceAct(ctx, entered, { report: { status: 'ready', projectScore: 91, requestDelta: 0, ranAt: ctx.at }, findings: [] }));
}

describe('the freeze waits for the deployment branch once the project code is linked [criterion:ab5f236a]', () => {
	it('refuses Freeze version N while the project names no branch [unspa:13e955f6:0b1de710:15afae44]', () => {
		expect(reasonOf(crossStageAct(ctx, atImpactAnalysis(), { criticalEmptyCount: 0, branch: linkedWithoutBranch }))).toBe(NAME_IT);
	});

	it('freezes once the project deploys from a named branch [unspa:13e955f6:0b1de710:ae503cab]', () => {
		const frozen = ok(crossStageAct(ctx, atImpactAnalysis(), { criticalEmptyCount: 0, branch: linkedOnMain }));
		expect(frozen.stage).toBe('implementation');
		expect(frozen.specVersion).toBe(1);
	});

	it('freezes without a branch where no code is linked [unspa:13e955f6:0b1de710:8792890a]', () => {
		expect(ok(crossStageAct(ctx, atImpactAnalysis(), { criticalEmptyCount: 0, branch: noCodeLinked })).stage).toBe('implementation');
	});

	it('lets a request with nothing to build through without a branch [unspa:13e955f6:0b1de710:32a1469e]', () => {
		// A request that only settles findings of Project health brings no code (ac-evo-branch-no-code).
		expect(freezeBranchRefusal({ findingDrafts: [{ findingId: 'gap-1' }] }, linkedWithoutBranch).ok).toBe(true);
		expect(freezeBranchRefusal({}, linkedWithoutBranch).ok).toBe(false);
	});

	it('a waiver does not stand in for the branch [unspa:13e955f6:a91372bb:6c0cbfd6]', () => {
		const outcome = crossStageAct(ctx, atImpactAnalysis(), { criticalEmptyCount: 1, branch: linkedWithoutBranch, waiverReason: 'The client signs on Friday.' });
		expect(reasonOf(outcome)).toBe('A waiver does not replace the deployment branch: name it before the build.');
	});

	it('the gate a validation freezes through, and the gate the page reads, say what holds it', () => {
		// The freeze on the last validation reads gateFor (rule 930c67be); the way on reads gateReading.
		const request = atImpactAnalysis();
		const gate = gateFor(request, 'implementation', 0, undefined, undefined, linkedWithoutBranch);
		expect(gate.ok ? '' : gate.reason).toBe(NAME_IT);
		expect(gate.ok ? '' : gate.detail).toMatch(/card Code on its branch/);
		const reading = gateReading(request, 0, undefined, undefined, linkedWithoutBranch);
		expect(reading.next).toBe('implementation');
		expect(reading.verdict.ok).toBe(false);
		expect(gateReading(request, 0, undefined, undefined, linkedOnMain).verdict.ok).toBe(true);
	});

	it('reads nothing of the branch where the caller holds no reading of the project', () => {
		expect(freezeBranchRefusal({}, undefined).ok).toBe(true);
	});
});
