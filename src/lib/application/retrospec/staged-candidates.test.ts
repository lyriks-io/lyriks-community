import { describe, expect, it } from 'vitest';
import { withStagedCandidates } from './staged-candidates';

const sent = [
	{ startOffset: 0, endOffset: 40, summary: 'Bookmarks are unique per URL', kind: 'rule' },
	{ startOffset: 50, endOffset: 90, summary: 'Archive a bookmark', kind: 'action', sourceId: 'src-2' },
	{ startOffset: 95, endOffset: 120, summary: 'Out of range', kind: 'state' }
];

describe('a stage_candidates answer names the ids it staged (criterion 65c8df6d)', () => {
	it('lists each staged candidate under created, beside what was sent, in the order sent', () => {
		const result = withStagedCandidates(
			{
				ok: true,
				value: {
					ok: false,
					staged: 2,
					failed: 1,
					results: [
						{ ok: true, candidateId: 'c-1', proposedKind: 'rule' },
						{ ok: true, candidateId: 'c-2', proposedKind: 'action' },
						{ ok: false, error: 'endOffset is past the end of the source', summary: 'Out of range' }
					]
				}
			},
			sent,
			'src-1'
		);

		expect(result).toEqual({
			ok: true,
			value: expect.objectContaining({
				staged: 2,
				failed: 1,
				created: [
					{ candidateId: 'c-1', kind: 'rule', summary: 'Bookmarks are unique per URL', startOffset: 0, endOffset: 40, sourceId: 'src-1' },
					{ candidateId: 'c-2', kind: 'action', summary: 'Archive a bookmark', startOffset: 50, endOffset: 90, sourceId: 'src-2' }
				]
			})
		});
		// `created` leads the answer, so a capped answer still shows it first.
		expect(Object.keys((result as { value: object }).value)[0]).toBe('created');
	});

	it('keeps only what the engine said when its rows do not line up with what was sent', () => {
		const result = withStagedCandidates(
			{ ok: true, value: { results: [{ ok: true, candidateId: 'c-9', proposedKind: 'event' }] } },
			sent
		);
		expect(result).toEqual({
			ok: true,
			value: {
				created: [{ candidateId: 'c-9', kind: 'event', summary: null, startOffset: null, endOffset: null, sourceId: null }],
				results: [{ ok: true, candidateId: 'c-9', proposedKind: 'event' }]
			}
		});
	});

	it('passes a refusal, an unreachable engine and an answer without rows through untouched', () => {
		expect(withStagedCandidates({ ok: false, error: 'No sourceId' }, sent)).toEqual({ ok: false, error: 'No sourceId' });
		expect(withStagedCandidates(null, sent)).toBeNull();
		expect(withStagedCandidates({ ok: true, value: { staged: 0 } }, sent)).toEqual({ ok: true, value: { staged: 0 } });
	});
});
