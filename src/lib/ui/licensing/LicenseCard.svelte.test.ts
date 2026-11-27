import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { LicenseEntitlements, LicenseView } from '$domain/licensing';
import LicenseCard from './LicenseCard.svelte';

const view = (overrides: Partial<LicenseEntitlements>): LicenseView => ({
	status: 'active',
	entitlements: {
		licenseId: 'lic_1',
		customer: 'Acme Corp',
		edition: 'enterprise',
		seats: 5,
		issuedAt: '2026-11-01T00:00:00.000Z',
		expiresAt: null,
		...overrides
	},
	daysRemaining: null,
	activatedAt: null
});

const projectsOf = (html: string): string | undefined => html.match(/data-licence-projects[^>]*>([^<]*)</)?.[1];

describe('the licence card reads the number of active projects the key grants [criterion:ac-leaf-033088d7-bea3-4aed-bf06-409e6bef334d]', () => {
	it('reads the number an Enterprise key states, Unlimited for one that states none, 1 for a Community key', () => {
		expect(projectsOf(render(LicenseCard, { props: { view: view({ projects: 3 }) } }).body)).toBe('3');
		expect(projectsOf(render(LicenseCard, { props: { view: view({}) } }).body)).toBe('Unlimited');
		expect(projectsOf(render(LicenseCard, { props: { view: view({ edition: 'community', seats: 1 }) } }).body)).toBe('1');
	});
});

describe('The licence card names where the licence stands [criterion:0dabc6f0]', () => {
	it('names each state in its heading', () => {
		const states: [LicenseView['status'], string][] = [
			['active', 'Product activated'],
			['expired', 'Licence expired'],
			['invalid', 'Licence key invalid'],
			['tampered', 'System clock rolled back'],
			['unlicensed', 'Product not activated']
		];
		for (const [status, heading] of states) {
			const entitlements = status === 'invalid' || status === 'unlicensed' ? null : view({}).entitlements;
			const html = render(LicenseCard, { props: { view: { ...view({}), status, entitlements } } }).body;
			expect(html).toContain(heading);
		}
	});

	it('shows Licensed to, Edition, Seats, Expires and Activated on this install for a key that verifies, and explains a clock set back', () => {
		const html = render(LicenseCard, { props: { view: view({}) } }).body;
		for (const label of ['Licensed to', 'Edition', 'Seats', 'Expires', 'Activated on this install']) expect(html).toContain(label);
		expect(render(LicenseCard, { props: { view: { ...view({}), status: 'tampered' } } }).body).toContain('The system clock is set earlier');
	});
});

