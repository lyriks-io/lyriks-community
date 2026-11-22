import { describe, expect, it } from 'vitest';
import {
	draftChangeNodes,
	impactRows,
	parseMeasure,
	reportReading,
	stepSinceOf,
	type ImpactFindingLike
} from './decision-figures';
import { attributeTo } from './history';
import { updateNeedAct } from './acts';
import { createEvolutionRequest, type Actor } from './draft';

/**
 * The figures a person decides on: counts, never scores. What these tests pin
 * is the specification of ac-evo-impl-layout, ac-evo-need-measure-shape and
 * ac-evo-hist-auto-crossing-author.
 */

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

describe('when a request last moved', () => {
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

describe('a measure, in three parts', () => {
	it('reads what, today and target from "what: today -> target", and leaves any other line as written', () => {
		expect(parseMeasure('Appels pour préciser une commande en ligne : 6 par samedi -> 1 par samedi au plus')).toEqual({
			what: 'Appels pour préciser une commande en ligne',
			today: '6 par samedi',
			target: '1 par samedi au plus'
		});
		expect(parseMeasure('Spec writing time: 15 h a week → 3 h a week.')).toEqual({ what: 'Spec writing time', today: '15 h a week', target: '3 h a week' });
		expect(parseMeasure('Fewer phone calls on Saturdays')).toBeNull();
	});
});

describe('what a request made official changed', () => {
	it('reads what its drafts created and changed from the operations they carried', () => {
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
