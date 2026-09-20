import { describe, expect, it } from 'vitest';
import {
	canAcceptProposal,
	canAdopt,
	canAdvance,
	canAmendSpec,
	canAnnotateCapture,
	canAnchor,
	canBuildReport,
	canCloseAfterAcceptance,
	canCloseReport,
	canCloseRequest,
	canComposeRebrief,
	canComputePropagation,
	canCrossToImplementation,
	canDecide,
	canDeleteEntry,
	canDeleteRequest,
	canDropCard,
	reachLabel,
	reachMeaning,
	impactSectionOf,
	supportedStage,
	canFlagOutOfScope,
	canFlagRegression,
	canFoldBack,
	canGenerateProposals,
	canInvalidate,
	canLeaveCoherence,
	canLiftWaiver,
	canLogObservation,
	canMarkConform,
	canOpenBlock,
	canOpenEntities,
	canOpenPreviousReport,
	canOpenRequest,
	canOpenRules,
	canPostMessage,
	canPublishFinding,
	canRebrief,
	canRecord,
	canRecordAcceptedProposal,
	canRefuseProposal,
	canRemove,
	canResume,
	canRewordProposal,
	canRule,
	canRunCheck,
	canSaveField,
	canSendBackForImplementation,
	canAnswerOpenQuestion,
	canMarkOpenQuestion,
	canSupersede,
	canSwitchHypothesis,
	canWaive,
	createEvolutionRequest,
	createObservation,
	createProposal,
	deriveVerdict,
	firstEmptyFieldPath,
	openRequest,
	protectedLineIds,
	readMaturity,
	record,
	switchHypothesis,
	tierOf,
	undecidedCount,
	validatedNotFoldedBack,
	ALL_BLOCK_FIELDS,
	BLOCK_COUNT,
	BOARD_COLUMNS,
	CONDITIONAL_BLOCKS,
	MATURITY_NEVER_BLOCKS,
	MATURITY_STATEMENT,
	blocksFor,
	holdsValue,
	canonicalPathsFor,
	fieldKey,
	isLeafScoped,
	blockFieldByPath,
	type Actor,
	type EvolutionRequest,
	type ImplementationFinding
} from './index';
import type { ProjectFeaturesDraft } from '$domain/features';

/**
 * These cases are the scenarios the specification itself declares on each
 * feature, transcribed. A `blocked` scenario must refuse; a `success` scenario
 * must pass. That is what makes this an implementation OF the spec rather than
 * a plausible reading of it.
 */

const person: Actor = { id: 'person-1', kind: 'person', role: 'member' };
const admin: Actor = { id: 'person-ana', kind: 'person', role: 'admin' };
const designer: Actor = { id: 'person-lea', kind: 'person', role: 'member' };
const aiClient: Actor = { id: 'mcp-1', kind: 'ai_client', role: 'member' };
const viewer: Actor = { id: 'person-nour', kind: 'person', role: 'viewer' };

const req = (over: Partial<EvolutionRequest> = {}): EvolutionRequest =>
	createEvolutionRequest(over);

/** One touched feature, enough to give the leaf-scoped fields a home. */
const LEAF = 'feat-a';

/** Every field of the page filled, for a request touching `LEAF`. */
const allFilled = (): Set<string> =>
	new Set(ALL_BLOCK_FIELDS.map((f) => fieldKey(f.path, isLeafScoped(f) ? LEAF : null)));

const line = (over: Partial<ImplementationFinding> = {}): ImplementationFinding => ({
	id: 'l1',
	iteration: 1,
	verdict: 'missing',
	requirement: 'The report derives from the crossing',
	filePath: 'src/evolution/report/derive.ts',
	lineRange: '120-148',
	specStatement: '',
	codeStatement: '',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
});

describe('opening and steering a request', () => {
	it('refuses a request with no origin', () => {
		const r = req({ title: 'Bulk export of the spec', origin: null });
		expect(canOpenRequest(r).ok).toBe(false);
	});

	it('refuses a request with no title', () => {
		expect(canOpenRequest(req({ title: '', origin: 'customer_feedback' })).ok).toBe(false);
	});

	/*
	 * A change routinely spans several features, and working out which is the job
	 * of the impact report. Demanding an answer at the door only buys a guess the
	 * report then has to contradict, so opening asks for none.
	 */
	it('opens a request that has not yet worked out what it touches', () => {
		const r = req({ title: 'Bulk export of the spec', origin: 'customer_feedback', leafIds: [] });
		expect(canOpenRequest(r).ok).toBe(true);
		const opened = openRequest(r, '2026-09-01T10:00:00Z');
		expect(opened.stage).toBe('specification');
		expect(opened.status).toBe('open');
	});

	it('carries as many touched features as the change actually has', () => {
		const r = req({
			title: 'Bulk export of the spec',
			origin: 'customer_feedback',
			leafIds: ['feat-a', 'feat-b', 'feat-c']
		});
		expect(canOpenRequest(r).ok).toBe(true);
		expect(openRequest(r, 'now').leafIds).toHaveLength(3);
	});

	it('refuses to skip or repeat a gate', () => {
		expect(canAdvance(req({ stage: 'coherence' }), 'coherence').ok).toBe(false);
		expect(canAdvance(req({ stage: 'specification' }), 'implementation').ok).toBe(false);
		expect(canAdvance(req({ stage: 'specification' }), 'coherence').ok).toBe(true);
	});

	it('does not move a closed request between stages', () => {
		expect(canAdvance(req({ stage: 'specification', status: 'closed' }), 'coherence').ok).toBe(false);
	});

	it('sends an implementation request back to specification', () => {
		expect(canRebrief(req({ stage: 'implementation', status: 'open' })).ok).toBe(true);
		expect(canRebrief(req({ stage: 'specification' })).ok).toBe(false);
		expect(canRebrief(req({ stage: 'implementation', status: 'closed' })).ok).toBe(false);
	});

	it('refuses to close while a validated observation is not folded back', () => {
		const r = req({
			stage: 'delivered',
			observations: [createObservation({ ruling: 'validated', foldedBackAt: null })]
		});
		expect(canCloseRequest(r).ok).toBe(false);
	});

	it('closes a delivered request with nothing outstanding', () => {
		expect(canCloseRequest(req({ stage: 'delivered' })).ok).toBe(true);
		expect(canCloseRequest(req({ stage: 'acceptance' })).ok).toBe(false);
	});

	it('refuses to delete a request twice', () => {
		expect(canDeleteRequest(req({ status: 'open' })).ok).toBe(true);
		expect(canDeleteRequest(req({ status: 'deleted' })).ok).toBe(false);
	});
});

