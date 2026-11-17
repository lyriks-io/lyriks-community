import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type EvolutionRequest, type FieldVersion, type HistoryEntry, type ImplementationFinding } from './draft';
import { decisionLog, excerpt } from './decision-log';

/**
 * The decision log reads every decision off what the request records: a step
 * nobody stood behind has no entry, and a reason is only ever the request's own
 * text.
 */

const ana = 'ana@team.test';
const bob = 'bob@team.test';

const version = (key: string, value: string, id = `v-${key}`, at = '2026-10-01T09:00:00.000Z'): FieldVersion => ({
	id,
	key,
	value,
	by: ana,
	byKind: 'person',
	source: 'typed',
	proposalId: null,
	at
});

const line = (over: Partial<ImplementationFinding>): ImplementationFinding => ({
	id: `l-${Math.random()}`,
	iteration: 1,
	verdict: 'conform',
	requirement: 'A requirement',
	filePath: 'src/a.ts',
	lineRange: '1-2',
	specStatement: '',
	codeStatement: '',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: true,
	specVersion: 1,
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
});

const entry = (type: HistoryEntry['type'], at: string, authorKind: HistoryEntry['authorKind'], authorId = ana): HistoryEntry => ({
	id: `h-${at}`,
	type,
	summary: '',
	authorId,
	authorKind,
	recordedAt: at,
	proposalId: null,
	acceptedByPersonId: null,
	supersededById: null,
	channel: null
});

