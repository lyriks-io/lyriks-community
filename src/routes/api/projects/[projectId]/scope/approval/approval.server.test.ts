import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { SCOPE_APPROVAL_AI_REFUSAL, SCOPE_APPROVAL_REFUSALS } from '$domain/scope';

const execute = vi.fn();

vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: vi.fn(async () => {}) }));
vi.mock('$lib/server/retrospec-status.server', () => ({ retrospecActor: vi.fn(async () => ({ id: 'u1', name: 'Ann Lee' })) }));

const { POST } = await import('./+server');
type Handler = Parameters<typeof POST>[0];

const approve = (body: unknown, headers: Record<string, string> = {}) =>
	({
		locals: { services: { approveScopeLeftOut: { execute } } },
		params: { projectId: 'p1' },
		cookies: { get: () => undefined },
		request: new Request('http://localhost/api/projects/p1/scope/approval', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify(body)
		})
	}) as unknown as Handler;

async function refusal(event: Handler): Promise<{ status: number; message: string }> {
	try {
		await POST(event);
	} catch (thrown) {
		if (isHttpError(thrown)) return { status: thrown.status, message: String(thrown.body.message) };
		throw thrown;
	}
	return { status: 200, message: '' };
}

beforeEach(() => execute.mockReset());

describe('A person approves what the spec leaves out, as it stands [criterion:d16b352d]', () => {
	it('approves as the person of the session, whatever the body names', async () => {
		execute.mockResolvedValue({ ok: true, approval: { by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z', leftOut: 'fnv1a-1' } });
		const response = await POST(approve({ shown: 'fnv1a-1', by: 'Someone else' }));
		expect(execute).toHaveBeenCalledWith('p1', 'fnv1a-1', 'Ann Lee');
		expect(await response.json()).toEqual({ approval: { by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z' } });
	});

	it('refuses an AI client with 403 and never reaches the scope', async () => {
		expect(await refusal(approve({ shown: 'fnv1a-1' }, { 'x-lyriks-actor': 'ai_client' }))).toEqual({ status: 403, message: SCOPE_APPROVAL_AI_REFUSAL });
		expect(execute).not.toHaveBeenCalled();
	});

	it('refuses with 409 a list that changed since the drawer showed it', async () => {
		execute.mockResolvedValue({ ok: false, refusal: 'changed' });
		expect(await refusal(approve({ shown: 'fnv1a-0' }))).toEqual({ status: 409, message: SCOPE_APPROVAL_REFUSALS.changed });
	});
});