describe('the specification dossier page', () => {
	it('has exactly ten blocks', () => {
		expect(BLOCK_COUNT).toBe(10);
	});

	it('opens any block whatever the state of the other nine', () => {
		expect(canOpenBlock(true, true).ok).toBe(true);
		expect(canOpenBlock(false, true).ok).toBe(false);
		expect(canOpenBlock(true, false).ok).toBe(false);
	});

	it('marks a field as an open question, once, on a field, never on a validated block', () => {
		const ok = { canEdit: true, fieldSelected: true, alreadyOpen: false, blockState: 'empty' };
		expect(canMarkOpenQuestion(ok).ok).toBe(true);
		expect(canMarkOpenQuestion({ ...ok, canEdit: false }).ok).toBe(false);
		expect(canMarkOpenQuestion({ ...ok, fieldSelected: false }).ok).toBe(false);
		expect(canMarkOpenQuestion({ ...ok, alreadyOpen: true }).ok).toBe(false);
		expect(canMarkOpenQuestion({ ...ok, blockState: 'validated' }).ok).toBe(false);
	});

	it('answers only an open question; a plain field is simply edited', () => {
		expect(canAnswerOpenQuestion({ canEdit: true, isOpen: true }).ok).toBe(true);
		expect(canAnswerOpenQuestion({ canEdit: true, isOpen: false }).ok).toBe(false);
		expect(canAnswerOpenQuestion({ canEdit: false, isOpen: true }).ok).toBe(false);
	});

	it('an open question counts as empty and lowers nothing on the other fields', () => {
		const filled = new Set([
			fieldKey('01-origin.objective', LEAF),
			fieldKey('02-problem.statement', LEAF)
		]);
		const plain = readMaturity(filled, [], [LEAF]);
		// Marking an empty field changes the score of nothing else.
		const marked = readMaturity(filled, [fieldKey('04-permissions.grants')], [LEAF]);
		expect(marked.score).toBe(plain.score);
		expect(marked.openQuestionCount).toBe(1);
		expect(marked.perBlock.find((p) => p.block.id === '04-permissions')?.parked).toBe(true);
		// Marking a filled field turns it into the hole it declares.
		const questioned = readMaturity(filled, [fieldKey('01-origin.objective', LEAF)], [LEAF]);
		expect(questioned.score).toBeLessThan(plain.score);
		expect(questioned.criticalEmptyFields).toContain('01-origin.objective');
	});

	it('shows every field as a question with an example and a reason', () => {
		for (const f of [...ALL_BLOCK_FIELDS, ...CONDITIONAL_BLOCKS.flatMap((b) => b.fields)]) {
			expect(f.question.endsWith('?')).toBe(true);
			expect(f.example.length).toBeGreaterThan(10);
			expect(f.whyItMatters.length).toBeGreaterThan(10);
		}
	});

	it('shows Screens and Edge cases only once the change touches them', () => {
		const bare = req();
		expect(blocksFor(bare).map((b) => b.id)).not.toContain('11-screens');
		const touchesScreens = req({
			impactFindings: [
				{
					id: 'i1',
					hypothesis: 'add',
					section: 'screens_and_journeys',
					nodeId: 'scr-import',
					nodeLabel: 'Import',
					nodeKind: 'screen',
					groupPath: [],
					note: '',
					codeWork: null,
					depth: 1,
					severity: 'low',
					migrationImplied: null,
					ruleWork: null
				}
			]
		});
		expect(blocksFor(touchesScreens).map((b) => b.id)).toContain('11-screens');
		expect(blocksFor(touchesScreens).map((b) => b.id)).not.toContain('12-edge-cases');
		// A block the author already questioned stays shown.
		const questioned = req({ openQuestionKeys: ['12-edge-cases.scenarios'] });
		expect(blocksFor(questioned).map((b) => b.id)).toContain('12-edge-cases');
		expect(readMaturity(new Set(), [], [], blocksFor(questioned)).blocksScored).toBe(11);
	});

	it('counts a list as filled only with one non-empty row', () => {
		const list = blockFieldByPath('05-functional.acceptance')!;
		const prose = blockFieldByPath('01-origin.objective')!;
		expect(holdsValue(list, '\n  \n')).toBe(false);
		expect(holdsValue(list, '\nAn import completes\n')).toBe(true);
		expect(holdsValue(prose, '   ')).toBe(false);
		expect(holdsValue(prose, 'x')).toBe(true);
	});

	it('offers Resume only when a hole was left behind, empty or open', () => {
		expect(canResume('').ok).toBe(false);
		expect(canResume('05-functional.mainFlow').ok).toBe(true);
		expect(firstEmptyFieldPath(allFilled(), [LEAF])).toBe('');
		expect(firstEmptyFieldPath(new Set(), [LEAF])).toBe(ALL_BLOCK_FIELDS[0].path);
		expect(firstEmptyFieldPath(allFilled(), [LEAF], [fieldKey('02-problem.value', LEAF)])).toBe(
			'02-problem.value'
		);
	});
});