describe('the decision log', () => {
	it('is empty for a request nobody decided anything on', () => {
		expect(decisionLog(createEvolutionRequest({ title: 'Untouched' }))).toEqual([]);
	});

	it('reads the Briefing validated once every written answer stands, with who and the objectives as the reason', () => {
		const request = createEvolutionRequest({
			need: { description: 'Customers wait', situation: 'Orders are typed twice', symptoms: '', cost: '', objectives: 'One entry per order\nNo retyping', measures: '' },
			fieldVersions: [version('00-need.situation', 'Orders are typed twice'), version('00-need.objectives', 'One entry per order\nNo retyping')],
			fieldValidations: [
				{ key: '00-need.situation', versionId: 'v-00-need.situation', by: ana, byKind: 'person', at: '2026-10-02T09:00:00.000Z' },
				{ key: '00-need.objectives', versionId: 'v-00-need.objectives', by: bob, byKind: 'ai_client', at: '2026-10-03T09:00:00.000Z' }
			]
		});
		const [briefing] = decisionLog(request);
		expect(briefing).toMatchObject({ kind: 'briefing', what: 'Briefing validated', at: '2026-10-03T09:00:00.000Z', why: 'Objectives: One entry per order No retyping' });
		expect(briefing.who).toEqual([
			{ id: ana, throughAi: false },
			{ id: bob, throughAi: true }
		]);
	});

	it('has no Briefing entry while one written answer waits, or its latest verdict refused it', () => {
		const base = {
			fieldVersions: [version('00-need.situation', 'S'), version('00-need.objectives', 'O')],
			need: { description: '', situation: 'S', symptoms: '', cost: '', objectives: 'O', measures: '' }
		};
		const waiting = createEvolutionRequest({ ...base, fieldValidations: [{ key: '00-need.situation', versionId: 'v-00-need.situation', by: ana, byKind: 'person', at: '2026-10-02T09:00:00.000Z' }] });
		expect(decisionLog(waiting).some((e) => e.kind === 'briefing')).toBe(false);
		const refused = createEvolutionRequest({
			...base,
			fieldValidations: [
				{ key: '00-need.situation', versionId: 'v-00-need.situation', by: ana, byKind: 'person', at: '2026-10-02T09:00:00.000Z' },
				{ key: '00-need.objectives', versionId: 'v-00-need.objectives', by: ana, byKind: 'person', at: '2026-10-02T09:00:00.000Z' },
				{ key: '00-need.objectives', versionId: 'v-00-need.objectives', by: bob, byKind: 'person', at: '2026-10-02T10:00:00.000Z', verdict: 'refused', reason: 'Too vague' }
			]
		});
		expect(decisionLog(refused).some((e) => e.kind === 'briefing')).toBe(false);
	});

	it('reads a step validated as a whole, a step marked not applicable asking nothing', () => {
		const request = createEvolutionRequest({
			stepDescriptions: { solution: 'A text when the bag is ready.', functional_spec: '', technical_spec: '' },
			stepAnswers: { solution: { examples: '', out_of_scope: 'No e-mail.' }, functional_spec: { refusals: '', failures: '', diagram: '' }, technical_spec: { diagram: '', data: '' } },
			skippedSteps: [{ step: 'technical_spec', reason: 'No technique moves', by: ana, at: '2026-10-01T09:00:00.000Z' }],
			stepValidations: [
				{ step: 'solution', validatorIds: [], validations: [{ by: ana, kind: 'person', at: '2026-10-04T09:00:00.000Z' }] },
				{ step: 'functional_spec', validatorIds: [], validations: [{ by: ana, kind: 'ai_client', at: '2026-10-05T09:00:00.000Z' }] }
			]
		});
		const solution = decisionLog(request).find((e) => e.kind === 'solution');
		expect(solution).toMatchObject({ at: '2026-10-05T09:00:00.000Z', why: 'A text when the bag is ready. Left out: No e-mail.' });
		// The same person on the page and through their AI stood behind it themselves.
		expect(solution?.who).toEqual([{ id: ana, throughAi: false }]);
	});

	it('reads the freeze, a risk accepted with its reason, a waiver, the lines decided, the approval and the close, newest first', () => {
		const request: EvolutionRequest = createEvolutionRequest({
			status: 'closed',
			stage: 'delivered',
			iteration: 1,
			frozenVersions: [
				{
					version: 1,
					at: '2026-10-06T09:00:00.000Z',
					by: ana,
					snapshot: {
						need: createEvolutionRequest().need,
						steps: { solution: '', functional_spec: '', technical_spec: '' },
						subjects: [
							{ id: 'draft:a', kind: 'add', baseLeafId: null, name: 'Notes', description: '', changeSummary: '', objective: '', problem: '', expectedEffect: '', value: '', criteria: [], retiredCriteria: [], rewordedCriteria: [], elements: [] },
							{ id: 'draft:b', kind: 'amend', baseLeafId: 'leaf-1', name: '', description: '', changeSummary: '', objective: '', problem: '', expectedEffect: '', value: '', criteria: [], retiredCriteria: [], rewordedCriteria: [], elements: [] }
						],
						data: []
					}
				}
			],
			coherenceFindings: [
				{
					id: 'f1',
					axis: 'functional',
					severity: 'blocking',
					title: 'The note collides with draft:a',
					requestNodeId: 'n',
					existingNodeId: 'm',
					fixNowTarget: '',
					published: true,
					risk: { by: bob, at: '2026-10-05T12:00:00.000Z', reason: 'Bakers read notes anyway' }
				}
			],
			waivers: [{ id: 'w1', stage: 'acceptance', reason: 'Demo on Friday', grantedBy: ana, grantedAt: '2026-10-07T09:00:00.000Z', liftedBy: null, liftedAt: null }],
			implementationFindings: [
				line({ verdict: 'non_conform', decision: 'invalidated', decidedBy: bob, decidedAt: '2026-10-06T15:00:00.000Z' }),
				line({ verdict: 'out_of_scope', decision: 'adopted', decidedBy: bob, decidedAt: '2026-10-06T16:00:00.000Z' }),
				line({ verdict: 'conform', decision: 'validated', decidedBy: bob, decidedAt: '2026-10-06T16:00:00.000Z' }),
				line({ verdict: 'missing', decision: 'validated', decidedBy: bob, decidedAt: '2026-10-06T16:00:00.000Z', scope: 'inherited' })
			],
			stepValidations: [{ step: 'approval', validatorIds: [], validations: [{ by: ana, kind: 'person', at: '2026-10-08T09:00:00.000Z' }] }],
			deployment: { releaseId: '2026.10', note: 'Shipped with the autumn release.', declaredBy: ana, declaredAt: '2026-10-09T09:00:00.000Z' },
			history: [entry('spec_frozen', '2026-10-06T09:00:00.000Z', 'ai_client'), entry('stage_crossing', '2026-10-09T09:00:00.000Z', 'person')]
		});
		const log = decisionLog(request, { say: (t) => t.replace('draft:a', 'Notes') });
		expect(log.map((e) => e.kind)).toEqual(['closed', 'verification', 'verification', 'verification', 'specification', 'simulation']);
		expect(log[0]).toMatchObject({ what: 'Evolution closed', why: 'Declared live in 2026.10. Shipped with the autumn release.' });
		expect(log[1]).toMatchObject({ what: 'Evolution approved', why: '1 / 2 requirements comply with the spec after 1 cycle.' });
		expect(log[2]).toMatchObject({ what: 'Acceptance testing entered on a waiver', why: 'Why: Demo on Friday' });
		expect(log[3]).toMatchObject({ what: '2 gaps decided in the verification', why: '1 sent back to the code, 1 written into the spec. 1 compliant requirement confirmed.', who: [{ id: bob, throughAi: false }] });
		expect(log[4]).toMatchObject({ what: 'Specification frozen as version 1', why: '1 feature added, 1 feature changed.', who: [{ id: ana, throughAi: true }] });
		expect(log[5]).toMatchObject({ what: 'Accepted as a known risk · The note collides with Notes', why: 'Why: Bakers read notes anyway' });
	});

	it('reads a close nobody declared live off the last crossing, and a cancel with its reason', () => {
		const closed = createEvolutionRequest({ status: 'closed', history: [entry('stage_crossing', '2026-10-02T09:00:00.000Z', 'person'), entry('stage_crossing', '2026-10-03T09:00:00.000Z', 'ai_client', bob)] });
		expect(decisionLog(closed)).toEqual([{ id: 'closed', at: '2026-10-03T09:00:00.000Z', kind: 'closed', what: 'Evolution closed', why: '', who: [{ id: bob, throughAi: true }] }]);
		const cancelled = createEvolutionRequest({ status: 'cancelled', cancellation: { reason: 'Superseded by EVO-009', by: ana, at: '2026-10-04T09:00:00.000Z' } });
		expect(decisionLog(cancelled)).toMatchObject([{ kind: 'cancelled', what: 'Evolution cancelled', why: 'Why: Superseded by EVO-009' }]);
	});
});

describe('an excerpt of the request’s words', () => {
	it('keeps a short text whole and cuts a long one on a word', () => {
		expect(excerpt('  One   line ')).toBe('One line');
		expect(excerpt('alpha beta gamma delta', 15)).toBe('alpha beta…');
	});
});
