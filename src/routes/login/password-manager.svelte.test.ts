import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

/**
 * Create your Lyriks account, as the browser's password manager reads it: the
 * address is the account's username and both password fields ask for a new
 * password, so a browser that generates passwords offers one, fills both and
 * saves it under the address.
 */

function page(data: Record<string, unknown>, form: Record<string, unknown> | null = null): string {
	const base = {
		authConfigured: true,
		authRequired: true,
		firstRun: false,
		allowSignup: true,
		viaInvite: false,
		inviteEmail: null,
		inviteWorkspace: null,
		inviteExpired: false,
		redirectTo: '/',
		backUnreachable: false
	};
	return render(Page, { props: { data: { ...base, ...data } as never, form: form as never } }).body;
}

/** The opening tag of the input posted under `name`, or null when the form has none. */
function input(html: string, name: string): string | null {
	return html.match(new RegExp(`<input[^>]*\\bname="${name}"[^>]*>`))?.[0] ?? null;
}

const attribute = (tag: string | null, name: string) => tag?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
const flag = (tag: string | null, name: string) => tag !== null && new RegExp(`\\s${name}(?=[\\s=/>])`).test(tag);

describe('Create your Lyriks account is read by the browser password manager [criterion:ac-leaf-8da2717b-4eba-4aec-862d-edb52354cd81]', () => {
	it('marks the address as the username and both password fields as a new password [criterion:ac-leaf-8da2717b-4eba-4aec-862d-edb52354cd81]', () => {
		const html = page({}, { mode: 'register' });
		expect(html).toContain('Create your Lyriks account');
		const email = input(html, 'email');
		expect(attribute(email, 'type')).toBe('email');
		expect(attribute(email, 'autocomplete')).toBe('username');
		expect(flag(email, 'readonly')).toBe(false);
		for (const name of ['password', 'confirm']) {
			const field = input(html, name);
			expect(attribute(field, 'type'), name).toBe('password');
			expect(attribute(field, 'autocomplete'), name).toBe('new-password');
			expect(flag(field, 'required'), name).toBe(true);
		}
		expect(html.indexOf('name="password"')).toBeLessThan(html.indexOf('name="confirm"'));
		expect(html).toContain('Confirm password');
	});

	it('reads an address locked by an invitation the same way [criterion:ac-leaf-8da2717b-4eba-4aec-862d-edb52354cd81]', () => {
		const html = page({ viaInvite: true, inviteEmail: 'bea@example.test', inviteWorkspace: 'Acme' });
		expect(html).toContain('Create your Lyriks account');
		const email = input(html, 'email');
		expect(flag(email, 'readonly')).toBe(true);
		expect(attribute(email, 'autocomplete')).toBe('username');
		expect(attribute(email, 'value')).toBe('bea@example.test');
		expect(attribute(input(html, 'password'), 'autocomplete')).toBe('new-password');
		expect(attribute(input(html, 'confirm'), 'autocomplete')).toBe('new-password');
	});

	it('leaves signing in as it was: no confirmation, the current password [criterion:ac-leaf-8da2717b-4eba-4aec-862d-edb52354cd81]', () => {
		const html = page({});
		expect(html).toContain('Sign in to Lyriks');
		expect(attribute(input(html, 'email'), 'autocomplete')).toBe('email');
		expect(attribute(input(html, 'password'), 'autocomplete')).toBe('current-password');
		expect(input(html, 'confirm')).toBeNull();
	});
});

describe('a refused confirmation keeps the names and the address [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', () => {
	it('shows the refusal and fills the names and the address back, both passwords empty [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', () => {
		const html = page(
			{},
			{ mode: 'register', email: 'ada@example.test', firstName: 'Ada', lastName: 'Lovelace', message: 'The two passwords do not match.' }
		);
		expect(html).toContain('The two passwords do not match.');
		expect(attribute(input(html, 'firstName'), 'value')).toBe('Ada');
		expect(attribute(input(html, 'lastName'), 'value')).toBe('Lovelace');
		expect(attribute(input(html, 'email'), 'value')).toBe('ada@example.test');
		expect(attribute(input(html, 'password'), 'value')).toBeNull();
		expect(attribute(input(html, 'confirm'), 'value')).toBeNull();
	});
});
