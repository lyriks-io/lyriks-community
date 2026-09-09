import { describe, it, expect } from 'vitest';
import { humanizeDomainName } from './index';

describe('humanizeDomainName', () => {
	it('title-cases a plain caller slug', () => {
		expect(humanizeDomainName('mcp-test')).toBe('Mcp Test');
		expect(humanizeDomainName('customer_success')).toBe('Customer Success');
	});

	it('does not chop a trailing word just because it is six characters', () => {
		// Regression: "system" is six chars but must survive for a non-generated id.
		expect(humanizeDomainName('design-system')).toBe('Design System');
	});

	it('strips the dom- prefix and uniqueness suffix on a generated id', () => {
		expect(humanizeDomainName('dom-customer-success-4d75c2')).toBe('Customer Success');
	});

	it('falls back for an empty id', () => {
		expect(humanizeDomainName('   ')).toBe('Untitled domain');
	});
});
