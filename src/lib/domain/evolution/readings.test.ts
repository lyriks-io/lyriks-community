import { describe, expect, it } from 'vitest';
import {
	CONDITIONAL_BLOCKS,
	SPEC_BLOCKS,
	capabilityReadings,
	createEvolutionRequest,
	edgeCaseSentence,
	fieldKey,
	filledKeysOfReadings,
	readMaturity,
	type ReadingInputs
} from './index';

/**
 * The blocks edited in a capability of their own are readings: the dossier
 * says what the touched features hold and what the impact report found, and
 * nothing is ticked by hand.
 */

const inputs = (over: Partial<ReadingInputs> = {}): ReadingInputs => ({
	behaviourByLeaf: {
		'feat-a': {
			surfaces: 2,
			actions: 5,
			rules: 7,
			invariants: 2,
			entities: ['ImportJob', 'ImportRow'],
			surfaceNames: [
				{ name: 'Import screen', actions: ['Drop a file', 'Map the columns', 'Confirm'] },
				{ name: 'Report', actions: ['Download', 'Retry'] }
			],
			guardReasons: ['Refused above 5 MB'],
			invariantNames: ['A row in error never cancels the valid rows'],
			updatedAt: '2026-09-03T10:00:00Z',
			maturity: { percentage: 94, criticalCount: 0 },
			coverage: { found: 3, expected: 5, percent: 60 }
		}
	},
	grants: [
		{ roleId: 'admin', capabilityId: 'feat-a', action: 'update' },
		{ roleId: 'admin', capabilityId: 'feat-a', action: 'read' },
		{ roleId: 'designer', capabilityId: 'feat-a', action: 'read' }
	],
	roles: [
		{ id: 'admin', name: 'Admin' },
		{ id: 'designer', name: 'Designer' },
		{ id: 'viewer', name: 'Viewer' }
	],
	dataEntities: ['ImportJob'],
	dependsOnByLeaf: { 'feat-a': ['feat-billing'] },
	held: {
		'architecture.constraints': { summary: '3 constraints', names: ['Air gap'] },
		'foundation.definition.security': { summary: '5 security areas', names: ['authentication'] },
		'glossary.terms': { summary: '12 terms', names: ['import job'] }
	},
	edgeCasesByLeaf: {},
	...over
});
const CONDITIONAL = [...SPEC_BLOCKS, ...CONDITIONAL_BLOCKS];
const request = (over = {}) =>
	createEvolutionRequest({ leafIds: ['feat-a'], createdAt: '2026-09-01T00:00:00Z', ...over });
const reading = (all: ReturnType<typeof capabilityReadings>, path: string, leafId: string | null = null) =>
	all.find((r) => r.key === fieldKey(path, leafId));

