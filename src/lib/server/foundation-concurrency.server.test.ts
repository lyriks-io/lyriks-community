import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isHttpError } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft, createEmptyOperationsDraft, type FoundationIdentityDraft, type ProjectFoundationDraft } from '$domain/foundation';
import { FsProjectLock } from '$infrastructure/behavior/fs-project-lock.server';
import { applySpecEdit } from './spec360-edits.server';
import { saveSectionDraft, type SectionSaveSpec } from './section-save.server';
import { GET } from '../../routes/api/sections/+server';

vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: async () => {} }));
vi.mock('$lib/server/sync-bus.server', () => ({ publishSectionChange: () => {} }));

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

async function harness() {
	const root = await mkdtemp(join(tmpdir(), 'lyriks-foundation-lock-'));
	roots.push(root);
	let foundation: ProjectFoundationDraft = {
		projectId: 'p',
		identity: { ...createEmptyIdentityDraft('p'), productName: 'Original', brief: 'Original summary' },
		definition: createEmptyDefinitionDraft('p'),
		operations: createEmptyOperationsDraft('p')
	};
	const revisions = new Map<string, number>();
	let beforeIdentityWrite = async () => {};
	const identityReads: string[] = [];
	const base = {
		projectExists: async () => true,
		loadFoundationDraft: {
			execute: async () => structuredClone(foundation),
			loadIdentity: async () => { identityReads.push(foundation.identity.productName); return structuredClone(foundation.identity); },
			loadDefinition: async () => structuredClone(foundation.definition)
		},
		saveFoundationDraft: {
			saveIdentity: async (identity: FoundationIdentityDraft) => {
				await beforeIdentityWrite();
				foundation = { ...foundation, identity: structuredClone(identity) };
				return { savedAt: 'now' };
			}
		},
		syncBehaviorProject: { execute: async () => {} },
		draftLock: {
			current: async (_id: string, section: string) => revisions.get(section) ?? 0,
			commit: async (_id: string, section: string, expected: number | null) => {
				const current = revisions.get(section) ?? 0;
				if (expected !== null && expected !== current) return null;
				revisions.set(section, current + 1);
				return current + 1;
			},
			rollback: async (_id: string, section: string, committed: number) => {
				if (revisions.get(section) === committed) revisions.set(section, committed - 1);
			}
		},
		sectionDocuments: { load: async () => null, currentRevision: async () => 0, save: async () => 1 },
		scheduleBackSync: async () => {}
	};
	// Independent lock objects emulate different Platform processes on one volume.
	const services = { ...base, foundationWrites: new FsProjectLock(root, { retryMs: 1 }) } as unknown as AppServices;
	const other = { ...base, foundationWrites: new FsProjectLock(root, { retryMs: 1 }) } as unknown as AppServices;
	const wholeSpec: SectionSaveSpec<ProjectFoundationDraft, { savedAt: string }> = {
		section: 'foundation',
		parse: (body) => body as ProjectFoundationDraft,
		persist: async (draft) => { foundation = structuredClone(draft); return { savedAt: 'now' }; }
	};
	const event = (draft: unknown, revision = 0, s = other) => ({
		request: new Request('http://localhost/api/draft/foundation', {
			method: 'PUT', headers: { 'x-lyriks-rev': String(revision) }, body: JSON.stringify(draft)
		}),
		locals: { services: s }
	}) as never;
	const inline = () => applySpecEdit(services, 'p', { op: 'edit', anchor: 'product', text: 'Inline summary' }, { id: 'writer', name: 'Writer' }, null);
	return { services, other, revisions, identityReads, wholeSpec, event, inline,
		read: () => structuredClone(foundation),
		pauseIdentity: (fn: () => Promise<void>) => { beforeIdentityWrite = fn; }
	};
}

describe('Foundation shared revision and persistence boundary', () => {
	it('refuses a stale whole write after an inline edit started first [unspa:588c4fbf:b01cabe6:29067067]', async () => {
		const h = await harness();
		const stale = h.read();
		const entered = deferred();
		const release = deferred();
		h.pauseIdentity(async () => { entered.resolve(); await release.promise; });
		const inline = h.inline();
		await entered.promise;
		let wholePersisted = false;
		const save = saveSectionDraft(h.event(stale), { ...h.wholeSpec, persist: async () => { wholePersisted = true; return { savedAt: 'now' }; } });
		const refusal = expect(save).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 409);
		release.resolve();
		await inline;
		await refusal;
		expect(wholePersisted).toBe(false);
		expect(h.read().identity.brief).toBe('Inline summary');
		expect(h.revisions.get('foundation')).toBe(1);
		expect(h.revisions.has('foundation.identity')).toBe(false);
	});

	it('reads a preceding whole save before applying an inline change [criterion:af33b4c8]', async () => {
		const h = await harness();
		const next = h.read();
		next.identity.productName = 'Whole write';
		next.definition.businessObjective.mainProblem = 'New problem';
		const entered = deferred();
		const release = deferred();
		const whole = saveSectionDraft(h.event(next), { ...h.wholeSpec, persist: async (...args) => {
			entered.resolve(); await release.promise; return h.wholeSpec.persist(...args);
		} });
		await entered.promise;
		const inline = h.inline();
		await Promise.resolve();
		expect(h.identityReads).toEqual([]);
		release.resolve();
		await whole;
		await inline;
		expect(h.read().identity).toMatchObject({ productName: 'Whole write', brief: 'Inline summary' });
		expect(h.read().definition.businessObjective.mainProblem).toBe('New problem');
		expect(h.revisions.get('foundation')).toBe(2);
	});

	it('refuses an older slice save after a whole Foundation write [unspa:588c4fbf:f201d278:13acd523]', async () => {
		const h = await harness();
		await saveSectionDraft(h.event(h.read()), h.wholeSpec);
		const persist = vi.fn(async () => ({ savedAt: 'now' }));
		await expect(saveSectionDraft(h.event(h.read().identity), { section: 'foundation.identity', parse: (body) => body, persist })).rejects.toSatisfy(
			(e: unknown) => isHttpError(e) && e.status === 409);
		expect(persist).not.toHaveBeenCalled();
	});

	it('waits for persistence before returning a revision with its Foundation document', async () => {
		const h = await harness();
		const next = h.read(); next.identity.productName = 'Saved';
		const entered = deferred(); const release = deferred();
		const whole = saveSectionDraft(h.event(next), { ...h.wholeSpec, persist: async (...args) => {
			entered.resolve(); await release.promise; return h.wholeSpec.persist(...args);
		} });
		await entered.promise;
		let readFinished = false;
		const read = Promise.resolve(GET({ url: new URL('http://localhost/api/sections?projectId=p&section=foundation'), locals: { services: h.services } } as never)).then((result) => { readFinished = true; return result; });
		await Promise.resolve();
		expect(readFinished).toBe(false);
		release.resolve(); await whole;
		expect(await (await read).json()).toMatchObject({ revision: 1, draft: { identity: { productName: 'Saved' } } });
	});

	it('gives Operations the shared Foundation revision while retaining its own storage transaction', async () => {
		const h = await harness();
		const persist = vi.fn(async () => ({ savedAt: 'now', revision: 42 }));
		const response = await saveSectionDraft(h.event({ projectId: 'p' }), { section: 'foundation.operations', atomic: true, parse: (body) => body, persist });
		expect(await response.json()).toEqual({ savedAt: 'now', revision: 1 });
		expect(persist).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'p', { expectedRevision: null, origin: null });
		expect(h.revisions.get('foundation')).toBe(1);
	});
});
