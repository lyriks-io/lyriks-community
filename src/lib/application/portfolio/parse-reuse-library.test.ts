import { describe, expect, it } from 'vitest';
import { createEmptyReuseLibrary } from '$domain/reuse';
import { parseReuseLibrary } from './parse-reuse-library';

describe('the shared reuse library read back', () => {
	it('keeps each template with an id, its criteria with an id, and text fields as text', () => {
		const library = parseReuseLibrary({
			templates: [
				{ id: 't1', title: 'Refunds', problem: 4, acceptanceCriteria: [{ id: 'a1', text: 'Within 14 days' }, { text: 'no id' }, null], createdAt: '2026-11-01' },
				{ title: 'No id' },
				null
			]
		});
		expect(library.templates).toEqual([
			{ id: 't1', title: 'Refunds', description: '', problem: '', value: '', acceptanceCriteria: [{ id: 'a1', text: 'Within 14 days' }], sourceProjectName: '', createdAt: '2026-11-01' }
		]);
	});

	it('reads anything but an object as the empty library', () => {
		for (const input of [null, undefined, 'templates']) expect(parseReuseLibrary(input)).toEqual(createEmptyReuseLibrary());
		expect(parseReuseLibrary({ templates: 'all' }).templates).toEqual([]);
	});
});
