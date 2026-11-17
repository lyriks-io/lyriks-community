import { describe, expect, it } from 'vitest';
import {
	coherenceGrid,
	draftChangeNodes,
	decisionReading,
	impactBars,
	impactRows,
	impactStaysLocal,
	parseMeasure,
	purposeOf,
	reportReading,
	rippleDepth,
	rippleReading,
	sizeRank,
	stepAges,
	stepSinceOf,
	waitsOn,
	type BoardCardLike,
	type ImpactFindingLike
} from './decision-figures';
import { attributeTo } from './history';
import { updateNeedAct } from './acts';
import { createEvolutionRequest, type Actor } from './draft';

/**
 * The figures a person decides on: counts, never scores. What these tests pin
 * is the specification of ac-evo-form-decision-brief, ac-evo-mat-split-bar,
 * ac-evo-imp-section-bars, ac-evo-imp-depth-histogram, ac-evo-coh-grid,
 * ac-evo-impl-bar, ac-evo-board-overview, ac-evo-walk-measures and
 * ac-evo-hist-auto-crossing-author.
 */

const need = (values: Record<string, string>) =>
	['description', 'situation', 'symptoms', 'cost', 'objectives', 'measures'].map((k) => ({
		path: `00-need.${k}`,
		value: values[k] ?? '',
		filled: (values[k] ?? '').trim() !== ''
	}));

const finding = (nodeId: string, section: string, depth: number, extra: Partial<ImpactFindingLike> = {}): ImpactFindingLike => ({
	nodeId,
	label: nodeId,
	section,
	verb: 'change',
	depth,
	...extra
});

describe('what moves, and how far', () => {
	const walks = {
		add: { findings: [] },
		change: {
			findings: [
				finding('core:c', 'leaves', 1, { kind: 'core' }),
				finding('surface:a', 'screens_and_journeys', 1),
				finding('file:x', 'code', 1),
				finding('rule:r', 'rules_and_scenarios', 2),
				finding('rule:s', 'rules_and_scenarios', 3)
			]
		},
		remove: { findings: [finding('surface:z', 'screens_and_journeys', 1)] }
	};
	const rows = impactRows(walks, { byLeaf: {}, main: 'change' });

	it('reads the walk the request asks for and leaves the cores out', () => {
		expect(rows.map((r) => r.nodeId)).toEqual(['surface:a', 'file:x', 'rule:r', 'rule:s']);
	});

	it('draws one bar per section that moves, split between touched and reached further', () => {
		expect(impactBars(rows)).toEqual([
			{ code: 'screens_and_journeys', label: 'Screens and journeys', direct: 1, reached: 0 },
			{ code: 'rules_and_scenarios', label: 'Rules and scenarios', direct: 0, reached: 2 },
			{ code: 'code', label: 'Code', direct: 1, reached: 0 }
		].map((b) => expect.objectContaining({ code: b.code, direct: b.direct, reached: b.reached })));
	});

	it('counts how far the change ripples: directly, one link further, two or more', () => {
		expect(rippleDepth(rows).map((b) => b.count)).toEqual([2, 1, 1]);
	});

	it('says what the ripple counts mean in everyday words [criterion:ac-leaf-ac-evo-imp-depth-histogram]', () => {
		const counts = (direct: number, one: number, more: number) => [{ count: direct }, { count: one }, { count: more }];
		expect(rippleReading(counts(12, 0, 0))).toBe('The change only affects what it touches directly. Nothing further away is affected.');
		expect(rippleReading(counts(1, 0, 3))).toBe('Most of what is affected is two or more links away from the change: these are the easy ones to miss, check them.');
		expect(rippleReading(counts(5, 2, 1))).toBe('Most of what is affected is touched directly by the change; a few things further away are affected too.');
		expect(rippleReading(counts(0, 0, 0))).toBeUndefined();
	});

	it('stays local only when everything fits, nothing lies beyond what it touches and no proof gets worse [criterion:ac-leaf-ac-evo-imp-proportional]', () => {
		const direct = [{ depth: 1 }, { depth: 1 }];
		const local = { misfits: 0, rows: direct, ownFindings: 0, proofsWorse: false };
		expect(impactStaysLocal(local)).toBe(true);
		expect(impactStaysLocal({ ...local, rows: [] })).toBe(true);
		expect(impactStaysLocal({ ...local, misfits: 1 })).toBe(false);
		expect(impactStaysLocal({ ...local, rows: [...direct, { depth: 2 }] })).toBe(false);
		expect(impactStaysLocal({ ...local, ownFindings: 1 })).toBe(false);
		expect(impactStaysLocal({ ...local, proofsWorse: true })).toBe(false);
	});
});

