import { describe, expect, it } from 'vitest';
import { postLoginRedirect } from './post-login-redirect';

describe('postLoginRedirect', () => {
	it.each(['/\\evil.example/cb', '/\tevil.example', '/\nevil.example', '//evil.example'])('rejects a browser-normalized external path: %s', target => {
		expect(postLoginRedirect(target)).toBe('/');
	});

	it('honours a local path', () => {
		expect(postLoginRedirect('/projects/abc')).toBe('/projects/abc');
		expect(postLoginRedirect('/join/token-123')).toBe('/join/token-123');
	});

	describe('refuses everything else', () => {
		it('rejects a protocol-relative URL', () => {
			// "//evil.example" is not a local path; browsers follow it off-site.
			expect(postLoginRedirect('//evil.example/steal')).toBe('/');
		});

		it('rejects every external origin, the one of the former behaviour dashboard included [criterion:ea8894f2]', () => {
			expect(postLoginRedirect('https://evil.example/steal')).toBe('/');
			expect(postLoginRedirect('https://lyriks.example.corp:8444/features/checkout')).toBe('/');
		});

		it('rejects junk', () => {
			expect(postLoginRedirect('')).toBe('/');
			expect(postLoginRedirect('javascript:alert(1)')).toBe('/');
		});
	});
});
