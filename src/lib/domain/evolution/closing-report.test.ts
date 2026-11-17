import { describe, expect, it } from 'vitest';
import type { Baseline } from '../baselines';
import { createDraftLeaf, createEvolutionRequest, type ImplementationFinding } from './draft';
import { changesSummary, citedTexts, closingChanges, closingMessage, ticketKeyIn, versionStepAt } from './closing-report';
import { requirementCompliance } from './report-compliance';
import { requestsClosedBetween, withClosingBaselines } from './closing-baseline';

/**
 * What a closed request leaves behind is read off the request: its drafts,
 * their behaviour, its data changes, its report, and the baseline its close
 * captured. Nothing is counted that it does not carry.
 */

const named = (table: Record<string, string>) => (id: string) => table[id] ?? null;
const names = {
	featureName: named({ 'leaf-orders': 'Place an order' }),
	entityName: named({ 'ent-order': 'Order' }),
	fieldName: named({ 'fld-total': 'total' })
};

const request = createEvolutionRequest({
	title: 'Leave a note to the baker',
	drafts: [
		createDraftLeaf({ id: 'draft:note', kind: 'add', name: 'Note to the baker' }),
		createDraftLeaf({
			id: 'draft:orders',
			kind: 'amend',
			baseLeafId: 'leaf-orders',
			behaviourModel: {
				operations: [{ op: 'update_rule', id: 'r-12', description: 'A note is 140 characters at most' }],
				mintedIds: [],
				updatedAt: '',
				landed: {
					operations: [
						{ op: 'add_action', name: 'Write a note' },
						{ op: 'add_state', name: 'noteLength' },
						{ op: 'update_action', name: 'Write a note' }
					],
					mintedIds: []
				}
			}
		})
	],
	dataDrafts: [
		{
			id: 'data:1',
			kind: 'amend',
			entityId: 'ent-order',
			name: '',
			description: '',
			addFields: [{ id: 'f-note', name: 'note', type: 'string', required: false, list: false, relationTo: null }],
			changeFields: [{ fieldId: 'fld-total', type: 'decimal' }],
			removeFields: ['fld-gone'],
			materialisedAs: 'ent-order',
			materialisedAt: '2026-10-09T09:00:00.000Z'
		}
	]
});

describe('the changes a closed request made to the specification', () => {
	it('lists its features, the screens, actions and rules its behaviour writes once each, then its data', () => {
		expect(closingChanges(request, names)).toEqual([
			{ sign: '+', kind: 'Feature', label: 'Note to the baker', count: 1, noun: 'feature' },
			{ sign: '~', kind: 'Feature', label: 'Place an order', count: 1, noun: 'feature' },
			{ sign: '+', kind: 'Action', label: 'Write a note', count: 1, noun: 'action' },
			{ sign: '~', kind: 'Rule', label: 'A note is 140 characters at most', count: 1, noun: 'rule' },
			{ sign: '+', kind: 'Data', label: 'Order.note', count: 1, noun: 'field' },
			{ sign: '~', kind: 'Data', label: 'Order.total', count: 1, noun: 'field' },
			// A field the landing removed is no longer there to be named: the row counts it.
			{ sign: '-', kind: 'Data', label: 'Order: 1 field', count: 1, noun: 'field' }
		]);
	});

	it('says them in one line, by what they are and what was done to them', () => {
		expect(changesSummary(closingChanges(request, names))).toBe('1 feature added, 1 feature changed, 1 action added, 1 rule changed, 1 field added, 1 field changed, 1 field removed');
		expect(changesSummary([])).toBe('');
	});
});

