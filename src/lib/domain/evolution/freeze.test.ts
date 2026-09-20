import { describe, expect, it } from 'vitest';
import {
	ALL_BLOCK_FIELDS,
	amend,
	canAmend,
	canCloseReport,
	canFreeze,
	canReceiveReport,
	completionTargets,
	createEvolutionRequest,
	fieldKey,
	freeze,
	isLeafScoped,
	lineBrief,
	rechallengePending,
	refusedReports,
	verifyImpliesFrozen,
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
		expect(frozen.frozenVersions).toEqual([{ version: 1, at: '2026-09-03T10:00:00Z', by: 'noa' }]);
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
	it('freezes from Challenge only, and only for a writer', () => {
		expect(canFreeze(createEvolutionRequest({ stage: 'specification' }), { canEdit: true, criticalEmptyCount: 0 }).ok).toBe(false);
		expect(canFreeze(atChallenge(), { canEdit: false, criticalEmptyCount: 0 }).ok).toBe(false);
	});

	// 74aadd30: nothing to amend without a freeze.
	it('amends a frozen spec only', () => {
		expect(canAmend(createEvolutionRequest(), true).ok).toBe(false);
		expect(canAmend(freeze(atChallenge(), noa, 'now'), true).ok).toBe(true);
		expect(canAmend(freeze(atChallenge(), noa, 'now'), false).ok).toBe(false);
	});

	it('Verify implies a frozen spec', () => {
		expect(verifyImpliesFrozen(createEvolutionRequest({ stage: 'implementation', frozen: false }))).toBe(false);
		expect(verifyImpliesFrozen(createEvolutionRequest({ stage: 'implementation', frozen: true }))).toBe(true);
		expect(verifyImpliesFrozen(createEvolutionRequest({ stage: 'coherence', frozen: false }))).toBe(true);
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

	it('judges only the lines an incoming save adds, against the stored freeze', () => {
		const stored = frozenAt1();
		const good = { ...stored, implementationFindings: [line({ specVersion: 1 })] };
		expect(refusedReports([stored], [good])).toEqual([]);
		const bad = { ...stored, implementationFindings: [line({ specVersion: 0 })] };
		expect(refusedReports([stored], [bad])).toHaveLength(1);
		// A re-save of an already stored line is not judged again.
		expect(refusedReports([good], [good])).toEqual([]);
		// An incoming draft cannot freeze and report in the same breath: the
		// stored request, not frozen, is the authority.
		const sneaky = { ...frozenAt1(), implementationFindings: [line({ specVersion: 1 })] };
		expect(refusedReports([createEvolutionRequest({ id: sneaky.id })], [sneaky])).toHaveLength(1);
	});
});

describe('adoption sends the request back through the Challenge check', () => {
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
		if (!refused.ok) expect(refused.reason).toContain('Challenge');
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

describe('the brief under an invalidated line', () => {
	it('says what the spec expects, what the code does, where, and what to do', () => {
		const r = createEvolutionRequest({
			title: 'Bulk import',
			specVersion: 1,
			implementationFindings: [
				line({ decision: 'invalidated' }),
				line({ id: 'ok1', verdict: 'conform', decision: 'validated', acceptanceTestPassing: true })
			]
		});
		const brief = lineBrief(r, r.implementationFindings[0]);
		expect(brief).toContain('src/lib/import/run.ts:40-88');
		expect(brief).toContain('The spec expects: Under 10 minutes');
		expect(brief).toContain('The code does: Times out');
		expect(brief).toContain('Make the code do what the spec says');
		expect(brief).toContain('Leave untouched (conform): ok1');
		expect(brief).toContain('spec version 1');
	});
});

describe('the completion targets the open questions first', () => {
	it('lists the amber fields before the empty ones', () => {
		const filled = new Set(
			ALL_BLOCK_FIELDS.slice(0, 3).map((f) => fieldKey(f.path, isLeafScoped(f) ? LEAF : null))
		);
		const open = [fieldKey('09-technical.constraints')];
		const targets = completionTargets(filled, open, [LEAF]);
		expect(targets[0].key).toBe('09-technical.constraints');
		expect(targets[0].openQuestion).toBe(true);
		expect(targets.slice(1).every((t) => !t.openQuestion)).toBe(true);
	});
});
