import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type RequestEvent } from '@sveltejs/kit';
import { saveSectionDraft } from './section-save.server';

const calls: string[] = [];

const rollback = vi.fn(async () => {
	calls.push('rollback');
});
const scheduleBackSync = vi.fn(async () => {
	calls.push('mirror');
});

let projectExistsResult = true;
const projectExists = vi.fn(async () => {
	calls.push('exists');
	return projectExistsResult;
});

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		draftLock: { rollback },
		scheduleBackSync,
		projectExists
	})
}));

vi.mock('$lib/server/project-access.server', () => ({
	requireProjectAccess: vi.fn(async () => {
		calls.push('access');
	})
}));

vi.mock('$lib/server/draft-lock.server', () => ({
	commitRevision: vi.fn(async () => {
		calls.push('commit');
		return 7;
	}),
	expectedRevision: vi.fn((request: Request) => {
		const raw = request.headers.get('x-lyriks-draft-revision');
		return raw === null ? null : Number(raw);
	})
}));

vi.mock('$lib/server/sync-bus.server', () => ({
	publishSectionChange: vi.fn(() => {
		calls.push('publish');
	})
}));

function makeEvent(body: unknown): RequestEvent {
	const request = new Request('http://localhost/api/draft/test', {
		method: 'PUT',
		headers: { 'content-type': 'application/json', 'x-lyriks-client': 'tab-1' },
		body: JSON.stringify(body)
	});
	return { request } as unknown as RequestEvent;
}

const baseSpec = () => ({
	section: 'test',
	parse: vi.fn((_body: unknown, projectId: string) => {
		calls.push('parse');
		return { projectId };
	}),
	persist: vi.fn(async () => {
		calls.push('persist');
		return { savedAt: 'now' };
	})
});

