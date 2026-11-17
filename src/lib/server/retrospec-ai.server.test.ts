import { getServices } from '$composition/container.server';
import { describe, expect, it, vi } from 'vitest';
import type { Handle, RequestEvent } from '@sveltejs/kit';

// No env: the memory bus, no database.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { subscribeAiActivity, type ProjectAiActivity } from './sync-bus.server';
import { activityLog } from '$domain/retrospec';
import { aiCallsOf, foldAiCall, followAiProjectCalls, type AiCall, writesTheSpecification } from './retrospec-ai.server';
import { aiWorkedAt } from './ai-work.server';

function call(url: string, init: { method?: string; ai?: boolean; body?: unknown } = {}) {
	const headers = new Headers(init.ai === false ? {} : { 'x-lyriks-actor': 'ai_client' });
	if (init.body !== undefined) headers.set('content-type', 'application/json');
	const request = new Request(`http://localhost${url}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
	return { event: { request, url: new URL(request.url), locals: { services: getServices() } } as unknown as RequestEvent, resolve: (async () => new Response('')) as unknown as Parameters<Handle>[0]['resolve'] };
}

async function follow(input: ReturnType<typeof call>, status = 200) {
	const seen: ProjectAiActivity[] = [];
	const off = subscribeAiActivity((a) => seen.push(a));
	// The route reads the body after the follower: it must still be there.
	let bodyRead: unknown = null;
	const handle: Handle = async ({ event }) => {
		bodyRead = event.request.method === 'GET' ? null : await event.request.json().catch(() => 'unreadable');
		return new Response('', { status });
	};
	await followAiProjectCalls(input, handle);
	off();
	return { seen, bodyRead };
}

describe('following the AI on a project', () => {
	it('announces a read named in the query, with its section', async () => {
		const { seen } = await follow(call('/api/sections?projectId=p-1&section=features'));
		expect(seen).toEqual([{ projectId: 'p-1', requestId: '', act: 'read', section: 'features' }]);
	});

	it('announces a write named in the JSON body and leaves the body to the route', async () => {
		const { seen, bodyRead } = await follow(call('/api/draft/data', { method: 'PUT', body: { projectId: 'p-2', entities: [] } }));
		expect(seen).toEqual([{ projectId: 'p-2', requestId: '', act: 'write', section: 'data' }]);
		expect(bodyRead).toEqual({ projectId: 'p-2', entities: [] });
	});

	it('names a project in the address, and a behaviour write as such', async () => {
		expect((await follow(call('/api/projects/p-3/completion', { method: 'POST', body: { action: 'audit' } }))).seen[0]).toMatchObject({ projectId: 'p-3', act: 'write', section: 'completion' });
		expect((await follow(call('/api/behavior/apply', { method: 'POST', body: { projectId: 'p-4' } }))).seen[0]).toMatchObject({ projectId: 'p-4', section: 'behavior' });
	});

	it('ignores a person, a failed call and a call about no project', async () => {
		expect((await follow(call('/api/sections?projectId=p-1', { ai: false }))).seen).toEqual([]);
		expect((await follow(call('/api/sections?projectId=p-1'), 403)).seen).toEqual([]);
		expect((await follow(call('/api/skills/sync', { method: 'POST', body: { client: 'claude' } }))).seen).toEqual([]);
	});

	it('keeps the recent calls of each project it heard of', async () => {
		await follow(call('/api/draft/users', { method: 'PUT', body: { projectId: 'p-9' } }));
		expect(aiCallsOf('p-9').at(-1)).toMatchObject({ act: 'write', section: 'users' });
	});
});

// Field run 2026-10-27: four agents reading hard pushed their own writes out of a
// 400-call ring, and the activity log erased itself as the analysis ran.
describe('the events the log is read from', () => {
	const at = (s: number) => new Date(Date.UTC(2026, 9, 27, 14, 0, s)).toISOString();

	it('keeps a read only when it opens a visit, and folds a burst of writes to one section', () => {
		const list: AiCall[] = [];
		let seen: string | null = null;
		const call = (s: number, act: 'read' | 'write', section: string | null) => {
			foldAiCall(list, { at: at(s), act, section }, seen);
			seen = at(s);
		};
		call(0, 'read', 'features');
		for (let s = 1; s < 50; s++) call(s, 'read', 'features');
		for (let s = 50; s < 200; s += 10) call(s, 'write', 'behavior');
		call(205, 'write', 'data');
		expect(list).toEqual([
			{ at: at(0), act: 'read', section: 'features' },
			{ at: at(50), act: 'write', section: 'behavior', until: at(190) },
			{ at: at(205), act: 'write', section: 'data' }
		]);
	});

	it('logs the same lines as before, from far fewer events', () => {
		const folded: AiCall[] = [];
		let seen: string | null = null;
		const raw: AiCall[] = [];
		for (let s = 0; s < 400; s += 5) {
			const c: AiCall = { at: at(s), act: s % 15 === 0 ? 'write' : 'read', section: s < 200 ? 'behavior' : 'data' };
			raw.push(c);
			foldAiCall(folded, c, seen);
			seen = c.at;
		}
		expect(folded.length).toBeLessThan(raw.length / 10);
		expect(activityLog(null, folded, []).map((l) => l.text)).toEqual(activityLog(null, raw, []).map((l) => l.text));
	});

	it('counts every act of the AI for its session, never its wait for the next click [criterion:122ab5c8]', async () => {
		await follow(call('/api/evolution/live', { method: 'POST', body: { projectId: 'p-w', act: 'await', sessionId: 's1' } }));
		expect(aiWorkedAt('p-w', 'local-operator')).toBeNull();
		await follow(call('/api/behavior/apply', { method: 'POST', body: { projectId: 'p-w' } }));
		expect(aiWorkedAt('p-w', 'local-operator')).not.toBeNull();
		// A read counts as much as a write, and a person's call does not count for their AI.
		await follow(call('/api/sections?projectId=p-r&section=features'));
		expect(aiWorkedAt('p-r', 'local-operator')).not.toBeNull();
		await follow(call('/api/sections?projectId=p-h', { ai: false }));
		expect(aiWorkedAt('p-h', 'local-operator')).toBeNull();
	});
});

describe('what a later run that holds its changes may not write [criterion:50b00229]', () => {
	const writes = (path: string) => writesTheSpecification(new URL(`http://x${path}`));

	it('holds the sections and the behaviour', () => {
		for (const path of ['/api/draft/features', '/api/draft/users', '/api/draft/data/links', '/api/behavior/apply', '/api/behavior/project']) expect(writes(path), path).toBe(true);
	});

	it('leaves open the sources, the index and the report', () => {
		for (const path of ['/api/draft/documents', '/api/behavior/sources', '/api/behavior/implementation/index', '/api/projects/p/retrospec/reading']) expect(writes(path), path).toBe(false);
	});
});
