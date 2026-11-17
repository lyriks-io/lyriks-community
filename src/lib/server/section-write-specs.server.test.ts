import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { GLOSSARY_WRITE } from './section-write-specs.server';

const servicesSaving = (result: object | null) => {
	const execute = vi.fn(async () => result);
	return { services: { saveGlossaryDraft: { execute } } as unknown as AppServices, execute };
};

describe('the glossary save names the ids it gave (criterion c7afe419)', () => {
	const save = { expectedRevision: null, origin: null };

	it('stores the bare terms under their new ids and lists them in the answer', async () => {
		const { services, execute } = servicesSaving({ savedAt: 'now', revision: 3, coherenceScore: 10, coherenceIssues: [] });
		const write = GLOSSARY_WRITE.parse({ terms: [{ term: 'Bookmark' }, { id: 't2', term: 'Tag' }] }, 'p1');
		const answer = await GLOSSARY_WRITE.persist(write, services, 'p1', save);

		expect(execute).toHaveBeenCalledWith(expect.objectContaining({ terms: [expect.objectContaining({ id: 'term-bookmark' }), expect.objectContaining({ id: 't2' })] }), save);
		expect(answer).toEqual({
			savedAt: 'now',
			revision: 3,
			coherenceScore: 10,
			coherenceIssues: [],
			assignedTermIds: [{ id: 'term-bookmark', term: 'Bookmark' }]
		});
	});

	it('answers as before when every term came with its id', async () => {
		const { services } = servicesSaving({ savedAt: 'now', revision: 4 });
		const write = GLOSSARY_WRITE.parse({ terms: [{ id: 't1', term: 'Bookmark' }] }, 'p1');
		expect(await GLOSSARY_WRITE.persist(write, services, 'p1', save)).toEqual({ savedAt: 'now', revision: 4 });
	});

	it('still answers null on a stale revision, so the route answers 409', async () => {
		const { services } = servicesSaving(null);
		const write = GLOSSARY_WRITE.parse({ terms: [{ term: 'Bookmark' }] }, 'p1');
		expect(await GLOSSARY_WRITE.persist(write, services, 'p1', save)).toBeNull();
	});
});
