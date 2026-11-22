import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AuditEvent, OperatorProfileRepositoryPort } from '$application/ports';
import { LoadOperatorProfileUseCase } from '$application/operations/load-operator-profile';
import { SaveOperatorProfileUseCase } from '$application/operations/save-operator-profile';
import type { OperatorProfile } from '$domain/settings';
import { GET, PUT } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { memoryIdentity, type MemoryIdentity } from '$lib/server/identity.fixture';

/** The caller's own display name: the identity source's on a team install, the operator profile's otherwise. */

function installation(identity: MemoryIdentity) {
	let stored: OperatorProfile = { displayName: '' };
	const repo = {
		load: async () => stored,
		save: async (profile) => {
			stored = profile;
		}
	} satisfies OperatorProfileRepositoryPort;
	const audit: AuditEvent[] = [];
	const services = servicesWith({
		identity,
		loadOperatorProfile: new LoadOperatorProfileUseCase(repo),
		saveOperatorProfile: new SaveOperatorProfileUseCase(repo),
		audit: { record: (event) => void audit.push(event) }
	});
	return { services, audit, stored: () => stored };
}

function put(services: ReturnType<typeof installation>['services'], body: unknown, token: string | null, email = 'ada@example.test') {
	return requestEvent({
		path: '/api/account/profile',
		method: 'PUT',
		body: JSON.stringify(body),
		authRequired: true,
		session: { isAuthenticated: true, email },
		cookies: token ? { lyriks_session: token } : {},
		services
	});
}

async function outcome(run: Response | Promise<Response>) {
	return Promise.resolve(run).then(
		async (response) => ({ status: response.status, body: await response.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
}

describe('changing one own display name on a team installation', () => {
	it('changes the name of the account the session belongs to, and no other', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test' }, { email: 'bob@example.test', firstName: 'Bob' }]);
		const { services, audit } = installation(identity);
		const token = identity.sessionFor('ada@example.test');
		const result = await outcome(PUT(put(services, { firstName: 'Ada', lastName: 'Lovelace' }, token)));
		expect(result).toEqual({ status: 200, body: { profile: { displayName: 'Ada Lovelace' } } });
		expect(await identity.profile(token)).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
		expect(await identity.profile(identity.sessionFor('bob@example.test'))).toEqual({ firstName: 'Bob', lastName: '' });
		expect(audit).toMatchObject([{ action: 'account.profile.update', actor: 'ada@example.test', outcome: 'success' }]);
	});

	it('answers with the identity source status when the session is no longer valid, recording nothing', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test' }]);
		const { services, audit } = installation(identity);
		const result = await outcome(PUT(put(services, { firstName: 'Eve' }, 'token-forged')));
		expect(result.status).toBe(401);
		expect(audit).toEqual([]);
	});
});

describe('the operator profile on a single-operator installation', () => {
	it('saves the trimmed display name and reads it back', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test' }], { multiUser: false });
		const { services, audit, stored } = installation(identity);
		const result = await outcome(PUT(put(services, { displayName: '  Ada  ' }, null)));
		expect(result).toEqual({ status: 200, body: { profile: { displayName: 'Ada' } } });
		expect(stored()).toEqual({ displayName: 'Ada' });
		expect(await (await GET(put(services, null, null))).json()).toEqual({ profile: { displayName: 'Ada' } });
		expect(audit).toMatchObject([{ detail: 'displayName=set' }]);
	});
});
