import { describe, expect, it } from 'vitest';
import { uncitedElements } from './extracted';

describe('every element read from the code says where it comes from (ac-src-extracted)', () => {
	it('names the elements that cite nothing the register holds', () => {
		expect(
			uncitedElements(
				[
					{ kind: 'feature', name: 'Send a message', sourceIds: ['src-code'] },
					{ kind: 'feature', name: 'Archive a thread', sourceIds: [] },
					{ kind: 'rule', name: 'One draft per thread' },
					// A citation of a row removed from the register cites nothing.
					{ kind: 'term', name: 'Thread', sourceIds: ['src-gone'] },
					{ kind: 'role', name: 'Moderator', sourceIds: ['src-gone', 'src-jira'] }
				],
				['src-code', 'src-jira']
			)
		).toEqual([
			{ kind: 'feature', name: 'Archive a thread' },
			{ kind: 'rule', name: 'One draft per thread' },
			{ kind: 'term', name: 'Thread' }
		]);
	});
});