describe('saveSectionDraft', () => {
	beforeEach(() => {
		calls.length = 0;
		projectExistsResult = true;
		vi.clearAllMocks();
	});

	it('runs the protocol in order and echoes result + revision', async () => {
		const spec = baseSpec();
		const res = await saveSectionDraft(makeEvent({ projectId: 'p1' }), spec);
		expect(await res.json()).toEqual({ savedAt: 'now', revision: 7 });
		// Parse must precede the revision bump; publish must follow the persist.
		expect(calls).toEqual(['access', 'exists', 'parse', 'commit', 'persist', 'mirror', 'publish']);
	});

	it('rejects a missing projectId before touching anything', async () => {
		await expect(saveSectionDraft(makeEvent({}), baseSpec())).rejects.toSatisfy(
			(e: unknown) => isHttpError(e) && e.status === 400
		);
		expect(calls).toEqual([]);
	});

	// Auth off (standalone appliance, dev) makes requireProjectAccess a no-op, so
	// this is the only thing standing between a mistyped id and a section saved
	// under a project no catalog lists — a 200 whose work is invisible everywhere.
	it('refuses a section written for a project that does not exist', async () => {
		projectExistsResult = false;
		await expect(saveSectionDraft(makeEvent({ projectId: 'ghost' }), baseSpec())).rejects.toSatisfy(
			(e: unknown) => isHttpError(e) && e.status === 404 && /does not exist/.test(e.body.message)
		);
		expect(calls).toEqual(['access', 'exists']);
		expect(rollback).not.toHaveBeenCalled();
	});

	// Foundation is what brings a project into being, so it cannot require one.
	it('lets Foundation through for an unknown project — it is what creates it', async () => {
		projectExistsResult = false;
		const spec = { ...baseSpec(), section: 'foundation' };
		const res = await saveSectionDraft(makeEvent({ projectId: 'brand-new' }), spec);
		expect(await res.json()).toEqual({ savedAt: 'now', revision: 7 });
		expect(calls).not.toContain('exists');
	});

	it('does not consume a revision when validate or parse throws', async () => {
		const spec = {
			...baseSpec(),
			validate: () => {
				throw new Error('invalid body');
			}
		};
		await expect(saveSectionDraft(makeEvent({ projectId: 'p1' }), spec)).rejects.toThrow(
			'invalid body'
		);
		expect(calls).not.toContain('commit');
		expect(rollback).not.toHaveBeenCalled();
	});

	it('rolls the revision bump back when persistence fails, and never publishes', async () => {
		const spec = baseSpec();
		spec.persist.mockRejectedValueOnce(new Error('disk on fire'));
		await expect(saveSectionDraft(makeEvent({ projectId: 'p1' }), spec)).rejects.toSatisfy(
			(e: unknown) => isHttpError(e) && e.status === 500 && /kernel_write_failed/.test(e.body.message)
		);
		expect(rollback).toHaveBeenCalledWith('p1', 'test', 7);
		expect(calls).not.toContain('publish');
		expect(calls).not.toContain('mirror');
	});

	it('still surfaces the persist error when the rollback itself fails', async () => {
		const spec = baseSpec();
		spec.persist.mockRejectedValueOnce(new Error('disk on fire'));
		rollback.mockRejectedValueOnce(new Error('lock table gone'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(saveSectionDraft(makeEvent({ projectId: 'p1' }), spec)).rejects.toSatisfy(
			(e: unknown) => isHttpError(e) && e.status === 500
		);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('rollback failed'), expect.anything());
		warn.mockRestore();
	});

	it('answers the save even when the Back mirror rejects (fire-and-forget)', async () => {
		const spec = baseSpec();
		scheduleBackSync.mockRejectedValueOnce(new Error('back is down'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const res = await saveSectionDraft(makeEvent({ projectId: 'p1' }), spec);
		expect(await res.json()).toEqual({ savedAt: 'now', revision: 7 });
		// Let the detached mirror promise settle; its rejection must be handled.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('envelope mirror dispatch failed'),
			expect.anything()
		);
		warn.mockRestore();
	});

	it('skips the Back mirror when the spec opts out', async () => {
		const spec = { ...baseSpec(), mirror: false };
		await saveSectionDraft(makeEvent({ projectId: 'p1' }), spec);
		expect(calls).toContain('publish');
		expect(calls).not.toContain('mirror');
	});

	describe('atomic (consolidated) sections', () => {
		const atomicSpec = () => ({
			...baseSpec(),
			atomic: true,
			persist: vi.fn(
				async (
					_draft: unknown,
					_services: unknown,
					_projectId: string,
					_save: { expectedRevision: number | null; origin: string | null }
				) => {
					calls.push('persist');
					return { savedAt: 'now', revision: 8 };
				}
			)
		});

		it('lets persist own the whole save — no lock commit, no separate publish', async () => {
			const spec = atomicSpec();
			const res = await saveSectionDraft(makeEvent({ projectId: 'p1' }), spec);
			expect(await res.json()).toEqual({ savedAt: 'now', revision: 8 });
			expect(calls).toEqual(['access', 'exists', 'parse', 'persist', 'mirror']);
			// The client's revision + writer id are handed to the atomic save.
			expect(spec.persist).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'p1', {
				expectedRevision: null,
				origin: 'tab-1'
			});
		});

		it('answers 409 when the atomic save reports a stale revision', async () => {
			const spec = atomicSpec();
			spec.persist.mockResolvedValueOnce(null as never);
			await expect(saveSectionDraft(makeEvent({ projectId: 'p1' }), spec)).rejects.toSatisfy(
				(e: unknown) => isHttpError(e) && e.status === 409
			);
			expect(calls).not.toContain('mirror');
			expect(rollback).not.toHaveBeenCalled();
		});

		it('never touches the legacy lock when the atomic persist fails', async () => {
			const spec = atomicSpec();
			spec.persist.mockRejectedValueOnce(new Error('disk on fire'));
			await expect(saveSectionDraft(makeEvent({ projectId: 'p1' }), spec)).rejects.toSatisfy(
				(e: unknown) => isHttpError(e) && e.status === 500
			);
			expect(rollback).not.toHaveBeenCalled();
			expect(calls).not.toContain('commit');
		});
	});
});
