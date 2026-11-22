import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import type { LiveSessionSignal } from '$lib/shared/live-session';
import { GET } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { publishAiActivity, publishLiveSignal, publishSectionChange } from '$lib/server/sync-bus.server';

/**
 * The live change feed of one project, over the real in-process bus: refused
 * to whoever may not read the project, silent about other projects, never
 * echoing a save to the tab that made it, and carrying a live AI session only
 * to the person whose session it is.
 */

function open(projectId: string, opts: { decision?: AccessDecision; email?: string; clientId?: string } = {}) {
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => opts.decision ?? { ok: true } },
		enterpriseHooks: null,
		currentSession: () => ({ isAuthenticated: true, email: opts.email ?? 'ada@example.test' })
	});
	const query = new URLSearchParams({ projectId, ...(opts.clientId ? { clientId: opts.clientId } : {}) });
	return Promise.resolve(GET(requestEvent({ path: `/api/sync/events?${query}`, authRequired: true, services, cookies: { lyriks_session: 'jwt' } })));
}

/** Everything the stream carried once `publish` ran, read until it goes quiet. */
async function received(response: Response, publish: () => void): Promise<string> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let text = decoder.decode((await reader.read()).value); // the retry hint, written at once
	publish();
	for (;;) {
		const quiet = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20));
		const chunk = await Promise.race([reader.read(), quiet]);
		if (!chunk || chunk.done) break;
		text += decoder.decode(chunk.value);
	}
	await reader.cancel();
	return text;
}

const signal = (projectId: string, personId: string): LiveSessionSignal & { projectId: string } => ({
	projectId,
	requestId: 'r1',
	personId,
	sessionId: 's1',
	status: 'thinking',
	thinkingAbout: 'the cart',
	saying: null,
	step: null,
	endReason: null,
	at: '2026-11-18T03:00:00.000Z'
});

describe('the live change feed of a project', () => {
	it('is refused to a caller who may not read the project', async () => {
		const refused = await open('p-feed', { decision: { ok: false, reason: 'forbidden' } }).catch((e: unknown) => e);
		expect(isHttpError(refused) && refused.status).toBe(403);
	});

	it('is a non-cached event stream that names each changed section of this project only', async () => {
		const response = await open('p-feed');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(response.headers.get('cache-control')).toContain('no-cache');
		const text = await received(response, () => {
			publishSectionChange({ projectId: 'p-other', section: 'secret-section', origin: null });
			publishSectionChange({ projectId: 'p-feed', section: 'features', origin: null });
		});
		expect(text).toContain('retry: 3000');
		expect(text).toContain('event: change\ndata: {"section":"features"}');
		expect(text).not.toContain('secret-section');
	});

	it('does not echo a save back to the tab that made it', async () => {
		const response = await open('p-echo', { clientId: 'tab-1' });
		const text = await received(response, () => {
			publishSectionChange({ projectId: 'p-echo', section: 'rules', origin: 'tab-1' });
			publishSectionChange({ projectId: 'p-echo', section: 'data', origin: 'tab-2' });
		});
		expect(text).toContain('"section":"data"');
		expect(text).not.toContain('"section":"rules"');
	});

	it('carries a live AI session to its own person only, whatever the case of the address', async () => {
		const mine = await open('p-live', { email: 'Ada@Example.test' });
		const text = await received(mine, () => {
			publishLiveSignal(signal('p-live', 'bob@example.test'));
			publishLiveSignal(signal('p-live', 'ada@example.test'));
		});
		expect(text.match(/event: live/g)).toHaveLength(1);
		expect(text).toContain('"personId":"ada@example.test"');
		expect(text).not.toContain('bob@example.test');
	});

	it('says what the AI read or wrote on this project', async () => {
		const response = await open('p-act');
		const text = await received(response, () => {
			publishAiActivity({ projectId: 'p-act', requestId: 'r1', act: 'write', section: 'features' });
		});
		expect(text).toContain('event: activity\ndata: {"requestId":"r1","act":"write","section":"features"}');
	});
});