describe('writing a field through to its canonical section', () => {
	it('refuses a field that does not name its home', () => {
		expect(
			canSaveField({ canonicalPath: '', userCanWriteCanonical: true, refusalReason: 'none' }).ok
		).toBe(false);
	});

	it('applies the permission of the owning section', () => {
		expect(
			canSaveField({
				canonicalPath: 'users.permissions.editor',
				userCanWriteCanonical: false,
				refusalReason: 'none'
			}).ok
		).toBe(false);
	});

	it('reports the owning section validation in place', () => {
		expect(
			canSaveField({
				canonicalPath: 'data.entities.request.name',
				userCanWriteCanonical: true,
				refusalReason: 'validation'
			}).ok
		).toBe(false);
	});

	it('accepts a write that names a path the reader may write', () => {
		expect(
			canSaveField({
				canonicalPath: 'features.leafMeta.feat-a.objective',
				userCanWriteCanonical: true,
				refusalReason: 'none'
			}).ok
		).toBe(true);
	});

	it('gives a leaf-scoped field one home per touched feature', () => {
		const f = blockFieldByPath('01-origin.objective')!;
		expect(isLeafScoped(f)).toBe(true);
		// The objective of a change to two features is two objectives; writing one
		// over the other would lose half the spec.
		expect(canonicalPathsFor(f, ['feat-a', 'feat-b']).map((h) => h.path)).toEqual([
			'features.leafMeta.feat-a.objective',
			'features.leafMeta.feat-b.objective'
		]);
		// No home until the request has worked out what it touches.
		expect(canonicalPathsFor(f, [])).toEqual([]);
	});

	it('gives a project-wide field one home, whatever the leaves', () => {
		const noLeaf = blockFieldByPath('07-data.entities')!;
		expect(isLeafScoped(noLeaf)).toBe(false);
		expect(canonicalPathsFor(noLeaf, []).map((h) => h.path)).toEqual(['data.entities']);
		expect(canonicalPathsFor(noLeaf, ['feat-a']).map((h) => h.path)).toEqual(['data.entities']);
	});

	it('leaves the gate meaningful while the touched features are unknown', () => {
		// Every non-leaf field filled, but nothing named: the score cannot reach
		// 100, because a request that has not said what it touches is not a
		// complete spec. This is what replaces the old open-time leaf demand.
		const nonLeaf = ALL_BLOCK_FIELDS.filter((f) => !isLeafScoped(f)).map((f) => fieldKey(f.path));
		const reading = readMaturity(new Set(nonLeaf), [], []);
		expect(reading.score).toBeLessThan(100);
		expect(reading.tier).not.toBe('ready');
		expect(reading.criticalEmptyFields.length).toBeGreaterThan(0);
	});

	it('counts a leaf-scoped field only once every touched feature has it', () => {
		const leaves = ['feat-a', 'feat-b'];
		const all = ALL_BLOCK_FIELDS.flatMap((f) =>
			isLeafScoped(f) ? leaves.map((l) => fieldKey(f.path, l)) : [fieldKey(f.path)]
		);
		expect(readMaturity(new Set(all), [], leaves).score).toBe(100);
		// Drop one leaf's copy: the field is no longer filled, so the hole returns.
		const partial = all.filter((k) => k !== fieldKey('01-origin.objective', 'feat-b'));
		const reading = readMaturity(new Set(partial), [], leaves);
		expect(reading.score).toBeLessThan(100);
		expect(reading.criticalEmptyFields).toContain('01-origin.objective');
	});

	it('every field names an owning section and a path', () => {
		for (const f of ALL_BLOCK_FIELDS) {
			expect(f.section).toBeTruthy();
			expect(f.canonicalPath).toBeTruthy();
		}
	});
});

describe('the maturity score', () => {
	it('says what it measures, and that it never blocks by itself', () => {
		expect(readMaturity(new Set()).statement).toContain('absence of holes');
		expect(MATURITY_STATEMENT).toContain('absence of holes');
		expect(readMaturity(new Set()).neverBlocks).toBe(MATURITY_NEVER_BLOCKS);
		expect(MATURITY_NEVER_BLOCKS).toContain('never blocks');
	});

	it('is a weighted sum, so a filled title does not weigh as much as invariants', () => {
		const title = readMaturity(new Set([fieldKey('01-origin.trigger', LEAF)]), [], [LEAF]);
		const invariants = readMaturity(
			new Set([fieldKey('06-behavioural.invariants', LEAF)]),
			[],
			[LEAF]
		);
		expect(invariants.score).toBeGreaterThan(title.score);
	});

	it('never goes above 100', () => {
		expect(readMaturity(allFilled(), [], [LEAF]).score).toBe(100);
		expect(readMaturity(allFilled(), [], [LEAF]).score).toBeLessThanOrEqual(100);
	});

	it('reaches Ready only with no critical field empty', () => {
		expect(readMaturity(allFilled(), [], [LEAF]).tier).toBe('ready');
		expect(tierOf(88, 2)).not.toBe('ready');
		expect(tierOf(100, 1)).not.toBe('ready');
	});

	it('names the critical fields still empty rather than counting them', () => {
		const all = allFilled();
		all.delete(fieldKey('05-functional.acceptance', LEAF));
		all.delete(fieldKey('02-problem.value', LEAF));
		const reading = readMaturity(all, [], [LEAF]);
		expect(reading.criticalEmptyCount).toBe(2);
		expect(reading.criticalEmptyFields).toContain('05-functional.acceptance');
		expect(reading.criticalEmptyFields).toContain('02-problem.value');
	});

	it('never lets a reading block: a block edited in its own capability is not critical', () => {
		const all = allFilled();
		all.delete(fieldKey('06-behavioural.invariants', LEAF));
		all.delete(fieldKey('04-permissions.grants'));
		const reading = readMaturity(all, [], [LEAF]);
		expect(reading.score).toBeLessThan(100);
		expect(reading.criticalEmptyCount).toBe(0);
	});

	it('covers all ten blocks', () => {
		expect(readMaturity(new Set()).blocksScored).toBe(10);
		expect(readMaturity(new Set()).perBlock).toHaveLength(10);
	});
});

