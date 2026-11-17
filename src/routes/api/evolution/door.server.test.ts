import { beforeEach, describe, expect, it, vi } from 'vitest';
import { error, isHttpError } from '@sveltejs/kit';

const scene = vi.hoisted(() => ({ canWrite: true, asked: [] as string[], applied: [] as { actor: { role: string } }[] }));

vi.mock('$lib/server/project-access.server', () => ({
	requireProjectAccess: vi.fn(async (_event: unknown, _projectId: string, action: string) => {
		scene.asked.push(action);
		if (action === 'write' && !scene.canWrite) error(403, 'forbidden');
	})
}));
vi.mock('$lib/server/evolution-actor.server', () => ({
	currentPersonId: () => 'vera@example.test',
	resolveEvolutionActor: vi.fn(async () => ({ id: 'vera@example.test', kind: 'person', role: 'member', channel: 'page' }))
}));
vi.mock('$lib/server/evolution-operations.server', () => ({
	applyEvolutionOperations: vi.fn(async (_services: unknown, input: { actor: { role: string } }) => {
		scene.applied.push(input);
		return { ok: true, results: [], revision: 2, savedAt: '2026-11-17T00:00:00.000Z', requests: [] };
	})
}));
vi.mock('$lib/server/section-save.server', () => ({ guardSectionWrite: (_section: string, run: () => unknown) => run() }));
vi.mock('$lib/server/ai-activity.server', () => ({ signalAiActivity: vi.fn() }));

import { POST } from './+server';

type Event = Parameters<typeof POST>[0];

function post(operations: unknown[], edition: string | undefined = 'enterprise'): Event {
	return {
		locals: { services: { installEdition: () => edition, projectExists: async () => true } },
		cookies: { get: () => undefined },
		request: new Request('http://platform/api/evolution', { method: 'POST', body: JSON.stringify({ projectId: 'p1', operations }) })
	} as unknown as Event;
}

async function statusOf(event: Event): Promise<number> {
	try {
		return (await POST(event)).status;
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

const comment = { op: 'post_on_field', requestId: 'r1', fieldPath: '00-need.situation', body: 'Why?' };

describe('POST /api/evolution, the write door of a request', () => {
	beforeEach(() => {
		scene.canWrite = true;
		scene.asked = [];
		scene.applied = [];
	});

	it('lets a viewer comment on the right to read, acting as a viewer whatever its workspace role (issue 38)', async () => {
		scene.canWrite = false;
		expect(await statusOf(post([comment]))).toBe(200);
		expect(scene.asked[0]).toBe('read');
		expect(scene.applied[0].actor.role).toBe('viewer');
	});

	it('keeps the right to write for any act a viewer may not make', async () => {
		scene.canWrite = false;
		expect(await statusOf(post([comment, { op: 'update_need', requestId: 'r1', situation: 's' }]))).toBe(403);
		expect(scene.applied).toHaveLength(0);
	});

	it('leaves the role as it reads for someone who may write', async () => {
		expect(await statusOf(post([comment]))).toBe(200);
		expect(scene.applied[0].actor.role).toBe('member');
	});

	it('lets the AI answer a question of Ask my AI on Community, and refuses an act of a request there (EVO-001)', async () => {
		expect(await statusOf(post([{ op: 'answer_click', clickId: 'c1', text: 'Because.' }], 'community'))).toBe(200);
		expect(await statusOf(post([comment], 'community'))).toBe(403);
	});
});
