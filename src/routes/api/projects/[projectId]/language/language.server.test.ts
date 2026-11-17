import { describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const known = new Set(['p1']);
const reading = { language: 'fr', declared: true, generated: 'fr', notice: null };
const execute = vi.fn(async () => reading);

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		projectExists: async (projectId: string) => known.has(projectId),
		listProjects: {
			execute: async () => {
				throw new Error('the route asks whether one project exists, it never lists them all');
			}
		},
		loadSpecLanguage: { execute }
	})
}));
import { getServices } from '$composition/container.server';
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: async () => {} }));

const { GET } = await import('./+server');

const event = (projectId: string) => ({ locals: { services: getServices() }, params: { projectId } }) as never;

describe('GET /api/projects/[projectId]/language', () => {
	it('answers the language of a project that exists', async () => {
		const response = await GET(event('p1'));
		expect(await response.json()).toEqual(reading);
		expect(execute).toHaveBeenCalledWith('p1');
	});

	it('answers 404 for a project that does not exist', async () => {
		const answer = await Promise.resolve(GET(event('ghost'))).catch((e: unknown) => e);
		expect(isHttpError(answer) && answer.status).toBe(404);
	});
});