describe('the stage gate', () => {
	it('refuses a request with a critical hole and a blocking finding, whatever the percentage', () => {
		const r = req({
			coherenceFindings: [
				{
					id: 'f1',
					axis: 'behavioural',
					severity: 'blocking',
					title: 'x',
					requestNodeId: 'a',
					existingNodeId: 'b',
					fixNowTarget: 'capability:billing/rule:refund-window',
					published: true
				}
			]
		});
		expect(canCrossToImplementation(r, 1).ok).toBe(false);
		// No critical hole, but the finding still blocks.
		expect(canCrossToImplementation(r, 0).ok).toBe(false);
	});

	it('opens with no critical field empty and nothing blocking; a number never blocks', () => {
		expect(canCrossToImplementation(req(), 0).ok).toBe(true);
		expect(canCrossToImplementation(req(), 1).ok).toBe(false);
	});

	it('refuses a waiver with no reason, and one from an AI client', () => {
		expect(canWaive(person, '', false).ok).toBe(false);
		expect(canWaive(aiClient, 'a good reason', false).ok).toBe(false);
		expect(canWaive(person, 'Ship the read-only report first.', false).ok).toBe(true);
	});

	it('refuses a waiver against a gate that is already met', () => {
		expect(canWaive(person, 'reason', true).ok).toBe(false);
	});

	it('lets only an admin lift a waiver', () => {
		const waived = req({
			waivers: [
				{
					id: 'w1',
					stage: 'implementation',
					reason: 'r',
					grantedBy: 'person-lea',
					grantedAt: 'now',
					liftedBy: null,
					liftedAt: null
				}
			]
		});
		expect(canLiftWaiver(designer, waived).ok).toBe(false);
		expect(canLiftWaiver(aiClient, waived).ok).toBe(false);
		expect(canLiftWaiver(admin, waived).ok).toBe(true);
		expect(canLiftWaiver(admin, req()).ok).toBe(false);
	});

	it('points a block at the impact list that answers it, or at none', () => {
		const field = (path: string) => ALL_BLOCK_FIELDS.find((f) => f.path === path)!;
		expect(impactSectionOf(field('07-data.entities'))).toBe('entities_and_fields');
		expect(impactSectionOf(field('10-security.terms'))).toBe('glossary_terms');
		expect(impactSectionOf(field('04-permissions.grants'))).toBe('permissions');
		// Nothing in the report covers Foundation or the architecture board, so
		// those blocks say nothing rather than borrowing another block's answer.
		expect(impactSectionOf(field('10-security.expectations'))).toBeNull();
		expect(impactSectionOf(field('09-technical.constraints'))).toBeNull();
		// Behaviour is left out on purpose: the features list names what the change
		// REACHES, which is not what a reader of the behavioural block is after.
		expect(impactSectionOf(field('06-behavioural.rules'))).toBeNull();
	});

	it('keeps the board at five columns', () => {
		expect(BOARD_COLUMNS).toHaveLength(5);
	});

	it('refuses a drop into an unmet gate and a delivered card dragged back', () => {
		expect(canDropCard(req({ stage: 'specification' }), false).ok).toBe(false);
		expect(canDropCard(req({ stage: 'specification' }), true).ok).toBe(true);
		expect(canDropCard(req({ stage: 'delivered' }), true).ok).toBe(false);
	});

	it('shows a request at the last stage it earned, not where it was put', () => {
		const opened = { title: 'Dark theme', origin: 'customer_feedback' as const };
		// Taken to delivered with a specification full of holes: no gate opened
		// any of the three stages it crossed.
		expect(supportedStage(req({ ...opened, stage: 'delivered' }), 2)).toBe('coherence');
		// The same request once the spec has no holes left: implementation is
		// earned, and the two stages after it are not.
		expect(supportedStage(req({ ...opened, stage: 'delivered' }), 0)).toBe('implementation');
		// An undecided line holds it at implementation; decided, acceptance opens.
		const decided = { ...line({ decision: 'validated' as const }) };
		expect(
			supportedStage(
				req({ ...opened, stage: 'delivered', implementationFindings: [line()] }),
				0
			)
		).toBe('implementation');
		expect(
			supportedStage(
				req({ ...opened, stage: 'acceptance', implementationFindings: [decided] }),
				0
			)
		).toBe('acceptance');
	});

	it('never advances a request on its own, because crossing is a decision', () => {
		const ready = req({ title: 'Dark theme', origin: 'customer_feedback', stage: 'specification' });
		expect(supportedStage(ready, 0)).toBe('specification');
	});

	it('honours a waiver, which is the named way to stand past an unmet gate', () => {
		const waived = req({
			title: 'Dark theme',
			origin: 'customer_feedback',
			stage: 'implementation',
			waivers: [
				{
					id: 'w1',
					stage: 'implementation',
					reason: 'The palette ships with the sprint',
					grantedBy: 'ada',
					grantedAt: '2026-09-02T10:00:00.000Z',
					liftedBy: null,
					liftedAt: null
				}
			]
		});
		expect(supportedStage(waived, 2)).toBe('implementation');
	});

	it('sends a request with no title or origin back to draft', () => {
		expect(supportedStage(req({ stage: 'coherence' }), 0)).toBe('draft');
	});
});

describe('the coherence report', () => {
	it('only means something over the whole project', () => {
		expect(canRunCheck(req(), 'request_only', 'engine').ok).toBe(false);
		expect(canRunCheck(req(), 'whole_project', 'engine').ok).toBe(true);
	});

	it('is never produced by the LLM', () => {
		expect(canRunCheck(req(), 'whole_project', 'llm').ok).toBe(false);
	});

	it('runs one check at a time', () => {
		const running = req({
			coherenceReport: { status: 'running', projectScore: 78, requestDelta: 0, ranAt: null }
		});
		expect(canRunCheck(running, 'whole_project', 'engine').ok).toBe(false);
	});

	it('publishes a finding only when it names both nodes and offers a Fix now', () => {
		const base = {
			id: 'f1',
			axis: 'behavioural' as const,
			severity: 'blocking' as const,
			title: 'x',
			published: false
		};
		expect(
			canPublishFinding({
				...base,
				requestNodeId: 'a',
				existingNodeId: 'b',
				fixNowTarget: 'capability:billing/rule:refund-window'
			}).ok
		).toBe(true);
		expect(
			canPublishFinding({
				...base,
				requestNodeId: 'a',
				existingNodeId: '',
				fixNowTarget: 'capability:billing/rule:refund-window'
			}).ok
		).toBe(false);
		expect(
			canPublishFinding({ ...base, requestNodeId: 'a', existingNodeId: 'b', fixNowTarget: '' }).ok
		).toBe(false);
	});

	it('holds a request carrying a blocking finding at the gate', () => {
		const ready = req({
			coherenceReport: { status: 'ready', projectScore: 78, requestDelta: -4, ranAt: 'now' }
		});
		expect(canLeaveCoherence(ready).ok).toBe(true);
		expect(canLeaveCoherence(req()).ok).toBe(false);
	});
});