describe('the findings, by axis and severity', () => {
	it('counts every axis, puts an accepted risk with the major ones and what was already there apart', () => {
		const grid = coherenceGrid([
			{ axis: 'functional', severity: 'blocking' },
			{ axis: 'functional', severity: 'blocking', risk: { by: 'ana' } },
			{ axis: 'semantic', severity: 'minor' },
			{ axis: 'access_and_data', severity: 'major', scope: 'inherited' }
		]);
		expect(grid).toHaveLength(5);
		const by = Object.fromEntries(grid.map((r) => [r.axis, [r.blocking, r.major, r.minor, r.before]]));
		expect(by).toEqual({
			semantic: [0, 0, 1, 0],
			functional: [1, 1, 0, 0],
			structural: [0, 0, 0, 0],
			behavioural: [0, 0, 0, 0],
			access_and_data: [0, 0, 0, 1]
		});
	});
});

describe('the report, as a person reads it [criterion:ac-leaf-ac-evo-impl-layout]', () => {
	const line = (id: string, verdict: string, decision: string, scope = 'request') => ({ id, verdict, decision, scope });
	const read = reportReading([
		line('proved', 'conform', 'undecided'),
		line('to-decide', 'non_conform', 'undecided'),
		line('validated', 'non_conform', 'validated'),
		line('to-build', 'missing', 'undecided'),
		line('sent-back', 'conform', 'invalidated'),
		line('older', 'non_conform', 'undecided', 'inherited')
	]);
	const ids = (lines: readonly { id: string }[]) => lines.map((l) => l.id);

	it('lists open only what waits on a person now, a line sent back among them', () => {
		expect(ids(read.waiting)).toEqual(['to-decide', 'to-build', 'sent-back']);
	});

	it('folds what the code proves and what a person already decided together', () => {
		expect(ids(read.settled)).toEqual(['proved', 'validated']);
	});

	it('keeps what the features held before the request apart, never among the request\'s', () => {
		expect(ids(read.before)).toEqual(['older']);
	});
});

