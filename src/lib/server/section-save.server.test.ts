import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { error, isHttpError } from '@sveltejs/kit';
import type { AccessDecision, DraftLockPort, SectionDraftSaveOptions } from '$application/ports';
import { saveSectionDraft, type SectionSaveSpec } from './section-save.server';
import { requestEvent, servicesWith } from './request-event.fixture';
import { subscribeSectionChanges, type SectionChange } from './sync-bus.server';

/**
 * The protocol every `PUT /api/draft/<section>` follows, over an in-memory
 * revision lock and section store, the real access gate and the real live bus.
 * Each test reads what the save left behind: the stored section, the revision,
 * what was mirrored to the Back and what the other tabs were told.
 */

const PROJECT = 'p-shop';

/** One installation: a revision lock, a section store, the Back mirror, the projects that exist. */
function installation(opts: { decision?: AccessDecision; exists?: boolean; rollbackFails?: boolean; mirrorFails?: boolean } = {}) {
	const revisions = new Map<string, number>();
	const stored = new Map<string, unknown>();
	const mirrored: string[] = [];
	const draftLock = {
		current: async (projectId: string, section: string) => revisions.get(`${projectId}/${section}`) ?? 0,
		commit: async (projectId: string, section: string, expected: number | null) => {
			const now = revisions.get(`${projectId}/${section}`) ?? 0;
			if (expected !== null && expected !== now) return null;
			revisions.set(`${projectId}/${section}`, now + 1);
			return now + 1;
		},
		rollback: async (projectId: string, section: string, revision: number) => {
			if (opts.rollbackFails) throw new Error('lock table gone');
			if (revisions.get(`${projectId}/${section}`) === revision) revisions.set(`${projectId}/${section}`, revision - 1);
		}
	} satisfies DraftLockPort;
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => opts.decision ?? { ok: true } },
		enterpriseHooks: null,
		projectExists: async (id) => (opts.exists ?? true) && id === PROJECT,
		draftLock,
		foundationWrites: { withLock: async (_key, run) => run() },
		scheduleBackSync: async (projectId) => {
			if (opts.mirrorFails) throw new Error('back is down');
			mirrored.push(projectId);
		}
	});
	return { services, revisions, stored, mirrored, revisionOf: (section: string) => revisions.get(`${PROJECT}/${section}`) ?? 0 };
}

type Installation = ReturnType<typeof installation>;

/** A section whose parser keeps the title and whose store is the installation's. */
function section(at: Installation, name = 'rules', extra: Partial<SectionSaveSpec<{ projectId: string; title: string }, object>> = {}) {
	return {
		section: name,
		parse: (body: unknown, projectId: string) => {
			const title = (body as { title?: unknown }).title;
			if (typeof title !== 'string') throw new Error('title is required');
			return { projectId, title };
		},
		persist: async (draft: { projectId: string; title: string }) => {
			at.stored.set(name, draft);
			return { savedAt: '2026-11-18T03:00:00.000Z' };
		},
		...extra
	} satisfies SectionSaveSpec<{ projectId: string; title: string }, object>;
}

/** An atomic section: its own store keeps the revision and refuses a stale one. */
function atomicSection(at: Installation) {
	let revision = 3;
	return section(at, 'experience', {
		atomic: true,
		persist: async (draft, _services, _projectId, save: SectionDraftSaveOptions) => {
			if (save.expectedRevision !== null && save.expectedRevision !== revision) return null;
			revision += 1;
			at.stored.set('experience', { ...draft, origin: save.origin });
			return { savedAt: 'now', revision };
		}
	});
}

const announced: SectionChange[] = [];
const unsubscribe = subscribeSectionChanges((change) => {
	if (change.projectId === PROJECT) announced.push(change);
});

function put(at: Installation, body: unknown, headers: Record<string, string> = {}) {
	return requestEvent({
		path: '/api/draft/rules',
		method: 'PUT',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json', 'x-lyriks-client': 'tab-1', ...headers },
		authRequired: true,
		services: at.services,
		cookies: { lyriks_session: 'jwt' }
	});
}