describe('the impact report', () => {
	it('refuses depth zero and depth beyond five', () => {
		expect(canComputePropagation(0).ok).toBe(false);
		expect(canComputePropagation(7).ok).toBe(false);
		expect(canComputePropagation(2).ok).toBe(true);
		expect(canComputePropagation(5).ok).toBe(true);
	});

	it('refuses to switch hypothesis before a first propagation', () => {
		expect(canSwitchHypothesis(req()).ok).toBe(false);
		const ran = req({
			impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 'now' }
		});
		expect(canSwitchHypothesis(ran).ok).toBe(true);
	});

	it('does not lock the reader on the first hypothesis they pick', () => {
		const impact = (hypothesis: 'add' | 'change') => ({
			id: `i-${hypothesis}`,
			hypothesis,
			section: 'leaves' as const,
			nodeKind: 'feature' as const,
			codeWork: null,
			groupPath: [],
			note: '',
			nodeId: 'feat-a',
			nodeLabel: 'Shell and Local Privacy > Dark theme',
			depth: 1,
			severity: 'low' as const,
			migrationImplied: null,
			ruleWork: null
		});
		const both = req({
			impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 'now' },
			impactFindings: [impact('add'), impact('change')]
		});
		// A reading that was computed comes back as computed, and the control stays
		// live, so the reader can go back to the one they came from.
		const toChange = switchHypothesis(both, 'change');
		expect(toChange.impactReport.status).toBe('ready');
		expect(canSwitchHypothesis(toChange).ok).toBe(true);
		expect(switchHypothesis(toChange, 'add').impactReport.hypothesis).toBe('add');
		// One nobody has read still asks to be computed.
		const toRemove = switchHypothesis(both, 'remove');
		expect(toRemove.impactReport.status).toBe('not_run');
		expect(canSwitchHypothesis(toRemove).ok).toBe(true);
	});

	it('does not carry a result over to another hypothesis', () => {
		const ran = req({
			impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 'now' }
		});
		const switched = switchHypothesis(ran, 'remove');
		expect(switched.impactReport.hypothesis).toBe('remove');
		expect(switched.impactReport.status).toBe('not_run');
	});

	it('reads a distance as what it asks of the reader', () => {
		expect(reachLabel(1)).toBe('direct');
		expect(reachLabel(2)).toBe('knock-on');
		expect(reachLabel(4)).toBe('4 steps out');
		// One link means the work lands there; two means it only has to be checked.
		expect(reachMeaning(1)).toContain('edit');
		expect(reachMeaning(2)).toContain('Nothing is edited here');
		expect(reachMeaning(4)).toContain('3 links');
	});

	it('keeps entities shut while a migration answer is missing', () => {
		const withGap = req({
			impactFindings: [
				{
					id: 'i1',
					hypothesis: 'add',
					section: 'entities_and_fields',
					nodeKind: 'feature' as const,
					codeWork: null,
					groupPath: [],
					note: '',
					nodeId: 'e1',
					nodeLabel: 'Invoice',
					depth: 1,
					severity: 'medium',
					migrationImplied: null,
					ruleWork: null
				}
			]
		});
		expect(canOpenEntities(withGap).ok).toBe(false);
		const answered = req({
			impactFindings: [{ ...withGap.impactFindings[0], migrationImplied: true }]
		});
		expect(canOpenEntities(answered).ok).toBe(true);
	});

	it('does not open an empty section', () => {
		expect(canOpenEntities(req()).ok).toBe(false);
		expect(canOpenRules(req()).ok).toBe(false);
	});

	it('keeps rewrites apart from replays', () => {
		const mixed = req({
			impactFindings: [
				{
					id: 'r1',
					hypothesis: 'add',
					section: 'rules_and_scenarios',
					nodeKind: 'feature' as const,
					codeWork: null,
					groupPath: [],
					note: '',
					nodeId: 'x',
					nodeLabel: 'Rule A',
					depth: 1,
					severity: 'low',
					migrationImplied: null,
					ruleWork: 'replay'
				},
				{
					id: 'r2',
					hypothesis: 'add',
					section: 'rules_and_scenarios',
					nodeKind: 'feature' as const,
					codeWork: null,
					groupPath: [],
					note: '',
					nodeId: 'y',
					nodeLabel: 'Rule B',
					depth: 1,
					severity: 'high',
					migrationImplied: null,
					ruleWork: 'rewrite'
				}
			]
		});
		expect(canOpenRules(mixed).ok).toBe(true);
		const unseparated = req({
			impactFindings: [{ ...mixed.impactFindings[0], ruleWork: null }]
		});
		expect(canOpenRules(unseparated).ok).toBe(false);
	});
});

describe('the implementation report', () => {
	it('refuses the agent own account as a source', () => {
		expect(canBuildReport('agent_account').ok).toBe(false);
		expect(canBuildReport('requirement_crossing').ok).toBe(true);
	});

	it('derives the verdict from the anchors and the crossing', () => {
		expect(
			deriveVerdict({
				hasRequirementAnchor: false,
				anchorForeignLeaf: false,
				locatedInCode: true,
				acceptanceTestPassing: true
			})
		).toBe('out_of_scope');
		expect(
			deriveVerdict({
				hasRequirementAnchor: true,
				anchorForeignLeaf: true,
				locatedInCode: true,
				acceptanceTestPassing: true
			})
		).toBe('regression');
		expect(
			deriveVerdict({
				hasRequirementAnchor: true,
				anchorForeignLeaf: false,
				locatedInCode: false,
				acceptanceTestPassing: false
			})
		).toBe('missing');
		expect(
			deriveVerdict({
				hasRequirementAnchor: true,
				anchorForeignLeaf: false,
				locatedInCode: true,
				acceptanceTestPassing: false
			})
		).toBe('non_conform');
		expect(
			deriveVerdict({
				hasRequirementAnchor: true,
				anchorForeignLeaf: false,
				locatedInCode: true,
				acceptanceTestPassing: true
			})
		).toBe('conform');
	});

	it('refuses conform without a passing acceptance test', () => {
		expect(canMarkConform(line({ acceptanceTestPassing: false })).ok).toBe(false);
		expect(canMarkConform(line({ acceptanceTestPassing: true })).ok).toBe(true);
	});

	it('refuses out of scope on an anchored span', () => {
		expect(canFlagOutOfScope(line({ hasRequirementAnchor: true })).ok).toBe(false);
		expect(canFlagOutOfScope(line({ hasRequirementAnchor: false })).ok).toBe(true);
	});

	it('refuses a regression on the request own leaf', () => {
		expect(canFlagRegression(line({ anchorForeignLeaf: false })).ok).toBe(false);
		expect(canFlagRegression(line({ anchorForeignLeaf: true })).ok).toBe(true);
	});

	it('refuses a decision with no author', () => {
		const r = req({ implementationFindings: [line()], iterations: [iteration()] });
		expect(canDecide(r, { id: '', kind: 'person', role: 'member' }).ok).toBe(false);
		expect(canDecide(r, person).ok).toBe(true);
	});

	it('takes no decision on a closed report', () => {
		const r = req({
			implementationFindings: [line()],
			iterations: [iteration({ reportStatus: 'closed' })]
		});
		expect(canDecide(r, person).ok).toBe(false);
	});

	it('offers adopt and remove only on an out-of-scope line', () => {
		const r = req({ iterations: [iteration()] });
		expect(canAdopt(r, person, line({ verdict: 'out_of_scope' })).ok).toBe(true);
		expect(canAdopt(r, person, line({ verdict: 'missing' })).ok).toBe(false);
		expect(canRemove(r, person, line({ verdict: 'out_of_scope' })).ok).toBe(true);
		expect(canRemove(r, person, line({ verdict: 'conform' })).ok).toBe(false);
	});

	it('refuses to close while a line is undecided', () => {
		const open = req({
			implementationFindings: [line(), line({ id: 'l2' }), line({ id: 'l3' })],
			iterations: [iteration()]
		});
		expect(undecidedCount(open)).toBe(3);
		expect(canCloseReport(open).ok).toBe(false);
		const decided = req({
			implementationFindings: [line({ decision: 'validated' })],
			iterations: [iteration()]
		});
		expect(canCloseReport(decided).ok).toBe(true);
	});
});

