import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';
import { CheckProjectCreationUseCase } from '$application/portfolio/project-creation-scope';
import { CreateProjectUseCase } from '$application/portfolio/create-project';
import type { ProjectSummary } from '$domain/catalog';
import { POST } from './+server';

type Event = Parameters<typeof POST>[0];

const clock: ClockPort = { nowIso: () => '2026-11-20T00:00:00.000Z' };
const portfolio = { listDomains: async () => [], saveDomain: async () => {}, setMeta: async () => {} } as unknown as PortfolioRepositoryPort;
const held = (id: string): ProjectSummary => ({ id, name: id, description: '', industry: '', lastSavedAt: null });

/** A standalone installation of that edition holding these projects, with the real creation behind POST /api/projects. */
function installation(edition: string, projects: ProjectSummary[]) {
	const saved: unknown[] = [];
	const drafts = { save: async (d: unknown) => void saved.push(d) } as unknown as FoundationIdentityRepositoryPort;
	const scope = new CheckProjectCreationUseCase(() => edition, () => (edition === 'community' ? 1 : null), { list: async () => projects });
	const createProject = new CreateProjectUseCase(drafts, clock, portfolio, undefined, () => 'abc123', undefined, scope);
	const services = { createProject, audit: { record: () => {} } };
	const event = (name: string): Event =>
		({
			locals: { services, authRequired: false, session: null },
			cookies: { get: () => undefined },
			request: new Request('http://platform/api/projects', { method: 'POST', body: JSON.stringify({ name }) })
		}) as unknown as Event;
	return { event, saved };
}

/** What the route answers, as SvelteKit sends it: the JSON body of a refusal, or the created project. */
async function answer(event: Event): Promise<{ status: number; body: unknown }> {
	try {
		const res = await POST(event);
		return { status: res.status, body: await res.json() };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, body: e.body };
		throw e;
	}
}

describe('POST /api/projects on a Community installation (EVO-006, feat 42)', () => {
	it('refuses a second project from the project list or an AI client with the offer, the plans and the plan [criterion:ac-leaf-343d6e7d-aac1-4ec5-8a47-75da99d08d33]', async () => {
		const { event, saved } = installation('community', [held('todomatic')]);
		expect(await answer(event('Test'))).toEqual({
			status: 403,
			body: {
				message: 'More active projects are available from the Solo Builder plan. Upgrade to keep building.',
				detail: 'See https://lyriks.io/pricing.',
				plan: 'solo_builder'
			}
		});
		expect(saved).toEqual([]);
	});

	it('creates the first project of a Community installation, and any project elsewhere', async () => {
		for (const [edition, projects] of [['community', []], ['enterprise', [held('a')]]] as const) {
			const { event, saved } = installation(edition, [...projects]);
			expect(await answer(event('Test'))).toMatchObject({ status: 200, body: { projectId: 'test-abc123' } });
			expect(saved).toHaveLength(1);
		}
	});
});
