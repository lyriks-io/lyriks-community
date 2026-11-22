import { beforeEach, describe, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';
const { authorize, apply } = vi.hoisted(() => ({ authorize: vi.fn(), apply: vi.fn(async (..._args: unknown[]) => ({ revision: 2 })) }));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: authorize }));
vi.mock('$lib/server/retrospec-status.server', () => ({ retrospecActor: async () => ({ id: 'reader@company.test', name: 'Reader' }) }));
vi.mock('$lib/server/spec-validation-acts.server', () => ({ applySpecValidationActs: apply }));
const { POST } = await import('./+server');

const event = () => ({
	params: { projectId: 'p' }, cookies: {}, locals: { services: { projectExists: async () => true } },
	request: new Request('http://x/projects/p/spec/validation', { method: 'POST', body: JSON.stringify({ acts: [{ op: 'validate', itemId: 'stack:a' }] }) })
}) as never;

describe('validation request access boundary [criterion:1a489659]', () => {
	beforeEach(() => { authorize.mockReset(); apply.mockClear(); });
	it('passes a project reader into the restricted personal-review server policy', async () => {
		authorize.mockImplementation(async (_event, _project, action) => { if (action === 'write') error(403, 'forbidden'); });
		expect((await POST(event())).status).toBe(200);
		expect(apply.mock.calls[0]?.[5]).toEqual({ canWrite: false });
	});
	it.each([401, 404, 503])('preserves %s and never treats it as a read-only grant', async (status) => {
		authorize.mockImplementation(async () => error(status as 401, 'refused'));
		await expect(POST(event())).rejects.toMatchObject({ status });
		expect(apply).not.toHaveBeenCalled();
	});
});

describe('withdrawing the validation a request gave (EVO-002)', () => {
	beforeEach(() => { authorize.mockReset(); apply.mockClear(); });
	const withdrawal = () => ({
		params: { projectId: 'p' }, cookies: {}, locals: { services: { projectExists: async () => true } },
		request: new Request('http://x/projects/p/spec/validation', { method: 'POST', body: JSON.stringify({ acts: [{ op: 'withdraw_request_validation', itemId: 'stack:a' }] }) })
	}) as never;

	it('answers a project outside the caller\'s workspace as not found and withdraws nothing (rule 91b415a4)', async () => {
		authorize.mockImplementation(async () => error(404, 'Project not found'));
		await expect(POST(withdrawal())).rejects.toMatchObject({ status: 404, body: { message: 'Project not found' } });
		expect(apply).not.toHaveBeenCalled();
	});

	it('hands the act to the server policy, a reader without editing rights included', async () => {
		authorize.mockImplementation(async (_event, _project, action) => { if (action === 'write') error(403, 'forbidden'); });
		expect((await POST(withdrawal())).status).toBe(200);
		expect(apply.mock.calls[0]?.[2]).toEqual([{ op: 'withdraw_request_validation', itemId: 'stack:a' }]);
		expect(apply.mock.calls[0]?.[5]).toEqual({ canWrite: false });
	});
});
