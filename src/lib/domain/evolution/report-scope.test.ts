import { describe, expect, it } from 'vitest';
import { createEvolutionRequest } from './draft';
import { baselineKeysOf, deriveImplementationReport, withDerivedReport } from './report-derivation';
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