function iteration(over: Partial<EvolutionRequest['iterations'][number]> = {}) {
	return {
		number: 1,
		startedAt: '2026-09-01T00:00:00Z',
		brief: '',
		protectedLineIds: [],
		reportStatus: 'ready' as const,
		...over
	};
}

describe('the rebrief', () => {
	it('is composed only from a fully decided report with at least one refusal', () => {
		const undecided = req({
			implementationFindings: [line({ decision: 'invalidated' }), line({ id: 'l2' })],
			iterations: [iteration()]
		});
		expect(canComposeRebrief(undecided).ok).toBe(false);

		const nothingRefused = req({
			implementationFindings: [line({ decision: 'validated' })],
			iterations: [iteration()]
		});
		expect(canComposeRebrief(nothingRefused).ok).toBe(false);

		const refused = req({
			implementationFindings: [
				line({ decision: 'invalidated' }),
				line({ id: 'l2', decision: 'validated', verdict: 'conform' })
			],
			iterations: [iteration()]
		});
		expect(canComposeRebrief(refused).ok).toBe(true);
		expect(protectedLineIds(refused)).toEqual(['l2']);
	});

	it('amends the spec only from a fully decided report', () => {
		expect(
			canAmendSpec(req({ implementationFindings: [line()], iterations: [iteration()] })).ok
		).toBe(false);
		expect(
			canAmendSpec(
				req({ implementationFindings: [line({ decision: 'validated' })], iterations: [iteration()] })
			).ok
		).toBe(true);
	});

	it('starts no implementation while the coherence gate is closed', () => {
		expect(canSendBackForImplementation(req({ coherenceGateClosed: true })).ok).toBe(false);
		expect(canSendBackForImplementation(req({ coherenceGateClosed: false })).ok).toBe(true);
	});

	it('opens an earlier report once there is more than one iteration', () => {
		expect(canOpenPreviousReport(req({ iterations: [iteration()] })).ok).toBe(false);
		expect(
			canOpenPreviousReport(req({ iterations: [iteration(), iteration({ number: 2 })] })).ok
		).toBe(true);
	});
});

describe('the LLM completion', () => {
	it('runs one at a time and needs a hole to fill', () => {
		expect(canGenerateProposals('running', 12).ok).toBe(false);
		expect(canGenerateProposals('idle', 0).ok).toBe(false);
		expect(canGenerateProposals('idle', 12).ok).toBe(true);
	});

	it('lets no AI client accept a proposal', () => {
		const p = createProposal({
			citedSourceIds: ['src-1'],
			reasoningSeparatesReadFromInferred: true,
			canonicalPath: 'features.leafMeta.feat-a.objective'
		});
		expect(canAcceptProposal(aiClient, p).ok).toBe(false);
		expect(canAcceptProposal(person, p).ok).toBe(true);
	});

	it('refuses a proposal citing no source', () => {
		const p = createProposal({
			citedSourceIds: [],
			reasoningSeparatesReadFromInferred: true,
			canonicalPath: 'x'
		});
		expect(canAcceptProposal(person, p).ok).toBe(false);
	});

	it('refuses a proposal flagged on the glossary', () => {
		const p = createProposal({
			citedSourceIds: ['s1', 's2', 's3'],
			bannedSynonymDetected: true,
			reasoningSeparatesReadFromInferred: true,
			canonicalPath: 'x'
		});
		expect(canAcceptProposal(person, p).ok).toBe(false);
	});

	it('refuses a proposal whose reasoning does not separate read from inferred', () => {
		const p = createProposal({
			citedSourceIds: ['s1'],
			reasoningSeparatesReadFromInferred: false,
			canonicalPath: 'x'
		});
		expect(canAcceptProposal(person, p).ok).toBe(false);
	});

	it('rewords only an undecided proposal', () => {
		expect(canRewordProposal(createProposal({ decision: 'pending' })).ok).toBe(true);
		expect(canRewordProposal(createProposal({ decision: 'accepted' })).ok).toBe(false);
	});

	it('lets no AI client refuse a proposal either', () => {
		expect(canRefuseProposal(aiClient).ok).toBe(false);
		expect(canRefuseProposal(person).ok).toBe(true);
	});
});