describe('the board: who waits, and for how long', () => {
	const card = (over: Partial<BoardCardLike>): BoardCardLike => ({
		status: 'open',
		stage: 'specification',
		step: 'need',
		pendingProposals: 0,
		blockingFindings: 0,
		undecidedLines: 0,
		linesToBuild: 0,
		acceptanceDebt: 0,
		...over
	});

	it('says a request waits on the code when its report lines are only left to build', () => {
		expect(waitsOn(card({ stage: 'implementation', step: 'build', undecidedLines: 1, linesToBuild: 1 }))).toBe('code');
		expect(waitsOn(card({ stage: 'implementation', step: 'build', undecidedLines: 2, linesToBuild: 1 }))).toBe('person');
		expect(waitsOn(card({ pendingProposals: 1 }))).toBe('person');
		expect(waitsOn(card({ stage: 'coherence', step: 'impact_analysis' }))).toBe('person');
		expect(waitsOn(card({ step: 'technical_spec' }))).toBe('author');
		expect(waitsOn(card({ stage: 'acceptance', step: 'approval' }))).toBe('person');
		expect(waitsOn(card({ step: 'solution' }))).toBe('author');
	});

	it('counts the open requests by how long they stood at their step', () => {
		const now = new Date('2026-10-31T12:00:00.000Z');
		const ages = stepAges(
			[
				card({ stepSince: '2026-10-31T08:00:00.000Z' }),
				card({ stepSince: '2026-10-28T08:00:00.000Z' }),
				card({ stepSince: '2026-10-10T08:00:00.000Z' }),
				card({ stepSince: '2026-08-01T08:00:00.000Z' }),
				card({ status: 'closed', stepSince: '2026-08-01T08:00:00.000Z' })
			],
			now
		);
		expect(ages.map((a) => a.count)).toEqual([1, 1, 1, 1]);
	});

	it('takes the last move of a step: a crossing, a freeze or a validation', () => {
		expect(
			stepSinceOf({
				createdAt: '2026-10-01T00:00:00.000Z',
				history: [
					{ type: 'stage_crossing', recordedAt: '2026-10-03T00:00:00.000Z' },
					{ type: 'draft_change', recordedAt: '2026-10-09T00:00:00.000Z' }
				],
				stepValidations: [{ validations: [{ at: '2026-10-05T00:00:00.000Z' }] }]
			})
		).toBe('2026-10-05T00:00:00.000Z');
	});
});

/** A request at its start: nothing computed, nothing read yet. */
const NOTHING_YET = {
	need: need({}),
	impactRan: false,
	rows: [],
	graph: null,
	docking: { collision: 0, friction: 0, missing_anchor: 0, fits: 0 },
	points: [],
	findings: []
};

describe('what the change was for', () => {
	it('reads objectives and measures one per line, and says when no measure was given', () => {
		const purpose = purposeOf(need({ objectives: '- Ten products at most\nCall the shop beyond', measures: '' }));
		expect(purpose.objectives).toEqual(['Ten products at most', 'Call the shop beyond']);
		expect(purpose.measures).toEqual([]);
		const reading = decisionReading({ ...NOTHING_YET, need: need({ situation: 'A 40-croissant order arrived unannounced.', objectives: 'Ten products at most' }) });
		const value = reading.answers.find((a) => a.key === 'value')!;
		expect(value).toMatchObject({ tone: 'decide', answer: 'No measure of success' });
		expect(value.details.find((g) => g.title === 'How we will know')!.items[0].label).toContain('No measure');
	});
});

describe('a measure, in three parts', () => {
	it('reads what, today and target from "what: today -> target", and leaves any other line as written', () => {
		expect(parseMeasure('Appels pour préciser une commande en ligne : 6 par samedi -> 1 par samedi au plus')).toEqual({
			what: 'Appels pour préciser une commande en ligne',
			today: '6 par samedi',
			target: '1 par samedi au plus'
		});
		expect(parseMeasure('Spec writing time: 15 h a week → 3 h a week.')).toEqual({ what: 'Spec writing time', today: '15 h a week', target: '3 h a week' });
		expect(parseMeasure('Fewer phone calls on Saturdays')).toBeNull();
		const reading = decisionReading({ ...NOTHING_YET, need: need({ measures: 'Calls: 6 -> 1\nFewer complaints' }) });
		const known = reading.answers[0].details.find((g) => g.title === 'How we will know')!;
		expect(known.measures).toEqual([{ what: 'Calls', today: '6', target: '1' }]);
		expect(known.items[0]).toEqual({ label: 'Fewer complaints' });
	});
});

