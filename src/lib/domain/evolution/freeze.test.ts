import { describe, expect, it } from 'vitest';
import {
	ALL_BLOCK_FIELDS,
	amend,
	canCloseReport,
	canFreeze,
	canReceiveReport,
	createEvolutionRequest,
	fieldKey,
	freeze,
	isLeafScoped,
	rechallengePending,
	type Actor,
	type ImplementationFinding
} from './index';

/**
 * The scenarios the specification declares on "Freeze the spec into a
 * numbered version" (feat-evo-spec-freeze), the re-check after adoption
 * (feat-evo-verdict-decision ac-evo-verd-7), the copyable brief
 * (feat-evo-rebrief ac-evo-rebrief-5) and the completion order
 * (feat-evo-llm-completion ac-evo-llm-8), transcribed.
 */

const noa: Actor = { id: 'noa', kind: 'person', role: 'member' };
const LEAF = 'feat-a';
const line = (over: Partial<ImplementationFinding> = {}): ImplementationFinding => ({
	id: 'l1',
	iteration: 1,
	verdict: 'non_conform',
	requirement: 'An import of 10,000 rows completes in under 10 minutes',
	filePath: 'src/lib/import/run.ts',
	lineRange: '40-88',
	specStatement: 'Under 10 minutes without a support ticket',
	codeStatement: 'Times out after 5 minutes',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
});
const atChallenge = (over = {}) =>
	createEvolutionRequest({ title: 'Bulk import', stage: 'coherence', ...over });

describe('freezing the spec', () => {
	// dfb4ff0c: the first freeze produces version 1.
	it('freezes version 1 on the first crossing, dated and signed', () => {
		const r = atChallenge();
		expect(canFreeze(r, { canEdit: true, criticalEmptyCount: 0 }).ok).toBe(true);
		const frozen = freeze(r, noa, '2026-09-03T10:00:00Z');
		expect(frozen.specVersion).toBe(1);
		expect(frozen.frozen).toBe(true);
		expect(frozen.frozenVersions).toMatchObject([{ version: 1, at: '2026-09-03T10:00:00Z', by: 'noa' }]);
	});

	// 13441ff4: a freeze after an amendment produces the next version.
	it('produces the next version after an amendment, and keeps the earlier one readable', () => {
		const first = freeze(atChallenge(), noa, '2026-09-03T10:00:00Z');
		const amended = amend({ ...first, stage: 'coherence' });
		expect(amended.frozen).toBe(false);
		expect(amended.specVersion).toBe(1);
		const second = freeze(amended, noa, '2026-09-04T10:00:00Z');
		expect(second.specVersion).toBe(2);
		expect(second.frozenVersions.map((v) => v.version)).toEqual([1, 2]);
	});

	// 62af1755: an undecided blocking finding refuses the freeze.
	it('refuses the freeze while a blocking finding is undecided or a critical field is empty', () => {
		const blocked = atChallenge({
			coherenceFindings: [
				{
					id: 'f1',
					axis: 'behavioural',
					severity: 'blocking',
					title: 'x',
					requestNodeId: 'a',
					existingNodeId: 'b',
					fixNowTarget: 'capability:x/y',
					published: true
				}
			]
		});
		expect(canFreeze(blocked, { canEdit: true, criticalEmptyCount: 0 }).ok).toBe(false);
		expect(canFreeze(atChallenge(), { canEdit: true, criticalEmptyCount: 1 }).ok).toBe(false);
	});

	// 1d555b2d: no freeze from the Specify stage.
	it('freezes from the Impact analysis only, and only for a writer', () => {
		const fromSpecify = canFreeze(createEvolutionRequest({ stage: 'specification' }), { canEdit: true, criticalEmptyCount: 0 });
		expect(fromSpecify.ok).toBe(false);
		// The refusal names the crossing as the product names its steps (rule eeaf9eb5, criterion a18cf05e).
		expect(fromSpecify.ok ? null : fromSpecify.reason).toBe('Freezing happens when crossing from the Impact analysis to the Build.');
		expect(canFreeze(atChallenge(), { canEdit: false, criticalEmptyCount: 0 }).ok).toBe(false);
	});
});

describe('receiving an implementation report', () => {
	const frozenAt1 = () => ({ ...freeze(atChallenge(), noa, 'now'), stage: 'implementation' as const });

	// 2891ed4f: a report against the frozen version is accepted.
	it('accepts a report that names the frozen version', () => {
		expect(canReceiveReport(frozenAt1(), 1).ok).toBe(true);
	});

	// d5239d78: a report against another version is refused, with both numbers.
	it('refuses a report naming another version, with both numbers', () => {
		const refused = canReceiveReport({ ...frozenAt1(), specVersion: 2 }, 1);
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toContain('version 1');
		if (!refused.ok) expect(refused.reason).toContain('version 2');
	});

	// 75c2aaf8: no report without a frozen spec.
	it('refuses a report when nothing is frozen', () => {
		expect(canReceiveReport(createEvolutionRequest(), 0).ok).toBe(false);
	});
});

describe('adoption sends the request back through the readings of the Impact analysis', () => {
	const ready = { status: 'ready' as const, projectScore: 80, requestDelta: 0, ranAt: '2026-09-03T09:00:00Z' };

	it('holds the report open while an adoption is more recent than the last coherence run', () => {
		const r = createEvolutionRequest({
			coherenceReport: ready,
			implementationFindings: [
				line({ verdict: 'conform', decision: 'adopted', decidedAt: '2026-09-03T10:00:00Z' })
			]
		});
		expect(rechallengePending(r)).toBe(true);
		const refused = canCloseReport(r);
		expect(refused.ok).toBe(false);
		// The refusal names the steps as the product names them (feat-35 a2d1bc9c, feat-31 a18cf05e).
		if (!refused.ok) expect(refused.reason).toBe('An adoption amended the spec. Run the readings of the Impact analysis again, coherence and docking, before closing this report.');
	});

	it('closes once the amended spec was challenged again', () => {
		const r = createEvolutionRequest({
			coherenceReport: { ...ready, ranAt: '2026-09-03T11:00:00Z' },
			implementationFindings: [
				line({ verdict: 'conform', decision: 'adopted', decidedAt: '2026-09-03T10:00:00Z' })
			]
		});
		expect(rechallengePending(r)).toBe(false);
		expect(canCloseReport(r).ok).toBe(true);
	});
});
