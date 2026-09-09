import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * The dashboard's "Duplicate project" action. What matters here is the wiring,
 * not the copy itself: the copy has to go through the SAME export/import pair
 * the portable bundle uses, keep the source's domain, and be owned before the
 * request ends.
 */

const importCalls: { mode: string; name?: string; domainId?: unknown; bytes: Uint8Array }[] = [];
const owned: string[] = [];
const mirrored: string[] = [];
const primed: string[] = [];
const audits: { action: string; outcome: string; target?: string }[] = [];

let bundle: {
	fileName: string;
	bytes: Uint8Array;
	projectName: string;
	warnings: string[];
} | null = {
	fileName: 'expensa-2026-08-21.lyriks.zip',
	bytes: new Uint8Array([1, 2, 3]),
	projectName: 'Expensa',
	warnings: []
};
let importResult: { ok: true; projectId: string; name: string; warnings: string[] } | { ok: false; error: string } = {
	ok: true,
	projectId: 'expensa-copy-ab12cd',
	name: 'Expensa (copy)',
	warnings: []
};

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		exportProject: { execute: async () => bundle },
		importProject: {
			execute: async (request: { bytes: Uint8Array; mode: string; name?: string; domainId?: unknown }) => {
				importCalls.push({ ...request, domainId: 'domainId' in request ? request.domainId : undefined });
				return importResult;
			}
		},
		scheduleBackSync: async (id: string) => {
			mirrored.push(id);
		},
		primeProjectAnalysis: async (id: string) => {
			primed.push(id);
		},
		audit: {
			record: (entry: { action: string; outcome: string; target?: string }) => audits.push(entry)
		}
	})
}));

vi.mock('$lib/server/project-access.server', () => ({
	requireProjectAccess: vi.fn(async () => {})
}));

vi.mock('$lib/server/new-project-ownership.server', () => ({
	ownNewProject: vi.fn(async (_locals: unknown, projectId: string) => {
		owned.push(projectId);
	})
}));

const { actions } = await import('./+page.server');
const { requireProjectAccess } = await import('$lib/server/project-access.server');

function event(fields: Record<string, string>): RequestEvent {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return {
		request: new Request('http://localhost/?/duplicateProject', { method: 'POST', body }),
		locals: { session: { email: 'ada@example.com' }, authRequired: true }
	} as unknown as RequestEvent;
}

const duplicate = (fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.duplicateProject as any)(event(fields));

describe('duplicateProject action', () => {
	beforeEach(() => {
		importCalls.length = 0;
		owned.length = 0;
		mirrored.length = 0;
		primed.length = 0;
		audits.length = 0;
		bundle = {
			fileName: 'expensa-2026-08-21.lyriks.zip',
			bytes: new Uint8Array([1, 2, 3]),
			projectName: 'Expensa',
			warnings: []
		};
		importResult = {
			ok: true,
			projectId: 'expensa-copy-ab12cd',
			name: 'Expensa (copy)',
			warnings: []
		};
	});

	it('imports the exported bundle as a copy, keeping the source domain', async () => {
		const result = await duplicate({ projectId: 'expensa' });

		expect(importCalls).toHaveLength(1);
		expect(importCalls[0].mode).toBe('copy');
		expect(importCalls[0].name).toBe('Expensa (copy)');
		expect(importCalls[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
		// Absent (not null): null would file the copy nowhere, absent keeps the
		// bundle's own domain, which is where its original lives.
		expect(importCalls[0].domainId).toBeUndefined();
		expect(result).toEqual({
			duplicated: 'expensa-copy-ab12cd',
			name: 'Expensa (copy)',
			warnings: []
		});
	});

	it('requires a writer on the source, then owns + mirrors the copy', async () => {
		await duplicate({ projectId: 'expensa' });

		expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'expensa', 'write');
		expect(owned).toEqual(['expensa-copy-ab12cd']);
		expect(mirrored).toEqual(['expensa-copy-ab12cd']);
		// The copy must READ like its original on the first render, not once
		// someone has opened it: its derived layers are computed before we answer.
		expect(primed).toEqual(['expensa-copy-ab12cd']);
		expect(audits).toEqual([
			{
				action: 'project.duplicate',
				actor: 'ada@example.com',
				target: 'expensa-copy-ab12cd',
				outcome: 'success',
				detail: 'copy of expensa'
			}
		]);
	});

	it('carries both halves of the report back to the person who clicked', async () => {
		bundle!.warnings = ['Two kernel files claimed one feature id.'];
		importResult = {
			ok: true,
			projectId: 'expensa-copy-ab12cd',
			name: 'Expensa (copy)',
			warnings: ['Created domain "Finance" for the import.']
		};

		const result = await duplicate({ projectId: 'expensa' });

		expect(result.warnings).toEqual([
			'Two kernel files claimed one feature id.',
			'Created domain "Finance" for the import.'
		]);
	});

	it('refuses without a project id, and never touches the store', async () => {
		const failure = await duplicate({});
		expect(failure.status).toBe(400);
		expect(importCalls).toHaveLength(0);
	});

	it('answers 404 when the project has no bundle to export', async () => {
		bundle = null;
		const failure = await duplicate({ projectId: 'ghost' });
		expect(failure.status).toBe(404);
		expect(importCalls).toHaveLength(0);
		expect(owned).toEqual([]);
	});

	it('surfaces the import refusal instead of owning a half-made copy', async () => {
		importResult = { ok: false, error: 'Could not mint a free project id for "Expensa".' };
		const failure = await duplicate({ projectId: 'expensa' });

		expect(failure.status).toBe(400);
		expect(failure.data.message).toBe('Could not mint a free project id for "Expensa".');
		expect(owned).toEqual([]);
		expect(mirrored).toEqual([]);
		expect(primed).toEqual([]);
		expect(audits[0]).toMatchObject({ action: 'project.duplicate', outcome: 'failure' });
	});
});
