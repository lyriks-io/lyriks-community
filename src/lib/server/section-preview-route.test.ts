import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { POST } from '../../routes/api/sections/validate/+server';
import { createEmptyUsersDraft, createRole } from '$domain/users';

const mocks = vi.hoisted(() => ({ access: vi.fn(), exists: vi.fn(), derived: vi.fn(), save: vi.fn() }));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: mocks.access }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ projectExists: mocks.exists, refreshDerivedCapabilities: { execute: mocks.derived }, saveUsersDraft: { execute: mocks.save } }) }));
const event = (body: unknown) => ({ request: new Request('http://localhost/api/sections/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }) as Parameters<typeof POST>[0];

describe('section preview validation boundary', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.exists.mockResolvedValue(true);
		mocks.derived.mockResolvedValue({ features: [], journeys: [], surfaces: [{ id: 'screen:editor', source: 'surface', label: 'Editor' }] });
	});
	it('reports shape errors without saving or treating preview as write authorization', async () => {
		const request = event({ projectId: 'p', section: 'features', draft: { cores: ['not a record'] } });
		const result = await (await POST(request)).json();
		expect(result).toMatchObject({ valid: false, persisted: false });
		expect(result.issues[0].path).toBe('cores[0]');
		expect(mocks.access).toHaveBeenCalledWith(request, 'p', 'read');
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it('checks the same canonical capability ids as the real users save', async () => {
		const draft = createEmptyUsersDraft('p');
		draft.roles.push(createRole({ id: 'author', name: 'Author' }));
		draft.permissions.push({ roleId: 'author', capabilityId: 'editor', capabilitySource: 'surface' });
		const result = await (await POST(event({ projectId: 'p', section: 'users', draft }))).json();
		expect(result.valid).toBe(false);
		expect(result.issues[0].message).toContain('screen:editor');
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it('accepts valid drafts while making the validation boundary explicit', async () => {
		const result = await (await POST(event({ projectId: 'p', section: 'users', draft: createEmptyUsersDraft('p') }))).json();
		expect(result).toMatchObject({ valid: true, persisted: false, issues: [] });
		expect(result.limitations.join(' ')).toContain('not an atomic multi-section transaction');
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it.each([null, [], 'text'])('rejects a non-object draft %j', async (draft) => {
		const result = await (await POST(event({ projectId: 'p', section: 'users', draft }))).json();
		expect(result.valid).toBe(false);
		expect(mocks.derived).not.toHaveBeenCalled();
	});
	it('checks project access before reading the live registry', async () => {
		mocks.access.mockRejectedValue(new Error('forbidden'));
		await expect(POST(event({ projectId: 'p', section: 'users', draft: {} }))).rejects.toThrow('forbidden');
		expect(mocks.exists).not.toHaveBeenCalled();
		expect(mocks.derived).not.toHaveBeenCalled();
	});
	it('rejects missing projects and unknown sections', async () => {
		await expect(POST(event({ projectId: 'p', section: 'bogus', draft: {} }))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 400);
		mocks.exists.mockResolvedValue(false);
		await expect(POST(event({ projectId: 'missing', section: 'users', draft: {} }))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 404);
		expect(mocks.save).not.toHaveBeenCalled();
	});
});
