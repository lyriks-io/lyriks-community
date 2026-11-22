import { describe, expect, it } from 'vitest';
import type { IdentityAccount } from '$application/ports';
import { rememberRequestIdentity, requestIdentity } from './request-identity.server';
import { ACTOR_HEADER, callerKind } from './caller.server';

/** The account the hook verified, kept for the one request it was verified for. */
describe('the identity verified for a request', () => {
	const ada: IdentityAccount = { id: 'u-ada', email: 'ada@example.test', mustChangePassword: false };

	it('answers the same request with the same token', () => {
		const request = new Request('https://lyriks.test/api/auth/session');
		rememberRequestIdentity(request, 'jwt-ada', ada);
		expect(requestIdentity(request, 'jwt-ada')).toEqual(ada);
	});

	it('answers nothing once a handler replaced the session token', () => {
		const request = new Request('https://lyriks.test/api/auth/session');
		rememberRequestIdentity(request, 'jwt-ada', ada);
		expect(requestIdentity(request, 'jwt-someone-else')).toBeUndefined();
	});

	it('answers nothing for another request, even one carrying the same token', () => {
		rememberRequestIdentity(new Request('https://lyriks.test/a'), 'jwt-ada', ada);
		expect(requestIdentity(new Request('https://lyriks.test/a'), 'jwt-ada')).toBeUndefined();
	});
});

/** Who is on the other end of a write: a person, unless the MCP names itself. */
describe('the kind of caller', () => {
	const kind = (value?: string) => callerKind(new Request('https://lyriks.test', { headers: value === undefined ? {} : { [ACTOR_HEADER]: value } }));

	it('is the AI client only when the request names itself so', () => {
		expect(kind('ai_client')).toBe('ai_client');
	});

	it('is a person when the header is absent or says anything else', () => {
		expect(kind()).toBe('person');
		expect(kind('AI_CLIENT')).toBe('person');
		expect(kind('person')).toBe('person');
		expect(kind('')).toBe('person');
	});
});
