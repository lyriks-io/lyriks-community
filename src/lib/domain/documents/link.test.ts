import { describe, expect, it } from 'vitest';
import { sourceHref } from './link';

describe('sourceHref', () => {
	it('follows links, inline files and in-appliance paths', () => {
		expect(sourceHref({ url: 'https://eur-lex.europa.eu/gdpr' })).toBe(
			'https://eur-lex.europa.eu/gdpr'
		);
		expect(sourceHref({ url: 'mailto:ops@customer.test' })).toBe('mailto:ops@customer.test');
		expect(sourceHref({ url: 'data:application/pdf;base64,AAA' })).toBe(
			'data:application/pdf;base64,AAA'
		);
		expect(sourceHref({ url: '/api/files/interview.pdf' })).toBe('/api/files/interview.pdf');
		expect(sourceHref({ url: '  https://example.test  ' })).toBe('https://example.test');
	});

	it('refuses anything that is not a followable location', () => {
		// A plain reference is the common case — it must render as text, not a
		// dead link.
		expect(sourceHref({ url: 'Ops lead interview, 2026-03-11' })).toBeNull();
		expect(sourceHref({ url: '' })).toBeNull();
		expect(sourceHref({ url: '   ' })).toBeNull();
		// Stored project data must never become an executable href.
		expect(sourceHref({ url: 'javascript:alert(1)' })).toBeNull();
	});
});
