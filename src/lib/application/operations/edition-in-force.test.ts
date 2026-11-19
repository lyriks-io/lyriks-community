import { describe, expect, it, vi } from 'vitest';
import type { LicenseView } from '$domain/licensing';
import { EditionInForce } from './edition-in-force';

function read(edition: 'community' | 'enterprise' | null, status: LicenseView['status'] = 'active'): LicenseView {
	return {
		status,
		entitlements: edition
			? {
					licenseId: 'lic',
					customer: 'Acme',
					email: 'ops@example.corp',
					edition,
					seats: 1,
					issuedAt: '2026-11-01T00:00:00.000Z',
					expiresAt: null
				}
			: null,
		daysRemaining: null,
		activatedAt: null
	} as LicenseView;
}

describe('EditionInForce', () => {
	it('opens the images edition until a key is read', () => {
		expect(new EditionInForce('enterprise').current()).toBe('enterprise');
	});

	it('opens Community once a Community key is read on the Enterprise images', () => {
		const edition = new EditionInForce('enterprise');
		edition.record(read('community'));
		expect(edition.current()).toBe('community');
		expect(edition.declared()).toBe('enterprise');
	});

	it('goes back to Enterprise when an Enterprise key replaces it', () => {
		const edition = new EditionInForce('enterprise');
		edition.record(read('community'));
		edition.record(read('enterprise'));
		expect(edition.current()).toBe('enterprise');
	});

	it('keeps the last edition known when a read finds no key it can verify', () => {
		const edition = new EditionInForce('enterprise');
		edition.record(read('community'));
		edition.record(read(null, 'invalid'));
		expect(edition.current()).toBe('community');
	});

	it('tells its listener only when the opened edition changes', () => {
		const edition = new EditionInForce('enterprise');
		const listener = vi.fn();
		edition.onChange(listener);
		edition.record(read('enterprise'));
		expect(listener).not.toHaveBeenCalled();
		edition.record(read('community'));
		edition.record(read('community'));
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
