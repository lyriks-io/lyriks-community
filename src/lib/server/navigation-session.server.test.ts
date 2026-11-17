import { describe, expect, it } from 'vitest';
import { navigationSessionBoundary } from './navigation-session.server';
describe('a navigation boundary is not a credential', () => {
	it('changes with the sign-in cookie and never carries the original cookie', () => {
		const first = navigationSessionBoundary({ get: () => 'fixture-session-a' });
		const second = navigationSessionBoundary({ get: () => 'fixture-session-b' });
		expect(first).toMatch(/^[a-f0-9]{64}$/); expect(first).not.toBe(second);
		expect(first).not.toContain('fixture-session-a'); expect(navigationSessionBoundary({ get: () => undefined })).toBeNull();
	});
});