describe('the acceptance walkthrough', () => {
	it('re-anchors only a draft observation', () => {
		expect(canAnchor(createObservation({ status: 'draft' })).ok).toBe(true);
		expect(canAnchor(createObservation({ status: 'logged' })).ok).toBe(false);
	});

	it('annotates only an attached capture', () => {
		expect(canAnnotateCapture(createObservation({ captureAttached: false })).ok).toBe(false);
		expect(canAnnotateCapture(createObservation({ captureAttached: true })).ok).toBe(true);
	});

	it('logs only a typed, anchored, illustrated observation', () => {
		const unanchored = createObservation({
			screenId: '',
			elementId: '',
			captureAttached: true,
			captureAnnotated: true
		});
		expect(canLogObservation(unanchored).ok).toBe(false);

		const unannotated = createObservation({
			screenId: 'screen-pricing',
			elementId: 'btn-start-trial',
			captureAttached: true,
			captureAnnotated: false
		});
		expect(canLogObservation(unannotated).ok).toBe(false);

		const complete = createObservation({
			type: 'revealed_need',
			target: 'delivered_product',
			screenId: 'screen-pricing',
			elementId: 'btn-start-trial',
			captureAttached: true,
			captureAnnotated: true
		});
		expect(canLogObservation(complete).ok).toBe(true);
	});

	it('takes no new message once a ruling is recorded', () => {
		expect(canPostMessage(createObservation({ ruling: 'open' }), 'u-viewer-nour').ok).toBe(true);
		expect(canPostMessage(createObservation({ ruling: 'validated' }), 'u1').ok).toBe(false);
		expect(canPostMessage(createObservation({ ruling: 'open' }), '').ok).toBe(false);
	});

	it('lets no AI client and no viewer rule on an observation', () => {
		const open = createObservation({ ruling: 'open' });
		expect(canRule(aiClient, open).ok).toBe(false);
		expect(canRule(viewer, open).ok).toBe(false);
		expect(canRule(person, open).ok).toBe(true);
		expect(canRule(person, createObservation({ ruling: 'validated' })).ok).toBe(false);
	});

	it('drops no remark without a stated reason', () => {
		const open = createObservation({ ruling: 'open' });
		expect(canInvalidate(person, open, '').ok).toBe(false);
		expect(canInvalidate(person, open, 'Already covered by the pricing rule.').ok).toBe(true);
	});
});

describe('folding an observation back into the spec', () => {
	it('folds back only a validated observation, into a named leaf', () => {
		const validated = createObservation({ ruling: 'validated' });
		expect(canFoldBack(person, validated, 'feat-a').ok).toBe(true);
		expect(canFoldBack(person, validated, '').ok).toBe(false);
		expect(canFoldBack(person, createObservation({ ruling: 'deferred' }), 'feat-a').ok).toBe(false);
		expect(canFoldBack(viewer, validated, 'feat-a').ok).toBe(false);
	});

	it('does not count a deferred observation against closing', () => {
		const deferred = req({ observations: [createObservation({ ruling: 'deferred' })] });
		expect(validatedNotFoldedBack(deferred)).toBe(0);
		expect(canCloseAfterAcceptance({ ...person, role: 'owner' }, deferred).ok).toBe(true);
	});

	it('refuses to close with a validated observation still hanging', () => {
		const hanging = req({ observations: [createObservation({ ruling: 'validated' })] });
		expect(validatedNotFoldedBack(hanging)).toBe(1);
		expect(canCloseAfterAcceptance({ ...person, role: 'owner' }, hanging).ok).toBe(false);
	});

	it('lets no viewer close a request', () => {
		expect(canCloseAfterAcceptance(viewer, req()).ok).toBe(false);
	});
});

describe('the decision history', () => {
	it('records nothing without an author, and nothing twice', () => {
		expect(canRecord({ authorId: '', recorded: false }).ok).toBe(false);
		expect(canRecord({ authorId: 'person-1', recorded: true }).ok).toBe(false);
		expect(canRecord({ authorId: 'person-1', recorded: false }).ok).toBe(true);
	});

	it('stamps an accepted proposal with the proposal and the accepting person', () => {
		expect(
			canRecordAcceptedProposal({
				authorKind: 'ai_client',
				proposalId: 'prop-4412',
				acceptedByPersonId: ''
			}).ok
		).toBe(false);
		expect(
			canRecordAcceptedProposal({
				authorKind: 'person',
				proposalId: '',
				acceptedByPersonId: 'person-1'
			}).ok
		).toBe(false);
		expect(
			canRecordAcceptedProposal({
				authorKind: 'person',
				proposalId: 'prop-4412',
				acceptedByPersonId: 'person-1'
			}).ok
		).toBe(true);
	});

	it('supersedes rather than deletes', () => {
		const entry = {
			id: 'h1',
			type: 'verdict_decision' as const,
			summary: 's',
			authorId: 'person-1',
			authorKind: 'person' as const,
			recordedAt: 'now',
			proposalId: null,
			acceptedByPersonId: null,
			supersededById: null,
			channel: null
		};
		expect(canSupersede(person, entry).ok).toBe(true);
		expect(canSupersede(aiClient, entry).ok).toBe(false);
		expect(canDeleteEntry().ok).toBe(false);
		expect(canDeleteEntry()).toMatchObject({ reason: expect.stringContaining('append-only') });
	});

	it('appends an attributed entry to the timeline', () => {
		const withEntry = record(req(), {
			id: 'h1',
			type: 'stage_crossing',
			summary: 'Crossed the coherence gate',
			actor: person,
			at: '2026-09-01T10:00:00Z'
		});
		expect(withEntry.history).toHaveLength(1);
		expect(withEntry.history[0].authorKind).toBe('person');
		expect(withEntry.history[0].authorId).toBe('person-1');
	});
});

