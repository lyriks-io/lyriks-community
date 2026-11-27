import { getServices } from '$composition/container.server';
import { describe, expect, it, vi } from 'vitest';
import type { Handle, RequestEvent } from '@sveltejs/kit';

// No env: the memory bus, no database.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { subscribeAiActivity, type ProjectAiActivity } from './sync-bus.server';
import { activityLog } from '$domain/retrospec';
import { aiCallsOf, foldAiCall, followAiProjectCalls, frozenOnceValidated, type AiCall, writesTheSpecification, WRITES_HELD } from './retrospec-ai.server';
import { RETROSPEC_SECTION } from '$domain/retrospec';
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

// Criterion 3b0446d2 (rules aa96a75b, 1e614a44, 331b7c1f): a validated specification
// refuses what an AI client writes in it, as the page refuses the same change in place.
describe('what an AI client may not write in a validated specification [criterion:3b0446d2]', () => {
	const by = { id: 'ana@example.test', name: 'Ana' };
	const published = { id: 'r1', startedAt: '2026-11-20T10:00:00.000Z', startedBy: by, verdicts: {}, publishedAt: '2026-11-21T10:00:00.000Z', baselineId: null };
	const later = (extra: Record<string, unknown>) => ({ id: 'r2', startedAt: '2026-11-22T10:00:00.000Z', startedBy: by, verdicts: {}, publishedAt: null, baselineId: null, ...extra });
	// The retrospecification of each project, held in memory: only that section is read before a write.
	const stored = new Map<string, unknown>();
	const sectionDocuments = {
		load: async (projectId: string, section: string) => (section === RETROSPEC_SECTION ? (stored.get(projectId) ?? null) : null),
		currentRevision: async () => 1
	};
	const services = new Proxy(getServices(), { get: (target, key) => (key === 'sectionDocuments' ? sectionDocuments : Reflect.get(target, key)) });
	let n = 0;
	async function project(runs: unknown[]): Promise<string> {
		const projectId = `p-validated-${++n}`;
		stored.set(projectId, { version: 1, runs, comments: {} });
		return projectId;
	}
	async function write(path: string, projectId: string, init: { method?: string; ai?: boolean; body?: Record<string, unknown> } = {}) {
		let reached = false;
		const handle: Handle = async () => {
			reached = true;
			return new Response('{}', { status: 200 });
		};
		const input = call(path, { method: init.method ?? 'PUT', ai: init.ai, body: { projectId, ...init.body } });
		(input.event.locals as { services: unknown }).services = services;
		const response = await followAiProjectCalls(input, handle);
		return { status: response.status, reached, message: reached ? null : ((await response.json()) as { message: string }).message };
	}
	const REFUSED = 'The specification is validated: change it through an evolution.';

	it('refuses every part that says what the product does, whole or by operations, and its behaviour', async () => {
		const projectId = await project([published]);
		for (const path of ['/api/draft/foundation', '/api/draft/foundation/identity', '/api/draft/foundation/definition', '/api/draft/users', '/api/draft/users/role', '/api/draft/users/capabilities', '/api/draft/features', '/api/draft/experience', '/api/draft/data', '/api/draft/data/links', '/api/draft/architecture', '/api/draft/glossary']) {
			expect(await write(path, projectId), path).toEqual({ status: 409, reached: false, message: REFUSED });
		}
		expect(await write('/api/behavior/apply', projectId, { method: 'POST', body: { featureId: 'feat-1', operations: [] } })).toEqual({ status: 409, reached: false, message: REFUSED });
		expect(await write('/api/behavior/project', projectId, { method: 'POST', body: { operations: [] } })).toEqual({ status: 409, reached: false, message: REFUSED });
	});

	it('leaves writable the register, the scope, the operations target, the sources, the approvals and the baselines', async () => {
		const projectId = await project([published]);
		for (const path of ['/api/draft/rules', '/api/draft/rules/engine-issues', '/api/draft/scope', '/api/draft/foundation/operations', '/api/draft/documents', '/api/draft/approvals', '/api/draft/baselines', '/api/draft/coherence']) {
			expect((await write(path, projectId)).reached, path).toBe(true);
		}
	});

	it('writes a draft an Evolution request carries, and a person goes through as before', async () => {
		const projectId = await project([published]);
		expect((await write('/api/behavior/apply', projectId, { method: 'POST', body: { featureId: 'draft:abc', operations: [] } })).reached).toBe(true);
		expect((await write('/api/draft/data', projectId, { ai: false })).reached).toBe(true);
	});

	it('takes the writes of a draft specification', async () => {
		expect((await write('/api/draft/data', await project([]))).reached).toBe(true);
	});

	it('refuses the AI while Lyriks writes the validated changes: nothing but them enters [criterion:c3f9ddbb]', async () => {
		const answer = await write('/api/draft/features', await project([published, later({ holds: true, writingOpenedAt: '2026-11-23T10:00:00.000Z' })]));
		expect(answer.status).toBe(409);
		expect(answer.message).toBe(WRITES_HELD);
	});

	it('still holds every write of a later run until its changes are validated, with its own sentence', async () => {
		const answer = await write('/api/draft/rules', await project([published, later({ holds: true })]));
		expect(answer.status).toBe(409);
		expect(answer.message).toMatch(/^This Reverse-Specification writes nothing until/);
	});

	it('names the frozen addresses and nothing else', () => {
		const frozen = (path: string) => frozenOnceValidated(new URL(`http://x${path}`));
		expect(frozen('/api/draft/data')).toBe(true);
		expect(frozen('/api/draft/foundation/operations')).toBe(false);
		expect(frozen('/api/draft/rules')).toBe(false);
		expect(frozen('/api/behavior/implementation/index')).toBe(false);
	});
});
