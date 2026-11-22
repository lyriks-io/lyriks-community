import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { actions, load } from './+page.server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { ACME_KEY, RENEWAL_KEY, licenceDesk, type LicenceDesk } from '$lib/server/licence-desk.fixture';

/** The activation screen's form actions, over the real licence use-cases. */

const ADMIN = 'root@example.test';
type ActionEvent = Parameters<NonNullable<typeof actions.activate>>[0];
type LoadEvent = Parameters<typeof load>[0];

function submit(desk: LicenceDesk, fields: Record<string, string> = {}, email = ADMIN): ActionEvent {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return requestEvent({
		path: '/activate',
		method: 'POST',
		body: form,
		authRequired: true,
		session: { isAuthenticated: true, email },
		services: servicesWith({
			...desk.services,
			licenseRequired: () => true,
			imagesEdition: () => 'enterprise',
			installEdition: () => 'enterprise',
			loadInstallRegistration: { execute: async () => 'REG-CODE' }
		})
	}) as ActionEvent;
}

/** What an action ends in: a redirect, an action failure, a refusal, or its data. */
async function run(action: (event: ActionEvent) => unknown, event: ActionEvent) {
	try {
		const result = await action(event);
		return isActionFailure(result) ? { failure: result.status, data: result.data } : { data: result };
	} catch (thrown) {
		if (isRedirect(thrown)) return { redirect: thrown.location };
		if (isHttpError(thrown)) return { refused: thrown.status };
		throw thrown;
	}
}

afterEach(() => {
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('activating from the activation screen', () => {
	it('stores a valid key, hands it to the seat gate and opens the product', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk();
		expect(await run(actions.activate!, submit(desk, { key: ACME_KEY }))).toEqual({ redirect: '/' });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([true]);
		expect(desk.seeded).toHaveLength(1);
	});

	it('keeps the screen with the reason when the key does not verify', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk();
		const outcome = await run(actions.activate!, submit(desk, { key: 'KEY-FORGED' }));
		expect(outcome).toMatchObject({ failure: 400, data: { status: 'invalid' } });
		expect(desk.current()).toBeNull();
		expect(desk.deliveries).toEqual([]);
	});

	it('refuses a member who is not an administrator, storing nothing', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk();
		expect(await run(actions.activate!, submit(desk, { key: ACME_KEY }, 'member@example.test'))).toEqual({ refused: 403 });
		expect(desk.current()).toBeNull();
	});
});

describe('previewing, stepping back and removing a key', () => {
	it('previews a renewal without adopting it', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: ACME_KEY });
		const outcome = await run(actions.preview!, submit(desk, { key: RENEWAL_KEY }));
		expect(outcome).toMatchObject({ data: { key: RENEWAL_KEY, preview: { entitlements: { seats: 50 } } } });
		expect(desk.current()).toBe(ACME_KEY);
	});

	it('steps back to the previous key and delivers it', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		expect(await run(actions.restorePrevious!, submit(desk))).toMatchObject({ data: { restored: { status: 'active' } } });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([true]);
	});

	it('says why it cannot step back when there is no previous key, delivering nothing', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: ACME_KEY });
		expect(await run(actions.restorePrevious!, submit(desk))).toMatchObject({ failure: 400, data: { restoreReason: expect.any(String) } });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([]);
	});

	it('removes only the key in force unless the previous one is ticked too', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const keepPrevious = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		await run(actions.deactivate!, submit(keepPrevious));
		expect([keepPrevious.current(), keepPrevious.previous()]).toEqual([null, ACME_KEY]);
		const both = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		await run(actions.deactivate!, submit(both, { previousToo: 'on' }));
		expect([both.current(), both.previous()]).toEqual([null, null]);
	});

	it('lets no member preview, step back or remove', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		for (const action of [actions.preview!, actions.restorePrevious!, actions.deactivate!]) {
			expect(await run(action, submit(desk, { key: ACME_KEY }, 'member@example.test'))).toEqual({ refused: 403 });
		}
		expect([desk.current(), desk.previous()]).toEqual([RENEWAL_KEY, ACME_KEY]);
	});
});

describe('the activation screen', () => {
	it('shows the registration code only once a valid key is in force', async () => {
		const active = (await load(submit(licenceDesk({ current: ACME_KEY })) as unknown as LoadEvent)) as { registrationCode: string | null };
		expect(active.registrationCode).toBe('REG-CODE');
		const none = (await load(submit(licenceDesk()) as unknown as LoadEvent)) as { registrationCode: string | null; hasPreviousKey: boolean };
		expect(none.registrationCode).toBeNull();
		expect(none.hasPreviousKey).toBe(false);
	});
});