async function save<T extends object>(at: Installation, spec: SectionSaveSpec<{ projectId: string; title: string }, T>, body: unknown, headers: Record<string, string> = {}) {
	return saveSectionDraft(put(at, body, headers), spec).then(
		async (response) => ({ status: response.status, body: await response.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
}

afterEach(() => {
	announced.length = 0;
	vi.restoreAllMocks();
});

describe('saving a section', () => {
	it('stores the parsed section, answers its new revision, mirrors it to the Back and tells the other tabs', async () => {
		const at = installation();
		const answer = await save(at, section(at), { projectId: PROJECT, title: 'Refunds' });
		expect(answer).toEqual({ status: 200, body: { savedAt: '2026-11-18T03:00:00.000Z', revision: 1 } });
		expect(at.stored.get('rules')).toEqual({ projectId: PROJECT, title: 'Refunds' });
		expect(at.revisionOf('rules')).toBe(1);
		expect(at.mirrored).toEqual([PROJECT]);
		expect(announced).toEqual([{ projectId: PROJECT, section: 'rules', origin: 'tab-1' }]);
	});

	it('requires the project id before touching anything', async () => {
		const at = installation();
		expect((await save(at, section(at), { title: 'Refunds' })).status).toBe(400);
		expect(at.stored.size).toBe(0);
		expect(announced).toEqual([]);
	});

	it('refuses a caller who may not write the project, writing nothing', async () => {
		const at = installation({ decision: { ok: false, reason: 'forbidden' } });
		expect((await save(at, section(at), { projectId: PROJECT, title: 'Refunds' })).status).toBe(403);
		expect(at.stored.size).toBe(0);
		expect(at.revisionOf('rules')).toBe(0);
	});

	it('refuses a section written for a project that does not exist, writing nothing', async () => {
		const at = installation({ exists: false });
		const answer = await save(at, section(at), { projectId: PROJECT, title: 'Refunds' });
		expect(answer.status).toBe(404);
		expect(String((answer.body as { message: string }).message)).toContain('does not exist');
		expect(at.stored.size).toBe(0);
		expect(at.revisionOf('rules')).toBe(0);
	});

	it('lets Foundation through for an unknown project, since it is what creates it', async () => {
		const at = installation({ exists: false });
		const answer = await save(at, section(at, 'foundation'), { projectId: PROJECT, title: 'Shop' });
		expect(answer.status).toBe(200);
		expect(at.stored.get('foundation')).toEqual({ projectId: PROJECT, title: 'Shop' });
	});

	it('consumes no revision and stores nothing when the body does not validate or parse', async () => {
		const at = installation();
		const refusing = section(at, 'rules', { validate: async () => Promise.reject(new Error('unresolved capability')) });
		await expect(save(at, refusing, { projectId: PROJECT, title: 'Refunds' })).rejects.toThrow('unresolved capability');
		await expect(save(at, section(at), { projectId: PROJECT })).rejects.toThrow('title is required');
		expect(at.revisionOf('rules')).toBe(0);
		expect(at.stored.size).toBe(0);
		expect(announced).toEqual([]);
	});

	it('answers 409 to an edit made on a revision someone else already replaced, storing nothing', async () => {
		const at = installation();
		await save(at, section(at), { projectId: PROJECT, title: 'First' });
		const stale = await save(at, section(at), { projectId: PROJECT, title: 'Stale' }, { 'x-lyriks-rev': '0' });
		expect(stale.status).toBe(409);
		expect(at.stored.get('rules')).toEqual({ projectId: PROJECT, title: 'First' });
		expect(at.revisionOf('rules')).toBe(1);
	});

	it('gives the revision back and tells nobody when the store fails', async () => {
		const at = installation();
		const failing = section(at, 'rules', { persist: async () => Promise.reject(new Error('disk on fire')) });
		const answer = await save(at, failing, { projectId: PROJECT, title: 'Refunds' });
		expect(answer.status).toBe(500);
		expect(String((answer.body as { message: string }).message)).toMatch(/kernel_write_failed \[rules\]: disk on fire/);
		expect(at.revisionOf('rules')).toBe(0);
		expect(at.mirrored).toEqual([]);
		expect(announced).toEqual([]);
	});

	it('passes a refusal the store answers with its own status through unchanged, and gives the revision back', async () => {
		const at = installation();
		const refusing = section(at, 'rules', { persist: async () => error(422, 'A rule names a state no surface declares.') });
		expect(await save(at, refusing, { projectId: PROJECT, title: 'Refunds' })).toEqual({ status: 422, body: { message: 'A rule names a state no surface declares.' } });
		expect(at.revisionOf('rules')).toBe(0);
	});

	it('still reports the store failure when giving the revision back fails too', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const at = installation({ rollbackFails: true });
		const failing = section(at, 'rules', { persist: async () => Promise.reject(new Error('disk on fire')) });
		expect((await save(at, failing, { projectId: PROJECT, title: 'Refunds' })).status).toBe(500);
	});

	it('answers the save even when the Back mirror fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const at = installation({ mirrorFails: true });
		expect((await save(at, section(at), { projectId: PROJECT, title: 'Refunds' })).status).toBe(200);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('envelope mirror dispatch failed'), 'back is down');
	});

	it('mirrors nothing for a section that opts out, and still tells the other tabs', async () => {
		const at = installation();
		await save(at, section(at, 'rules', { mirror: false }), { projectId: PROJECT, title: 'Refunds' });
		expect(at.mirrored).toEqual([]);
		expect(announced).toHaveLength(1);
	});
});

describe('saving an atomic section', () => {
	it('lets its store keep the revision: the store answers it, the lock is left alone', async () => {
		const at = installation();
		const answer = await save(at, atomicSection(at), { projectId: PROJECT, title: 'Journeys' }, { 'x-lyriks-rev': '3' });
		expect(answer).toEqual({ status: 200, body: { savedAt: 'now', revision: 4 } });
		expect(at.stored.get('experience')).toEqual({ projectId: PROJECT, title: 'Journeys', origin: 'tab-1' });
		expect(at.revisionOf('experience')).toBe(0);
		expect(at.mirrored).toEqual([PROJECT]);
	});

	it('answers 409 when its store refuses a stale revision, mirroring nothing', async () => {
		const at = installation();
		const stale = await save(at, atomicSection(at), { projectId: PROJECT, title: 'Journeys' }, { 'x-lyriks-rev': '1' });
		expect(stale.status).toBe(409);
		expect(at.stored.size).toBe(0);
		expect(at.mirrored).toEqual([]);
	});
});

afterAll(unsubscribe);