const finding = (over: Partial<ImplementationFinding>): ImplementationFinding => ({
	id: `l-${Math.random()}`,
	iteration: 2,
	verdict: 'conform',
	requirement: '',
	filePath: '',
	lineRange: '',
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

describe('the requirements a request complies with', () => {
	it('counts the requirements of its latest report, settled ones complying, additions and inherited lines aside', () => {
		const lines = [
			finding({ verdict: 'conform' }),
			finding({ verdict: 'missing', decision: 'validated' }),
			finding({ verdict: 'non_conform', decision: 'invalidated' }),
			finding({ verdict: 'out_of_scope', decision: 'adopted' }),
			finding({ verdict: 'conform', scope: 'inherited' }),
			finding({ verdict: 'non_conform', iteration: 1 })
		];
		expect(requirementCompliance(createEvolutionRequest({ iteration: 2, implementationFindings: lines }))).toEqual({ complying: 2, total: 3, cycles: 2 });
	});
});

describe('the message for the ticket', () => {
	const base = { key: 'EVO-003', title: 'Leave a note', reportUrl: 'https://lyriks.test/projects/p/evolution?request=r' };

	it('says it closed, how it complies, the version it moved and what changed, then where the report is', () => {
		const message = closingMessage({
			...base,
			compliance: { complying: 4, total: 4, cycles: 2 },
			version: { from: 'v1.0', to: 'v1.1' },
			changes: closingChanges(request, names).slice(0, 2)
		});
		expect(message.split('\n')).toEqual([
			'✅ EVO-003 · Leave a note is closed in Lyriks.',
			'4 / 4 requirements comply with the spec after 2 cycles.',
			'Specification updated: v1.0 → v1.1 (1 feature added, 1 feature changed).',
			'Full report: https://lyriks.test/projects/p/evolution?request=r'
		]);
	});

	it('leaves out what the request holds nothing for: no report read, no version, no change', () => {
		expect(closingMessage({ ...base, compliance: { complying: 0, total: 0, cycles: 1 }, version: null, changes: [] }).split('\n')).toEqual([
			'✅ EVO-003 · Leave a note is closed in Lyriks.',
			'Full report: https://lyriks.test/projects/p/evolution?request=r'
		]);
	});
});

describe('the ticket a request came from', () => {
	it('reads a tracker key off a ticket address, a title opening on it, or an issue number', () => {
		expect(ticketKeyIn(['Leave a note', 'https://acme.atlassian.net/browse/FAC-242'])).toBe('FAC-242');
		expect(ticketKeyIn(['[TGE-612] Order from the phone'])).toBe('TGE-612');
		expect(ticketKeyIn(['https://github.com/acme/app/issues/88'])).toBe('#88');
	});

	it('never takes the request’s own key, nor a key inside a sentence, for a ticket', () => {
		expect(ticketKeyIn(['EVO-003 Leave a note'])).toBeNull();
		expect(ticketKeyIn(['Comply with ISO-27001 for exports'])).toBeNull();
	});

	it('reads only the sources the request cites', () => {
		const cited = createEvolutionRequest({ title: 'Notes', drafts: [createDraftLeaf({ sourceIds: ['s1'] })] });
		const sources = [
			{ id: 's1', title: 'Ticket', url: 'https://acme.atlassian.net/browse/FAC-9' },
			{ id: 's2', title: 'Other', url: 'https://acme.atlassian.net/browse/FAC-10' }
		];
		expect(citedTexts(cited, sources)).toEqual(['Notes', 'Ticket', 'https://acme.atlassian.net/browse/FAC-9']);
	});
});

const baseline = (id: string, createdAt: string): Baseline => ({ id, name: id, note: '', createdAt, readiness: 0, coherence: 0, featureCount: 0, content: '' });

describe('the version a close moved the Specification 360° by', () => {
	const baselines = [baseline('b-before', '2026-09-01'), baseline('b-valid', '2026-10-01'), baseline('b-evo1', '2026-10-05'), baseline('b-evo2', '2026-10-09')];

	it('reads the version at the baseline the close captured, whatever came after', () => {
		expect(versionStepAt(baselines, 'b-valid', 'b-evo1')).toEqual({ from: 'v1.0', to: 'v1.1' });
		expect(versionStepAt(baselines, 'b-valid', 'b-evo2')).toEqual({ from: 'v1.1', to: 'v1.2' });
	});

	it('has none when the spec was never validated, or the close captured no baseline after it', () => {
		expect(versionStepAt(baselines, null, 'b-evo1')).toBeNull();
		expect(versionStepAt(baselines, 'b-valid', undefined)).toBeNull();
		expect(versionStepAt(baselines, 'b-valid', 'b-before')).toBeNull();
	});
});

describe('the baseline a close captures', () => {
	it('is owed by the requests that closed since the last read, never twice', () => {
		const before = [
			{ id: 'a', status: 'open' as const },
			{ id: 'b', status: 'closed' as const },
			{ id: 'c', status: 'open' as const }
		];
		const after = [
			{ id: 'a', status: 'closed' as const },
			{ id: 'b', status: 'closed' as const },
			{ id: 'c', status: 'closed' as const, closingBaselineId: 'kept' },
			{ id: 'd', status: 'closed' as const }
		];
		expect(requestsClosedBetween(before, after)).toEqual(['a', 'd']);
		expect(withClosingBaselines(after, { a: 'b-1', c: 'b-2' })).toEqual([
			{ id: 'a', status: 'closed', closingBaselineId: 'b-1' },
			{ id: 'b', status: 'closed' },
			{ id: 'c', status: 'closed', closingBaselineId: 'kept' },
			{ id: 'd', status: 'closed' }
		]);
	});
});