describe('how big, as a rank', () => {
	it('weighs what is created, changed and removed, then the data and code it moves, and explains the points', () => {
		const small = sizeRank(
			[
				{ kind: 'feature', label: 'Order online', status: 'changed' },
				{ kind: 'rule', label: 'At most 140 characters', status: 'added' },
				{ kind: 'action', label: 'Add a note', status: 'added' }
			],
			[{ section: 'screens_and_journeys', depth: 1, label: 'Cart' }]
		);
		expect(small).toMatchObject({ rank: 'Medium', points: 6, created: 2, changed: 0, removed: 0 });
		expect(small.reasons).toEqual(['1 rule created (1)', '1 action created (3)', '1 in screens and journeys (2)']);
		expect(sizeRank([{ kind: 'rule', label: 'r', status: 'changed' }], [])).toMatchObject({ rank: 'Small', points: 1 });

		const large = sizeRank(
			[
				{ kind: 'feature', label: 'Phone line', status: 'added' },
				{ kind: 'surface', label: 'Calls', status: 'added' },
				{ kind: 'surface', label: 'Cart', status: 'removed' },
				{ kind: 'action', label: 'Call back', status: 'changed' }
			],
			[
				{ section: 'entities_and_fields', depth: 1, label: 'Order.note' },
				{ section: 'code', depth: 1, label: 'src/cart.js' },
				{ section: 'rules_and_scenarios', depth: 2, label: 'r' }
			]
		);
		// 8 feature + 4 + 4 screens + 1.5 action changed + 3 data + 1 code + 0.5 reached
		expect(large).toMatchObject({ rank: 'Large', points: 22 });
	});
});

