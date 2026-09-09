import { describe, expect, it } from 'vitest';
import { runWithRequestContext } from '$lib/server/request-context.server';
import { RequestContextSessionAdapter } from './request-context-session.server';

const ctx = (session: { isAuthenticated: boolean; email?: string }) => ({
	token: null,
	workspaceId: null,
	session
});

describe('RequestContextSessionAdapter', () => {
	it('answers with the caller pinned by the edge', () => {
		const adapter = new RequestContextSessionAdapter();
		const seen = runWithRequestContext(
			ctx({ isAuthenticated: true, email: 'o.gartani@example.test' }),
			() => adapter.current()
		);
		expect(seen).toEqual({ isAuthenticated: true, email: 'o.gartani@example.test' });
	});

	it('does not leak one request identity into another', () => {
		const adapter = new RequestContextSessionAdapter();
		runWithRequestContext(ctx({ isAuthenticated: true, email: 'first@example.test' }), () =>
			adapter.current()
		);
		const second = runWithRequestContext(
			ctx({ isAuthenticated: true, email: 'second@example.test' }),
			() => adapter.current()
		);
		expect(second.email).toBe('second@example.test');
	});

	it('falls back to the local session outside a request', () => {
		expect(new RequestContextSessionAdapter().current()).toEqual({ isAuthenticated: true });
	});
});
