import { describe, expect, it } from 'vitest';
import { postLoginRedirect } from './post-login-redirect';

const DASH = 'https://lyriks.example.corp:8444';

describe('postLoginRedirect', () => {
	it.each(['/\\evil.example/cb', '/\tevil.example', '/\nevil.example', '//evil.example'])('rejects a browser-normalized external path: %s', target => {
		expect(postLoginRedirect(target)).toBe('/');
	});

	it('honours a local path', () => {
		expect(postLoginRedirect('/projects/abc')).toBe('/projects/abc');
		expect(postLoginRedirect('/join/token-123')).toBe('/join/token-123');
	});

	it('returns to the configured behaviour dashboard', () => {
		// The reason this exists: the dashboard has no login of its own, so it
		// bounces here, and without a way back the operator loses their page.
		expect(postLoginRedirect(`${DASH}/features/checkout`, DASH)).toBe(
			`${DASH}/features/checkout`
		);
	});

	describe('refuses everything else', () => {
		it('rejects a protocol-relative URL', () => {
			// "//evil.example" is not a local path; browsers follow it off-site.
			expect(postLoginRedirect('//evil.example/steal')).toBe('/');
		});

		it('rejects an arbitrary external origin', () => {
			expect(postLoginRedirect('https://evil.example/steal', DASH)).toBe('/');
		});

		it('rejects the dashboard host on a DIFFERENT port', () => {
			// The dashboard is the app's host on its own port, so comparing hosts
			// alone would admit anything else listening on that machine.
			expect(postLoginRedirect('https://lyriks.example.corp:9999/x', DASH)).toBe('/');
		});

		it('rejects the dashboard origin over plain HTTP', () => {
			expect(postLoginRedirect('http://lyriks.example.corp:8444/x', DASH)).toBe('/');
		});

		it('rejects a look-alike host', () => {
			expect(postLoginRedirect('https://lyriks.example.corp.evil.test:8444/x', DASH)).toBe('/');
		});

		it('rejects an external target when no dashboard is configured', () => {
			expect(postLoginRedirect(`${DASH}/x`)).toBe('/');
			expect(postLoginRedirect(`${DASH}/x`, '')).toBe('/');
			expect(postLoginRedirect(`${DASH}/x`, 'not a url')).toBe('/');
		});

		it('rejects junk', () => {
			expect(postLoginRedirect('')).toBe('/');
			expect(postLoginRedirect('javascript:alert(1)')).toBe('/');
		});
	});
});