describe('the decision card', () => {
	it('answers worth it, how big and how risky, and names what is missing to decide', () => {
		const early = decisionReading({ ...NOTHING_YET, need: need({ situation: 'Carts have no limit.', objectives: 'Ten at most' }) });
		expect(early.answers.map((a) => a.question)).toEqual(['Worth it?', 'How big?', 'Risky?']);
		expect(early.missing.map((m) => [m.key, m.step])).toEqual([
			['cost', 'need'],
			['measure', 'need'],
			['impact', 'impact_analysis']
		]);
		// The impact is the platform's to read: named apart, never counted among a person's answers.
		expect(early.headline).toBe('Not enough to decide yet: 2 answers missing.');
		expect(early.answers[0]).toMatchObject({ answer: 'No measure of success', detail: 'Not said yet: what it costs today.' });
		// Nothing moved and no impact read: no rank read on nothing.
		expect(early.answers[1]).toMatchObject({ answer: 'Not known yet', detail: 'Read at the Impact analysis.', tone: 'todo' });
		expect(early.answers[2]).toMatchObject({ answer: 'Not known yet', tone: 'todo' });

		const ready = decisionReading({
			need: need({ situation: 'Carts have no limit.', objectives: 'Ten at most', cost: '3 phone calls a week', measures: 'Orders above 10: 0 a week' }),
			impactRan: true,
			rows: [{ nodeId: 'surface:a', label: 'Cart', section: 'screens_and_journeys', verb: 'rework', depth: 1, note: '' }],
			graph: [{ kind: 'rule', label: 'Ten at most', status: 'added' }],
			docking: { collision: 0, friction: 0, missing_anchor: 0, fits: 2 },
			points: [{ label: 'Cart', qualification: 'fits', reason: 'Part of Order online.' }],
			findings: []
		});
		expect(ready.missing).toEqual([]);
		// Answered but validated by nobody: still a person's to decide, never green.
		expect(ready.answers[0]).toMatchObject({ answer: '1 measurable target', detail: 'Costs today: 3 phone calls a week', tone: 'decide' });
		expect(ready.answers[1]).toMatchObject({ answer: 'Small change', detail: '1 created · 0 changed · 0 removed' });
		expect(ready.answers[1].details.map((g) => g.title)).toEqual(['Created', 'Why small']);
		expect(ready.answers[2]).toMatchObject({ answer: 'Fits', tone: 'ok' });
		expect(ready.answers[2].details[0].items[0]).toMatchObject({ label: 'Fits · Cart', note: 'Part of Order online.' });
	});

	it('ranks a request already made official from the operations its drafts carried, its graph being all grey', () => {
		const changes = draftChangeNodes([
			{
				kind: 'amend',
				baseLeafId: 'feat-order',
				behaviourModel: {
					operations: [],
					landed: { operations: [{ kind: 'add_action', name: 'Add a note' }, { kind: 'add_action_rule', text: 'At most 140 characters' }, { kind: 'update_surface', id: 'cart' }] }
				}
			}
		]);
		expect(changes).toEqual([
			{ kind: 'action', label: 'Add a note', status: 'added' },
			{ kind: 'rule', label: 'At most 140 characters', status: 'added' },
			{ kind: 'surface', label: 'surface cart', status: 'changed', id: 'cart' }
		]);
		const reading = decisionReading({ ...NOTHING_YET, impactRan: true, graph: [{ kind: 'feature', label: 'Order', status: 'existing' }], changes });
		expect(reading.answers[1]).toMatchObject({ answer: 'Medium change', detail: '2 created · 1 changed · 0 removed' });
	});

	it('names the impact apart while a person owes nothing, and ranks what already moves before it is read', () => {
		const answered = need({ situation: 's', objectives: 'o', cost: 'c', measures: 'm' }).map((f) => ({ ...f, validated: true }));
		const waiting = decisionReading({ ...NOTHING_YET, need: answered, graph: [] });
		expect(waiting).toMatchObject({ tone: 'todo', headline: 'Everything a person owes is answered; the impact is read at the Impact analysis.' });
		expect(waiting.missing.map((m) => m.key)).toEqual(['impact']);
		const moving = decisionReading({ ...NOTHING_YET, need: answered, graph: [{ kind: 'rule', label: 'Ten at most', status: 'added' }] });
		expect(moving.answers[1]).toMatchObject({
			answer: 'Small change',
			detail: '1 created · 0 changed · 0 removed; the data and code it moves are read at the Impact analysis'
		});
	});

	it('says on Worth it which answers are not validated yet, and holds the headline until they are', () => {
		const answered = need({ situation: 's', objectives: 'o', cost: 'c', measures: 'm' });
		const base = { ...NOTHING_YET, impactRan: true, graph: [] };
		const pending = decisionReading({ ...base, need: answered.map((f) => ({ ...f, validated: f.path.endsWith('.situation') })) });
		expect(pending.answers[0].validation).toEqual({ validated: false, text: 'Not validated: cost, objectives, measures' });
		expect(pending.headline).toBe('Everything is answered; the why is not validated yet.');
		const validated = decisionReading({ ...base, need: answered.map((f) => ({ ...f, validated: true })) });
		expect(validated.answers[0].validation).toEqual({ validated: true, text: 'Validated' });
		expect(validated.headline).toBe('Everything needed to decide is here.');

		const colliding = decisionReading({ ...base, need: answered, docking: { collision: 1, friction: 0, missing_anchor: 0, fits: 0 } });
		expect(colliding).toMatchObject({ tone: 'blocks', headline: 'Not ready to decide: it collides with the product.' });
	});
});

describe('who moved the request', () => {
	it('gives an act the platform carried on its own back to the assistant that triggered it', () => {
		const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'ai_client' };
		const request = createEvolutionRequest({ id: 'r1', title: 't', origin: 'internal_idea', stage: 'specification' });
		const outcome = updateNeedAct({ actor: person, at: '2026-10-07T10:00:00.000Z', newId: () => 'h1', soloWorkspace: true }, request, {
			situation: 's'
		});
		if (!outcome.ok) throw new Error(outcome.reason);
		const from = request.history.length;
		const attributed = attributeTo(outcome.request, from, 'ai_client');
		expect(attributed.history.slice(from).every((h) => h.authorKind === 'ai_client')).toBe(true);
		expect(attributed.history.slice(0, from)).toEqual(outcome.request.history.slice(0, from));
	});
});