describe('the readings of a request', () => {
	it('reads the behaviour model of each touched feature, and counts it filled from what is there', () => {
		const all = capabilityReadings(request(), inputs());
		const surfaces = reading(all, '06-behavioural.surfaces', 'feat-a');
		expect(surfaces?.summary).toBe(
			'2 surfaces, 5 actions · model 94% · edited since this request opened · code: 3 of 5 located'
		);
		// Names, not counts: what the model says is what a reviewer reads.
		expect(surfaces?.names).toEqual([
			'Import screen: Drop a file, Map the columns, Confirm',
			'Report: Download, Retry'
		]);
		expect(reading(all, '06-behavioural.rules', 'feat-a')?.names).toEqual(['Refused above 5 MB']);
		expect(reading(all, '06-behavioural.invariants', 'feat-a')?.names).toEqual([
			'A row in error never cancels the valid rows'
		]);
		const bare = capabilityReadings(request(), inputs({ behaviourByLeaf: { 'feat-a': null } }));
		expect(reading(bare, '06-behavioural.invariants', 'feat-a')?.filled).toBe(false);
		expect(reading(bare, '06-behavioural.invariants', 'feat-a')?.summary).toContain('no behaviour model');
		// A model with no invariant is a reading too: complete, and it says so.
		const thin = capabilityReadings(
			request(),
			inputs({
				behaviourByLeaf: {
					'feat-a': {
						surfaces: 1,
						actions: 2,
						rules: 0,
						invariants: 0,
						entities: [],
						surfaceNames: [],
						guardReasons: [],
						invariantNames: [],
						updatedAt: null,
						maturity: null,
						coverage: null
					}
				}
			})
		);
		expect(reading(thin, '06-behavioural.invariants', 'feat-a')?.filled).toBe(true);
		expect(reading(thin, '06-behavioural.invariants', 'feat-a')?.summary).toContain('no invariant in the model');
	});

	it('reads who may do what on the touched features, by role and verb', () => {
		const all = capabilityReadings(request(), inputs());
		const grants = reading(all, '04-permissions.grants');
		expect(grants?.filled).toBe(true);
		expect(grants?.names).toEqual(['Admin: update, read', 'Designer: read']);
		const roles = reading(all, '03-personas.roles');
		expect(roles?.names).toEqual(['Admin', 'Designer']);
		// Not read yet: no grant and no impact report is the one unread state.
		const none = capabilityReadings(request(), inputs({ grants: [] }));
		expect(reading(none, '04-permissions.grants')?.filled).toBe(false);
		expect(reading(none, '04-permissions.grants')?.summary).toContain('run the impact report');
		// Once the impact report ran, "no grant today, nothing moves" is an answer: a reading never blocks.
		const ran = capabilityReadings(
			request({ impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 'now' } }),
			inputs({ grants: [] })
		);
		expect(reading(ran, '04-permissions.grants')?.filled).toBe(true);
		expect(reading(ran, '04-permissions.grants')?.summary).toContain('nothing moves');
		expect(reading(ran, '03-personas.roles')?.filled).toBe(true);
	});

	it('says what to do when the change has not named what it touches', () => {
		const all = capabilityReadings(request({ leafIds: [] }), inputs());
		expect(reading(all, '04-permissions.grants')?.filled).toBe(false);
		expect(reading(all, '04-permissions.grants')?.summary).toContain('name what this change touches');
		expect(all.some((r) => r.fieldPath.startsWith('06-behavioural.'))).toBe(false);
	});

	it('reads the entities the touched features declare against the data model', () => {
		const all = capabilityReadings(request(), inputs());
		const entities = reading(all, '07-data.entities');
		expect(entities?.filled).toBe(true);
		expect(entities?.summary).toBe('2 entities declared by the touched features, 1 in the data model');
		expect(entities?.names).toEqual(['ImportJob', 'ImportRow']);
	});

	it('reads the declared dependencies, and is answered once the impact report ran', () => {
		const all = capabilityReadings(request(), inputs());
		expect(reading(all, '08-graph.dependencies', 'feat-a')?.names).toEqual(['feat-billing']);
		const none = capabilityReadings(request(), inputs({ dependsOnByLeaf: {} }));
		expect(reading(none, '08-graph.dependencies', 'feat-a')?.filled).toBe(false);
		const ran = capabilityReadings(
			request({ impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 'now' } }),
			inputs({ dependsOnByLeaf: {} })
		);
		expect(reading(ran, '08-graph.dependencies', 'feat-a')?.filled).toBe(true);
	});

	it('reads the product-wide sections: what they hold, and what the impact report moves there', () => {
		const all = capabilityReadings(request(), inputs());
		expect(reading(all, '09-technical.constraints')?.filled).toBe(true);
		expect(reading(all, '09-technical.constraints')?.summary).toBe('holds 3 constraints today');
		// Glossary is covered by the impact report: answered once it ran.
		expect(reading(all, '10-security.terms')?.filled).toBe(false);
		const ran = capabilityReadings(
			request({
				impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 'now' },
				impactFindings: [
					{
						id: 'i1',
						hypothesis: 'add',
						section: 'glossary_terms',
						nodeId: 't1',
						nodeLabel: 'import job',
						nodeKind: 'term',
						groupPath: [],
						note: '',
						codeWork: null,
						depth: 1,
						severity: 'low',
						migrationImplied: null,
						ruleWork: null
					}
				]
			}),
			inputs()
		);
		const terms = reading(ran, '10-security.terms');
		expect(terms?.filled).toBe(true);
		expect(terms?.summary).toContain('1 node moving here');
		// What moves is carried once, with its reason, not repeated as a name.
		expect(terms?.moving.map((m) => m.label)).toEqual(['import job']);
		expect(terms?.names).toEqual(['import job']);
	});

	it('reads the edge cases of the touched features as sentences a person understands', () => {
		const edge = {
			title: 'Oversized file',
			given: 'a file over 5 MB',
			when: 'it is dropped on the import screen',
			then: 'the import is refused before upload, with the size named',
			expectedOutcome: 'blocked'
		};
		expect(edgeCaseSentence(edge)).toBe(
			'Given a file over 5 MB, when it is dropped on the import screen, then the import is refused before upload, with the size named (expected: blocked)'
		);
		const all = capabilityReadings(
			request(),
			inputs({ edgeCasesByLeaf: { 'feat-a': [edge] } }),
			CONDITIONAL
		);
		const edges = reading(all, '12-edge-cases.scenarios');
		expect(edges?.filled).toBe(true);
		expect(edges?.summary).toContain('1 edge case written');
		expect(edges?.names[0]).toContain('Given a file over 5 MB');
	});

	it('says what to do with a rule that moves, and why, in full', () => {
		const ran = capabilityReadings(
			request({
				impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: 'now' },
				impactFindings: [
					{
						id: 'i2',
						hypothesis: 'change',
						section: 'rules_and_scenarios',
						nodeId: 'r1',
						nodeLabel: 'No raw hex in components',
						nodeKind: 'rule',
						groupPath: [],
						note: 'The dark palette introduces tokens the rule text names as light-only values.',
						codeWork: null,
						depth: 1,
						severity: 'medium',
						migrationImplied: null,
						ruleWork: 'rewrite'
					}
				]
			}),
			inputs(),
			CONDITIONAL
		);
		const edges = reading(ran, '12-edge-cases.scenarios');
		expect(edges?.moving[0].work).toContain('rewrite');
		expect(edges?.moving[0].note).toContain('dark palette');
	});

	it('feeds the maturity with what was read, never with a mark, and never blocks', () => {
		const all = capabilityReadings(request(), inputs());
		const filled = new Set(filledKeysOfReadings(all));
		expect(filled.has(fieldKey('06-behavioural.invariants', 'feat-a'))).toBe(true);
		// A touched feature with no behaviour model lowers the maturity, and blocks nothing.
		const unmodelled = new Set(
			filledKeysOfReadings(capabilityReadings(request(), inputs({ behaviourByLeaf: { 'feat-a': null } })))
		);
		const withModel = readMaturity(filled, [], ['feat-a']);
		const without = readMaturity(unmodelled, [], ['feat-a']);
		expect(without.score).toBeLessThan(withModel.score);
		expect(without.criticalEmptyFields).not.toContain('06-behavioural.invariants');
	});
});
