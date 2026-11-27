import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { LicenseEntitlements, LicenseView } from '$domain/licensing';
import AccountLicence from './AccountLicence.svelte';

const view = (overrides: Partial<LicenseEntitlements> = {}, status: LicenseView['status'] = 'active'): LicenseView => ({
	status,
	entitlements: {
		licenseId: 'lic_42',
		customer: 'Acme Corp',
		edition: 'enterprise',
		seats: 5,
		issuedAt: '2026-11-01T00:00:00.000Z',
		expiresAt: '2027-11-01T00:00:00.000Z',
		...overrides
	},
	daysRemaining: 340,
	activatedAt: '2026-11-02T00:00:00.000Z'
});

const projectsOf = (html: string): string | undefined => html.match(/data-licence-projects[^>]*>([^<]*)</)?.[1];

describe('Settings, Account repeats the licence [criterion:dc792f74]', () => {
	it('shows Licensed to, Edition, Seats, Expires, Issued, Activated and Licence id with Manage', () => {
		const html = render(AccountLicence, { props: { license: view() } }).body;
		for (const label of ['Licensed to', 'Edition', 'Seats', 'Expires', 'Issued', 'Activated', 'Licence id', 'Manage']) expect(html).toContain(label);
		expect(html).toContain('2027-11-01 (340 days left)');
		expect(html).toContain('lic_42');
		expect(render(AccountLicence, { props: { license: view({ expiresAt: null }) } }).body).toContain('Never (perpetual)');
	});

	it('adds the status when it is not active, and reads Not activated without a key', () => {
		expect(render(AccountLicence, { props: { license: view({}, 'expired') } }).body).toContain('Status: expired. See /activate.');
		const none: LicenseView = { status: 'unlicensed', entitlements: null, daysRemaining: null, activatedAt: null };
		const html = render(AccountLicence, { props: { license: none } }).body;
		expect(html).toContain('Not activated.');
		expect(html).toContain('Activate now');
	});
});

describe('Settings, Account reads the number of active projects the key grants [criterion:ac-leaf-033088d7-bea3-4aed-bf06-409e6bef334d]', () => {
	it('reads the number an Enterprise key states, Unlimited for one that states none, 1 for a Community key', () => {
		expect(projectsOf(render(AccountLicence, { props: { license: view({ projects: 4 }) } }).body)).toBe('4');
		expect(projectsOf(render(AccountLicence, { props: { license: view() } }).body)).toBe('Unlimited');
		expect(projectsOf(render(AccountLicence, { props: { license: view({ edition: 'community', seats: 1 }) } }).body)).toBe('1');
	});
});
