import { describe, expect, it } from 'vitest';
import { parseDocumentsDraft } from './parse-documents-draft';

describe('parseDocumentsDraft', () => {
	it('keeps stable unique source ids and ignores persisted UI state', () => {
		const draft = parseDocumentsDraft(
			{
				filter: 'private browser query',
				selectedId: 'source-1',
				sources: [
					{ id: 'source-1', title: 'Interview', kind: 'interview', url: '', note: '' },
					{ id: 'source-1', title: 'Duplicate', kind: 'link' },
					{ title: 'Missing identity', kind: 'research' },
					{ id: 'source-2', title: 42, kind: 'unknown' }
				]
			},
			'project-1'
		);

		expect(draft.sources).toHaveLength(2);
		expect(draft.sources[0]).toMatchObject({ id: 'source-1', title: 'Interview', kind: 'interview' });
		expect(draft.sources[1]).toMatchObject({ id: 'source-2', title: '', kind: 'link' });
		expect(draft).not.toHaveProperty('filter');
		expect(draft).not.toHaveProperty('selectedId');
	});
});
