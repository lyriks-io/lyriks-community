import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { injectEmbedHistory, proxyToUnspa } from './unspa-proxy.server';
import type { RequestEvent } from '@sveltejs/kit';

const eventFor = (url: string) =>
	({ url: new URL(url), request: new Request(url) }) as unknown as RequestEvent;

const htmlUpstream = (body: string, headers: Record<string, string> = {}) =>
	vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/html', ...headers } }));

describe('the framed behavior editor never grows the browser history', () => {
	it('puts the history script first in the head of an embed page', async () => {
		const res = await proxyToUnspa(
			eventFor('http://lyriks.test/behavior/features/x?embed=1'),
			'http://dashboard:3000',
			htmlUpstream('<html><head><script src="/app.js"></script></head><body></body></html>')
		);
		const html = await res.text();
		expect(html.indexOf('h.pushState=function')).toBeGreaterThan(-1);
		expect(html.indexOf('h.pushState=function')).toBeLessThan(html.indexOf('/app.js'));
	});

	it('leaves a page opened outside Lyriks untouched', async () => {
		const page = '<html><head></head><body></body></html>';
		const res = await proxyToUnspa(
			eventFor('http://lyriks.test/behavior/features/x'),
			'http://dashboard:3000',
			htmlUpstream(page)
		);
		expect(await res.text()).toBe(page);
	});

	it('lets the script run under a script-src policy', () => {
		const headers = new Headers({ 'content-security-policy': "default-src 'self'; script-src 'self'" });
		injectEmbedHistory('<html><head></head></html>', headers);
		expect(headers.get('content-security-policy')).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
	});
});
