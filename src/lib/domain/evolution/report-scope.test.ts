import { describe, expect, it } from 'vitest';
import { createEvolutionRequest } from './draft';
import { baselineKeysOf, deriveImplementationReport, specElementsOf, withDerivedReport } from './report-derivation';
import { canCloseReport, inheritedUndecidedCount, undecidedCount } from './implementation';

/**
 * A report judges the change, not the feature it lands in.
 *
 * On 2026-09-24 a mouse-control request that added eight criteria to a feature
 * came back with 467 undecided lines, almost all of them the touched features'
 * existing backlog; thirteen requests sat in Verify for the same reason.
 */
const feature = (ruleIds: string[]) => ({
	actions: [
		{
			actionId: 'a1',
			actionName: 'Walk',
			expectedEntities: [
				{ entityType: 'action', entityId: 'a1', entityName: 'Walk' },
				...ruleIds.map((id) => ({ entityType: 'rule', entityId: id, entityName: `Rule ${id}` }))
			],
			foundEntities: [{ entityType: 'action', entityId: 'a1', locations: [{ file: 'src/walk.ts', line: 3 }] }]
		}
	]
});

describe('a report tells the request lines from the inherited ones', () => {
	const request = { id: 'req-1', iteration: 1, specVersion: 1, leafIds: ['feat-a'] };
	const baseline = new Set(baselineKeysOf([feature(['r-old'])]));

	it('photographs every element the statuses expect', () => {
		expect([...baseline]).toEqual(['action:a1', 'rule:r-old']);
	});

	it('marks what the feature already held as inherited and the rest as the request own', () => {
		const lines = deriveImplementationReport({
			request,
			statuses: { 'feat-a': feature(['r-old', 'r-new']) },
			neighbours: {},
			leafNames: { 'feat-a': 'Controls' },
			baseline
		});
		const scopeOf = (id: string) => lines.find((l) => l.requirement.includes(id))?.scope;
		expect(scopeOf('Rule r-old')).toBe('inherited');
		expect(scopeOf('Rule r-new')).toBe('request');
		expect(lines.find((l) => l.requirement.endsWith('action "Walk"'))?.scope).toBe('inherited');
	});

	it('counts every line as the request own when no baseline was taken', () => {
		const lines = deriveImplementationReport({
			request,
			statuses: { 'feat-a': feature(['r-old']) },
			neighbours: {},
			leafNames: {}
		});
		expect(lines.every((l) => l.scope === 'request')).toBe(true);
	});

	it('lets the report close once the request lines are decided, whatever the backlog holds', () => {
		const lines = deriveImplementationReport({
			request,
			statuses: { 'feat-a': feature(['r-old', 'r-new']) },
			neighbours: {},
			leafNames: {},
			baseline
		});
		const built = withDerivedReport(
			createEvolutionRequest({ id: 'req-1', stage: 'implementation', frozen: true, specVersion: 1 }),
			lines,
			'2026-09-24T00:00:00.000Z'
		);
		expect(undecidedCount(built)).toBe(1);
		expect(inheritedUndecidedCount(built)).toBe(2);
		expect(canCloseReport(built).ok).toBe(false);

		const decided = {
			...built,
			implementationFindings: built.implementationFindings.map((l) =>
				l.scope === 'request' ? { ...l, decision: 'validated' as const, decidedBy: 'ana', decidedAt: 'x' } : l
			)
		};
		expect(undecidedCount(decided)).toBe(0);
		expect(canCloseReport(decided).ok).toBe(true);
	});
});

/**
 * On 2026-10-07 the first request frozen on a project nobody had indexed yet
 * (La Fournee demo) counted fifteen lines as its own where three were: the
 * baseline was read off the engine status, which knows rules and states only
 * once code was indexed.
 */
