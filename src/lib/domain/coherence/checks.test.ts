import { describe, expect, it } from 'vitest';
import { CHECKS, LOCAL_CHECK_IDS, checkById, tallyChecks } from './checks';

describe('the check catalogue', () => {
	it('has unique ids and a reader-facing label on every entry', () => {
		expect(new Set(CHECKS.map((c) => c.id)).size).toBe(CHECKS.length);
		for (const c of CHECKS) expect(c.label.length).toBeGreaterThan(10);
	});

	it('counts a check as failing when a gap names it, and never counts what did not run', () => {
		const ran = ['users.feature-reachable', 'glossary.defined'];
		expect(tallyChecks(ran, [{ checkId: 'users.feature-reachable' }, { checkId: 'formal.type-compat' }])).toEqual({
			run: 2,
			passing: 1,
			failing: 1
		});
		expect(tallyChecks([], [{ checkId: 'users.feature-reachable' }])).toEqual({ run: 0, passing: 0, failing: 0 });
	});

	it('runs every coverage and declared check locally, and none of the engine ones', () => {
		for (const id of LOCAL_CHECK_IDS) expect(['coverage', 'declared']).toContain(checkById(id)?.layer);
		expect(LOCAL_CHECK_IDS).not.toContain('formal.type-compat');
	});
});
