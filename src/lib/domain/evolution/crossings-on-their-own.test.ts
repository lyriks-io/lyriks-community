import { describe, expect, it } from 'vitest';
import type { ActContext } from './acts';
import { crossStageAct, gateReading } from './acts';
import { verificationCodeRefusal } from './code-branch-acts';
import { firstRefusal } from './guard';
import { withCodeReport, type CodeReport } from './code-branch';
import { reportCodeStateAct } from './code-branch-acts';
import {
	VERIFICATION_CLOSED,
	buildGate,
	crossIntoApprovalOnItsOwn,
	freezeHeldOf,
	freezeMayFollow,
	parseFreezeHeld,
	withBuildCodeGate,
	withFreezeHeld,
	withoutFreezeHeld
} from './crossings-on-their-own';
import { createEvolutionRequest, type EvolutionRequest, type ImplementationFinding } from './draft';
import { REPORT_NOT_REBUILT } from './engine-silence';
import { isStepValidated } from './path';

/**
 * EVO-011 in the domain: which act may freeze the version in the same act,
 * the gate of the Build with its branch, the move into Approval that names no
 * person and fixes no commit, and the approval asked again after a new commit.
 */

const at = '2026-11-20T10:00:00.000Z';
const counter = () => {
	let n = 0;
	return () => `h${++n}`;
};
/** The AI of a person in a workspace of several members: it may cross no gate by itself. */
const aiInTeam: ActContext = { actor: { id: 'ana@example.test', kind: 'ai_client', role: 'admin', channel: 'ai_client' }, at, newId: counter(), soloWorkspace: false };
const ana: ActContext = { actor: { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' }, at, newId: counter(), soloWorkspace: false };

const line = (id: string, decision: ImplementationFinding['decision'], over: Partial<ImplementationFinding> = {}): ImplementationFinding => ({
	id,
	iteration: 1,
	verdict: 'conform',
	requirement: id,
	filePath: 'src/cart.ts',
	lineRange: '1-2',
	specStatement: '',
	codeStatement: '',
	leafId: 'feat-1',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: true,
	specVersion: 1,
	scope: 'request',
	decision,
	decidedBy: decision === 'undecided' ? null : 'ana@example.test',
	decidedAt: decision === 'undecided' ? null : '2026-11-20T09:00:00.000Z',
	...over
});
const report = (over: Partial<CodeReport> = {}): CodeReport => ({ branch: 'evo/EVO-011-freeze', baseCommit: 'b45e000aaaa', head: 'c0de001bbbb', codeHead: 'c0de001bbbb', clean: true, proofsChecked: 9, proofsOnOtherCommits: 0, ...over });
const atBuild = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => ({
	...createEvolutionRequest({ id: 'r', title: 'Freeze', stage: 'implementation', status: 'open' }),
	frozen: true,
	specVersion: 1,
	iteration: 1,
	iterations: [{ number: 1, startedAt: at, brief: '', protectedLineIds: [], reportStatus: 'ready' }],
	coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: '2026-11-20T08:00:00.000Z' },
	implementationFindings: [line('l1', 'validated')],
	code: withCodeReport(undefined, report(), at).code,
	...over
});
const settled = { op: 'build_implementation_report', said: 'Report for version 1: 1 line of this request: 1 conform, 0 to build.' };

describe('who may freeze the version in the act of validating', () => {
	it('a person validating at the Impact analysis; never an AI, delegated or not [criterion:ac-leaf-16778a7e-921c-44ff-bf07-9b80dd837e61]', () => {
		const open = { stage: 'coherence', status: 'open' } as const;
		expect(freezeMayFollow('validate_field', { kind: 'person' }, open)).toBe(true);
		expect(freezeMayFollow('validate_step', { kind: 'person' }, open)).toBe(true);
		expect(freezeMayFollow('validate_field', { kind: 'ai_client' }, open)).toBe(false);
		expect(freezeMayFollow('answer_field', { kind: 'person' }, open)).toBe(false);
		expect(freezeMayFollow('validate_field', { kind: 'person' }, { stage: 'specification', status: 'open' })).toBe(false);
		expect(freezeMayFollow('validate_field', { kind: 'person' }, { stage: 'coherence', status: 'cancelled' })).toBe(false);
	});

	it('what held the freeze is said only while the request stands open at the Impact analysis, and reads back as stored [criterion:ac-leaf-c39cfe76-a3c8-4f02-98cc-5e48071a3cab]', () => {
		const held = { reason: 'The behaviour model of draft "x" does not apply: gone.', at, by: 'ana@example.test' };
		const noted = withFreezeHeld(atBuild({ stage: 'coherence', frozen: false, specVersion: 0 }), held);
		expect(freezeHeldOf(noted)).toEqual(held);
		expect(freezeHeldOf({ ...noted, stage: 'implementation' })).toBeNull();
		expect(withoutFreezeHeld(noted).freezeHeld).toBeUndefined();
		expect(parseFreezeHeld(JSON.parse(JSON.stringify(held)))).toEqual({ freezeHeld: held });
		expect(parseFreezeHeld({ reason: '', at })).toEqual({});
		expect(parseFreezeHeld('nonsense')).toEqual({});
	});
});

describe('the Build moves into Approval on its own [criterion:ac-leaf-21b6ca55-d413-44f5-8677-dc2a007fe954]', () => {
	it('once its report and its branch are settled, even after an AI act in a team, naming no person and fixing no commit [criterion:ac-leaf-21b6ca55-d413-44f5-8677-dc2a007fe954]', () => {
		const request = atBuild();
		const moved = crossIntoApprovalOnItsOwn(aiInTeam, settled, request, 'main');
		expect(moved?.ok).toBe(true);
		if (!moved?.ok) return;
		expect(moved.summary).toBe(VERIFICATION_CLOSED);
		expect(moved.request.stage).toBe('acceptance');
		expect(moved.request.iterations[0].reportStatus).toBe('closed');
		expect(moved.request.code?.validated).toBeNull();
		const crossing = moved.request.history.slice(request.history.length);
		expect(crossing.map((h) => h.summary)).toEqual(['Crossed into acceptance']);
		expect(crossing.every((h) => h.authorKind === 'ai_client')).toBe(true);
	});

	it('stays while a line is undecided or sent back, an adoption waits for a check, the branch holds uncommitted code or proofs on another commit', () => {
		const held: [EvolutionRequest, string][] = [
			[atBuild({ implementationFindings: [line('l1', 'undecided', { verdict: 'non_conform' })] }), 'Lines of this report are still undecided.'],
			[atBuild({ implementationFindings: [line('l1', 'invalidated', { verdict: 'non_conform' })] }), 'Lines were sent back to the build. Rebuild the report once the code changed.'],
			[
				atBuild({ implementationFindings: [line('l1', 'adopted', { verdict: 'out_of_scope', decidedAt: '2026-11-20T09:30:00.000Z' })] }),
				'An adoption amended the spec. Run the readings of the Impact analysis again, coherence and docking, before closing this report.'
			],
			[atBuild({ code: withCodeReport(undefined, report({ clean: false }), at).code }), 'The branch holds uncommitted code: commit it, run the tests again, then validate.'],
			[atBuild({ code: withCodeReport(undefined, report({ proofsOnOtherCommits: 1 }), at).code }), '1 proof was taken on another commit: run the tests on c0de001.']
		];
		for (const [request, reason] of held) {
			expect(buildGate(request, 'main')).toMatchObject({ ok: false, reason });
			expect(crossIntoApprovalOnItsOwn(ana, settled, request, 'main')).toBeNull();
			// The dossier's gate says it beside Start acceptance testing (criterion 3cf58130).
			expect(withBuildCodeGate(gateReading(request, 0), request, 'main').verdict).toMatchObject({ ok: false, reason });
		}
	});

	it('moves only after the acts that settle a report, never on one the engine could not build again', () => {
		const request = atBuild();
		expect(crossIntoApprovalOnItsOwn(ana, { op: 'decide_line', said: 'Line validated' }, request, 'main')?.ok).toBe(true);
		expect(crossIntoApprovalOnItsOwn(ana, { op: 'run_coherence', said: '' }, request, 'main')?.ok).toBe(true);
		expect(crossIntoApprovalOnItsOwn(ana, { op: 'post_on_field', said: '' }, request, 'main')).toBeNull();
		expect(crossIntoApprovalOnItsOwn(ana, { op: 'build_implementation_report', said: REPORT_NOT_REBUILT }, request, 'main')).toBeNull();
	});

	it('reads no branch where the project names no deployment branch', () => {
		const dirty = atBuild({ code: withCodeReport(undefined, report({ clean: false }), at).code });
		expect(buildGate(dirty, '').ok).toBe(true);
		expect(withBuildCodeGate(gateReading(dirty, 0), dirty, '').verdict.ok).toBe(true);
	});
});

describe('the move into Approval reads the gate cross_stage reads into acceptance', () => {
	it('moves exactly when the branch checks and gateFor(request, acceptance) let cross_stage through, and refuses on the same reasons', () => {
		const states: EvolutionRequest[] = [
			atBuild(),
			atBuild({ implementationFindings: [] }),
			atBuild({ implementationFindings: [line('l1', 'undecided', { verdict: 'non_conform' })] }),
			atBuild({ implementationFindings: [line('l1', 'invalidated', { verdict: 'non_conform' })] }),
			atBuild({ implementationFindings: [line('l1', 'adopted', { verdict: 'out_of_scope', decidedAt: '2026-11-20T09:30:00.000Z' })] }),
			atBuild({ code: withCodeReport(undefined, report({ clean: false }), at).code }),
			atBuild({ code: withCodeReport(undefined, report({ proofsOnOtherCommits: 3 }), at).code }),
			atBuild({ code: undefined }),
			atBuild({ status: 'cancelled' })
		];
		for (const request of states) {
			// What cross_stage into acceptance reads: the branch's checks, then the gate crossStageAct reads.
			const crossStage = firstRefusal(verificationCodeRefusal(request, 'main'), gateReading(request, 0).verdict);
			const byHand = crossStage.ok ? crossStageAct({ ...ana, soloWorkspace: true }, request, { criticalEmptyCount: 0 }) : crossStage;
			const onItsOwn = crossIntoApprovalOnItsOwn(aiInTeam, settled, request, 'main');
			expect(onItsOwn?.ok ?? false).toBe(byHand.ok);
			// The dossier's Build gate says the very reason cross_stage would give.
			if (!byHand.ok && request.status === 'open') expect(buildGate(request, 'main')).toEqual(byHand);
		}
	});
});

describe('closing the verification fixes no commit; the approval does [criterion:ac-leaf-b08f5488-396a-4ab9-955a-aa666d34b340]', () => {
	it('moving into acceptance testing lets go of a commit an earlier approval fixed, by hand or on its own [criterion:ac-leaf-b08f5488-396a-4ab9-955a-aa666d34b340]', () => {
		// An approval fixed a commit, then a rebrief sent the request back: version 2 is built and settled.
		const earlier = { ...withCodeReport(undefined, report(), at).code, validated: { commit: 'c0de001bbbb', at, by: 'ana@example.test' }, validationSetAside: true };
		const request = atBuild({ code: earlier });
		const byHand = crossStageAct({ ...ana, soloWorkspace: true }, request, { criticalEmptyCount: 0 });
		expect(byHand.ok && byHand.request.code).toMatchObject({ validated: null, validationSetAside: false });
		const onItsOwn = crossIntoApprovalOnItsOwn(aiInTeam, settled, request, 'main');
		expect(onItsOwn?.ok && onItsOwn.request.code).toMatchObject({ validated: null, validationSetAside: false });
	});
});

describe('a commit after the approval asks for it again [criterion:ac-leaf-b8d393ea-5850-4aae-9b9f-c42f81ec8b49]', () => {
	it('sets the approval aside and stands the request in Approval again, nobody\'s approval counted [criterion:ac-leaf-b8d393ea-5850-4aae-9b9f-c42f81ec8b49]', () => {
		const code = { ...withCodeReport(undefined, report(), at).code, validated: { commit: 'c0de001bbbb', at, by: 'ana@example.test' } };
		const approved = atBuild({
			stage: 'delivered',
			code,
			stepValidations: [{ step: 'approval', validatorIds: [], validations: [{ by: 'ana@example.test', kind: 'person', at }] }]
		});
		expect(isStepValidated(approved, 'approval')).toBe(true);
		const moved = reportCodeStateAct(aiInTeam, approved, 'main', 'evo/EVO-011-freeze', report({ head: 'c0de002cccc', codeHead: 'c0de002cccc' }));
		expect(moved.ok).toBe(true);
		if (!moved.ok) return;
		expect(moved.request.stage).toBe('acceptance');
		expect(moved.request.code?.validationSetAside).toBe(true);
		expect(isStepValidated(moved.request, 'approval')).toBe(false);
		expect(moved.summary).toBe('The branch moved after the approval (now c0de002): the approval is asked again');
		// The same commit reported again moves nothing.
		const again = reportCodeStateAct(aiInTeam, approved, 'main', 'evo/EVO-011-freeze', report());
		expect(again.ok && again.request.stage).toBe('delivered');
	});
});
