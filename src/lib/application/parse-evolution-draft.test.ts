import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from './parse-evolution-draft';

/**
 * A stored reading comes back through this parser. A field it does not name is
 * dropped, which is how the touched feature a node was reached from vanished
 * between the walk and the screen, and every row fell back to the verb of the
 * request as a whole.
 */
describe('an impact finding read back from storage', () => {
	const stored = (extra: Record<string, unknown>) =>
		parseEvolutionDraft(
			{
				requests: [
					{
						id: 'r1',
						title: 'T',
						impactFindings: [
							{
								id: 'imp-1',
								hypothesis: 'change',
								section: 'permissions',
								nodeId: 'role:admin',
								nodeLabel: 'Admin',
								nodeKind: 'role',
								groupPath: ['Checkout'],
								note: 'Next to "Checkout": this role can use it.',
								depth: 1,
								severity: 'high',
								...extra
							}
						]
					}
				]
			},
			'p1'
		).requests[0].impactFindings[0];

	it('keeps the touched feature the walk reached it from', () => {
		expect(stored({ fromLeafId: 'feat-a' }).fromLeafId).toBe('feat-a');
	});

	it('leaves an older reading without one as it was', () => {
		expect('fromLeafId' in stored({})).toBe(false);
	});
});