describe('a baseline taken before any code was indexed (ac-evo-impl-baseline)', () => {
	const snapshot = {
		surfaces: [
			{
				id: 's1',
				name: 'Basket',
				stateDefinitions: [{ id: 'st-status', path: 'order.status' }],
				invariants: [{ id: 'inv-1' }],
				rules: [{ id: 'sr-1' }],
				actions: [
					{
						id: 'a1',
						name: 'Place',
						rules: [{ id: 'r-old' }],
						invariants: [{ id: 'ai-1' }],
						transitions: [{ id: 't-1' }],
						emittedEvents: ['order.placed']
					}
				]
			}
		]
	};

	it('reads every element off the spec, with the engine keys', () => {
		expect(baselineKeysOf([null], [specElementsOf(snapshot)])).toEqual([
			'action:a1',
			'event:order.placed',
			'invariant:ai-1',
			'rule:r-old',
			'state:st-status',
			'surface:s1',
			'surface_invariant:inv-1',
			'surface_rule:sr-1',
			'transition:t-1'
		]);
	});

	it('keeps a rule the product already had out of the request lines', () => {
		const baseline = new Set(baselineKeysOf([null], [specElementsOf(snapshot)]));
		const lines = deriveImplementationReport({
			request: { id: 'req-2', iteration: 1, specVersion: 1, leafIds: ['feat-a'] },
			statuses: { 'feat-a': feature(['r-old', 'r-new']) },
			neighbours: {},
			leafNames: { 'feat-a': 'Order' },
			baseline
		});
		const scopeOf = (id: string) => lines.find((l) => l.requirement.includes(id))?.scope;
		expect(scopeOf('Rule r-old')).toBe('inherited');
		expect(scopeOf('Rule r-new')).toBe('request');
	});
});

describe('a located line nothing proves says so (ac-evo-impl-unproven)', () => {
	it('names what is missing beside the code it found', () => {
		const lines = deriveImplementationReport({
			request: { id: 'req-3', iteration: 1, specVersion: 1, leafIds: ['feat-a'] },
			statuses: { 'feat-a': feature([]) },
			neighbours: {},
			leafNames: { 'feat-a': 'Controls' }
		});
		const walk = lines.find((l) => l.requirement.endsWith('action "Walk"'));
		expect(walk?.verdict).toBe('non_conform');
		expect(walk?.codeStatement).toBe('located (no passing result proves it yet)');
	});
});

describe('a proved line says where its proof comes from (ac-evo-impl-result-source)', () => {
	it('names the index as the source of the result', () => {
		const lines = deriveImplementationReport({
			request: { id: 'req-4', iteration: 1, specVersion: 1, leafIds: ['feat-a'] },
			statuses: { 'feat-a': { criteria: [{ criterionId: 'ac-1', title: 'Walks', state: 'verified' }] } },
			neighbours: {},
			leafNames: { 'feat-a': 'Controls' }
		});
		expect(lines[0].verdict).toBe('conform');
		expect(lines[0].codeStatement).toBe('The synced index reports a passing result; the platform did not run the test itself.');
	});
});

describe('a test file named on an entry proves nothing (ac-evo-impl-scenario-proof)', () => {
	const row = (auditMeta: { testFile?: string; verifiedAt?: string }) => ({
		actions: [
			{
				actionId: 'a1',
				actionName: 'Walk',
				expectedEntities: [{ entityType: 'action', entityId: 'a1', entityName: 'Walk' }],
				foundEntities: [{ entityType: 'action', entityId: 'a1', locations: [{ file: 'src/walk.ts', line: 3 }] }],
				auditMeta
			}
		]
	});
	const verdict = (auditMeta: { testFile?: string; verifiedAt?: string }) =>
		deriveImplementationReport({
			request: { id: 'req-5', iteration: 1, specVersion: 1, leafIds: ['feat-a'] },
			statuses: { 'feat-a': row(auditMeta) },
			neighbours: {},
			leafNames: {}
		})[0].verdict;

	it('keeps a line with only a test file name unproven', () => {
		expect(verdict({ testFile: 'src/walk.test.ts' })).toBe('non_conform');
	});

	it('proves a line once every scenario of its action passed against the code', () => {
		expect(verdict({ verifiedAt: '2026-10-07T12:00:00.000Z' })).toBe('conform');
	});
});