describe('the parse boundary', () => {
	it('drops an unattributed history entry, so the guard cannot be bypassed', async () => {
		const { parseEvolutionDraft } = await import('$application/parse-evolution-draft');
		const parsed = parseEvolutionDraft(
			{
				requests: [
					{
						id: 'r1',
						mainLeafId: 'feat-a',
						secondaryLeafIds: ['feat-a', 'feat-b'],
						leafIds: ['feat-b'],
						impactReport: { depth: 99, status: 'ready' },
						history: [
							{ id: 'h1', authorId: 'person-1', type: 'stage_crossing' },
							{ id: 'h2', authorId: '', type: 'stage_crossing' }
						]
					},
					{ id: '', title: 'no id' }
				]
			},
			'p1'
		);
		expect(parsed.requests).toHaveLength(1);
		const r = parsed.requests[0];
		// A legacy dossier's main leaf and its list beside it fold into one set,
		// deduplicated: the set says what is touched, not how often.
		expect(r.leafIds).toEqual(['feat-a', 'feat-b']);
		// The propagation stops at five hops whatever a caller asks for.
		expect(r.impactReport.depth).toBe(5);
		expect(r.history).toHaveLength(1);
		expect(r.history[0].authorId).toBe('person-1');
	});

	it('falls back on an unknown enum rather than storing it', async () => {
		const { parseEvolutionDraft } = await import('$application/parse-evolution-draft');
		const parsed = parseEvolutionDraft(
			{
				requests: [
					{
						id: 'r1',
						stage: 'not-a-stage',
						origin: 'invented',
						history: [{ id: 'h1', authorId: 'a', type: 'nonsense', authorKind: 'wizard' }]
					}
				]
			},
			'p1'
		);
		const r = parsed.requests[0];
		expect(r.stage).toBe('draft');
		expect(r.origin).toBeNull();
		expect(r.history[0].type).toBe('stage_crossing');
		expect(r.history[0].authorKind).toBe('person');
	});
});

describe('writing a dossier field into the section that owns it', () => {
	const emptyFeatures = (): ProjectFeaturesDraft => ({
		projectId: 'p1',
		cores: [],
		families: [],
		features: [],
		mvpAssignments: [],
		releases: [],
		roadmapAssignments: [],
		lastSavedAt: null
	});

	it('every canonical path names something the owning section actually holds', () => {
		// A field pointing at a path nothing holds could never be written, and
		// would sit on the page as a hole no one could close.
		const leafMetaKeys = new Set([
			'objective',
			'expectedEffect',
			'problem',
			'value',
			'code',
			'acceptanceCriteria',
			'dependsOn',
			'sourceIds',
			'status',
			'trl'
		]);
		for (const f of ALL_BLOCK_FIELDS) {
			if (!f.canonicalPath.startsWith('features.leafMeta.')) continue;
			expect(leafMetaKeys).toContain(f.canonicalPath.split('.').pop());
		}
	});

	it('writes prose into the leaf it belongs to, keeping no copy', async () => {
		const { saveDossierField, readDossierField } = await import(
			'$application/use-cases/save-dossier-field'
		);
		const result = saveDossierField(emptyFeatures(), {
			fieldPath: '02-problem.statement',
			leafId: 'feat-a',
			value: 'Operators re-key the same invoice twice.\nIt takes four minutes each time.',
			sourceIds: ['src-interview'],
			canWriteCanonical: true
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.path).toBe('features.leafMeta.feat-a.problem');
		expect(result.draft.leafMeta?.['feat-a'].problem).toContain('four minutes');
		expect(result.draft.leafMeta?.['feat-a'].sourceIds).toEqual(['src-interview']);
		// What goes in comes back out, newlines and all.
		expect(readDossierField(result.draft, '02-problem.statement', 'feat-a').value).toContain('\n');
	});

	it('turns a list field into one criterion per line, keeping ids stable', async () => {
		const { saveDossierField } = await import('$application/use-cases/save-dossier-field');
		const first = saveDossierField(emptyFeatures(), {
			fieldPath: '05-functional.acceptance',
			leafId: 'feat-a',
			value: 'Exports every field\nRefuses an empty range',
			canWriteCanonical: true
		});
		expect(first.status).toBe('accepted');
		if (first.status !== 'accepted') return;
		const ids = (first.draft.leafMeta?.['feat-a'].acceptanceCriteria ?? []).map((c) => c.id);
		expect(ids).toHaveLength(2);

		// Editing one line must not renumber the other and break references to it.
		const second = saveDossierField(first.draft, {
			fieldPath: '05-functional.acceptance',
			leafId: 'feat-a',
			value: 'Exports every field\nRefuses an empty range, with a reason',
			canWriteCanonical: true
		});
		expect(second.status).toBe('accepted');
		if (second.status !== 'accepted') return;
		const after = second.draft.leafMeta?.['feat-a'].acceptanceCriteria ?? [];
		expect(after[0].id).toBe(ids[0]);
		expect(after[1].id).not.toBe(ids[1]);
	});

	it('refuses a write the owning section would refuse, leaving no partial state', async () => {
		const { saveDossierField } = await import('$application/use-cases/save-dossier-field');
		const draft = emptyFeatures();
		const refusedWrite = saveDossierField(draft, {
			fieldPath: '02-problem.statement',
			leafId: 'feat-a',
			value: 'anything',
			canWriteCanonical: false
		});
		expect(refusedWrite.status).toBe('refused');
		expect(draft.leafMeta).toBeUndefined();
	});

	it('refuses a leaf-scoped write that names no leaf', async () => {
		const { saveDossierField } = await import('$application/use-cases/save-dossier-field');
		const result = saveDossierField(emptyFeatures(), {
			fieldPath: '02-problem.statement',
			leafId: null,
			value: 'anything',
			canWriteCanonical: true
		});
		expect(result.status).toBe('refused');
	});

	it('will not write a field whose home has an editor of its own', async () => {
		const { saveDossierField } = await import('$application/use-cases/save-dossier-field');
		const result = saveDossierField(emptyFeatures(), {
			fieldPath: '06-behavioural.invariants',
			leafId: 'feat-a',
			value: 'anything',
			canWriteCanonical: true
		});
		expect(result.status).toBe('refused');
		if (result.status !== 'refused') return;
		expect(result.reason).toContain('capability that owns it');
	});

	it('clears the value in its section when the field is emptied', async () => {
		const { saveDossierField, readDossierField } = await import(
			'$application/use-cases/save-dossier-field'
		);
		const written = saveDossierField(emptyFeatures(), {
			fieldPath: '01-origin.objective',
			leafId: 'feat-a',
			value: 'Ship a bulk export',
			canWriteCanonical: true
		});
		if (written.status !== 'accepted') return;
		const cleared = saveDossierField(written.draft, {
			fieldPath: '01-origin.objective',
			leafId: 'feat-a',
			value: '   ',
			canWriteCanonical: true
		});
		if (cleared.status !== 'accepted') return;
		expect(cleared.draft.leafMeta?.['feat-a'].objective).toBeUndefined();
		expect(readDossierField(cleared.draft, '01-origin.objective', 'feat-a').value).toBe('');
	});
});
