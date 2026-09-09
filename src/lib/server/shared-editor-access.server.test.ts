import { expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ identity: { multiUser: true }, admin: vi.fn() }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ identity: deps.identity }) }));
vi.mock('./admin.server', () => ({ isAdmin: deps.admin }));
import { canUseSharedEditor } from './shared-editor-access.server';
it('a workspace writer cannot access the installation-wide store', () => {
	const event = { locals: { authRequired: true, session: { isAuthenticated: true } } } as never;
	deps.identity.multiUser = true;
	deps.admin.mockReturnValue(false);
	expect(canUseSharedEditor(event)).toBe(false);
	deps.admin.mockReturnValue(true);
	expect(canUseSharedEditor(event)).toBe(true);
	deps.identity.multiUser = false;
	deps.admin.mockReturnValue(false);
	expect(canUseSharedEditor(event)).toBe(true);
	expect(canUseSharedEditor({ locals: { authRequired: true, session: { isAuthenticated: false } } } as never)).toBe(false);
});
