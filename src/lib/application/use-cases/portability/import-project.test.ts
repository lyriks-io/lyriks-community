import { describe, expect, it, vi } from 'vitest';
import { buildBundle, emptyRowSnapshot, type ProjectSnapshot } from '$domain/portability';
import type {
	ArchiveCodecPort,
	BehaviorRepositoryPort,
	ClockPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
	ProjectLockPort,
	ProjectPortabilityStorePort,
	ReconciliationStorePort
} from '$application/ports';
import { ImportProjectUseCase } from './import-project';
import { ProjectScopeRefusedError } from '$application/portfolio/project-creation-scope';
import { locked, type ScopeCheck } from '$domain/licensing';

/**
 * Identity of a copy. A copy is a NEW project, so the one thing it must never
 * do is land on an id something else already answers to: it would inherit that
 * project's rows, or take over its kernel folder (`promoteCanonical` moves what
 * it finds into the quarantine) and serve someone else's behavior.
 */

const hash = (bytes: Uint8Array): string => {
	let h = 0x811c9dc5;
	for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
	return h.toString(16).padStart(8, '0');
};

/** Container-free stand-in for the zip: the codec is not what is under test. */
const archive: ArchiveCodecPort = {
	encode: (entries) =>
		new TextEncoder().encode(
			JSON.stringify(entries.map((e) => [e.path, [...e.bytes]] as const))
		),
	decode: (bytes) =>
		new Map(
			(JSON.parse(new TextDecoder().decode(bytes)) as [string, number[]][]).map(([p, b]) => [
				p,
				new Uint8Array(b)
			])
		)
};

function bundleOf(projectId = 'billos-a1b2c3'): Uint8Array {
	const snapshot: ProjectSnapshot = {
		projectId,
		name: 'Billos',
		description: 'Invoicing',
		rows: {
			...emptyRowSnapshot(),
			legacyDocuments: { project_drafts: { projectId, productName: 'Billos', brief: 'Invoicing' } }
		},
		kernel: {
			project: { id: projectId, name: 'Billos' },
			features: [{ id: 'feat-invoice', feature: { id: 'feat-invoice', name: 'Invoice' } }]
		},
		domain: null
	};
	return archive.encode(
		buildBundle({ snapshot, exportedAt: '2026-08-21T10:00:00.000Z', appVersion: 'test', hash })
	);
}

/** Everything the use-case writes through, with the takenness of ids scripted. */
function harness(
	taken: { rows?: string[]; kernel?: string[] } = {},
	suffixes = ['aaaaaa'],
	scope?: { execute: () => Promise<ScopeCheck> }
) {
	const written: string[] = [];
	const promoted: string[] = [];
	const removed: string[] = [];

	const rows: ProjectPortabilityStorePort = {
		read: async () => emptyRowSnapshot(),
		exists: async (id) => (taken.rows ?? []).includes(id),
		write: async (id) => {
			written.push(id);
		}
	};
	const kernel = {
		loadCandidates: async () => [],
		promoteCanonical: async (input: { canonicalKernelId: string }) => {
			promoted.push(input.canonicalKernelId);
		},
		quarantine: async () => null
	} as unknown as ReconciliationStorePort;
	const behavior = {
		// A kernel folder with no rows still owns its id.
		loadProject: async (id: string) =>
			(taken.kernel ?? []).includes(id) ? { project: { id } } : null,
		deleteProject: async (id: string) => {
			removed.push(id);
		}
	} as unknown as BehaviorRepositoryPort;
	const catalog = { remove: async () => {} } as unknown as ProjectCatalogPort;
	const portfolio = {
		listDomains: async () => [],
		saveDomain: async () => {}
	} as unknown as PortfolioRepositoryPort;
	const lock: ProjectLockPort = {
		withLock: async (_id: string, fn: () => Promise<unknown>) => fn()
	} as unknown as ProjectLockPort;
	const clock: ClockPort = { nowIso: () => '2026-08-21T10:00:00.000Z' } as ClockPort;

	let next = 0;
	const useCase = new ImportProjectUseCase(
		rows,
		kernel,
		behavior,
		catalog,
		portfolio,
		lock,
		archive,
		clock,
		() => suffixes[Math.min(next++, suffixes.length - 1)],
		scope
	);
	return { useCase, written, promoted, removed, rows, portfolio, lock, attempts: () => next };
}

describe('ImportProjectUseCase, minting a copy id', () => {
	it('mints from the copy name plus a random suffix', async () => {
		const { useCase, written, promoted } = harness({}, ['a1b2c3']);

		const result = await useCase.execute({ bytes: bundleOf(), mode: 'copy', name: 'Expensa' });

		expect(result).toMatchObject({ ok: true, projectId: 'expensa-a1b2c3' });
		expect(written).toEqual(['expensa-a1b2c3']);
		expect(promoted).toEqual(['expensa-a1b2c3']);
	});

	it('re-rolls past an id whose rows already exist', async () => {
		const { useCase, written } = harness({ rows: ['expensa-aaaaaa'] }, ['aaaaaa', 'bbbbbb']);

		const result = await useCase.execute({ bytes: bundleOf(), mode: 'copy', name: 'Expensa' });

		expect(result).toMatchObject({ ok: true, projectId: 'expensa-bbbbbb' });
		expect(written).toEqual(['expensa-bbbbbb']);
	});

	it('re-rolls past an id owned only by a kernel folder', async () => {
		// No rows, but a behavior workspace on disk: importing there would
		// quarantine it and hand the copy its features.
		const { useCase, promoted } = harness({ kernel: ['expensa-aaaaaa'] }, ['aaaaaa', 'bbbbbb']);

		const result = await useCase.execute({ bytes: bundleOf(), mode: 'copy', name: 'Expensa' });

		expect(result).toMatchObject({ ok: true, projectId: 'expensa-bbbbbb' });
		expect(promoted).toEqual(['expensa-bbbbbb']);
	});

	it('refuses without writing when every attempt collides', async () => {
		const { useCase, written, promoted } = harness({ rows: ['expensa-aaaaaa'] }, ['aaaaaa']);

		const result = await useCase.execute({ bytes: bundleOf(), mode: 'copy', name: 'Expensa' });

		expect(result).toEqual({
			ok: false,
			error: 'Could not mint a free project id for "Expensa". Please try again.'
		});
		expect(written).toEqual([]);
		expect(promoted).toEqual([]);
	});

	it('keeps the bundle id on restore, and still guards an existing project', async () => {
		const { useCase, written } = harness({ rows: ['billos-a1b2c3'] });

		const refused = await useCase.execute({ bytes: bundleOf(), mode: 'restore' });
		expect(refused).toMatchObject({ ok: false });
		expect(written).toEqual([]);

		const forced = await useCase.execute({ bytes: bundleOf(), mode: 'restore', overwrite: true });
		expect(forced).toMatchObject({ ok: true, projectId: 'billos-a1b2c3' });
		expect(written).toEqual(['billos-a1b2c3']);
	});
});

describe('ImportProjectUseCase, authorizing the locked restore target', () => {
	it('authorizes before any folder, kernel or row mutation', async () => {
		const { useCase, written, promoted, portfolio, lock } = harness({ rows: ['billos-a1b2c3'] });
		let locked = false;
		vi.spyOn(lock, 'withLock').mockImplementation(async (_id, run) => {
			locked = true;
			try { return await run(); } finally { locked = false; }
		});
		const domains = vi.spyOn(portfolio, 'listDomains');
		await expect(useCase.execute({ bytes: bundleOf(), mode: 'restore', overwrite: true }, {
			withTarget: async (target) => {
				expect(locked).toBe(true);
				expect(target).toEqual({ projectId: 'billos-a1b2c3', existing: true });
				throw new Error('forbidden');
			}
		})).rejects.toThrow('forbidden');
		expect(domains).not.toHaveBeenCalled();
		expect(written).toEqual([]);
		expect(promoted).toEqual([]);
	});

	it('checks existence after acquiring the lock, so a preceding restore cannot be taken over', async () => {
		const { useCase, rows, lock, written } = harness();
		vi.spyOn(lock, 'withLock').mockImplementation(async (_id, run) => {
			vi.spyOn(rows, 'exists').mockResolvedValue(true);
			return run();
		});
		await expect(useCase.execute({ bytes: bundleOf(), mode: 'restore', overwrite: true }, {
			withTarget: async ({ existing }) => {
				expect(existing).toBe(true);
				throw new Error('target requires authorization');
			}
		})).rejects.toThrow('target requires authorization');
		expect(written).toEqual([]);
	});

	it('treats a kernel-only target as existing before asking to restore it', async () => {
		const { useCase, promoted } = harness({ kernel: ['billos-a1b2c3'] });
		const result = await useCase.execute({ bytes: bundleOf(), mode: 'restore' }, {
			withTarget: async ({ existing }, write) => {
				expect(existing).toBe(true);
				return write();
			}
		});
		expect(result.ok).toBe(false);
		expect(promoted).toEqual([]);
	});

	it('preserves the live local owner team inside the storage transaction [criterion:d91acf2d]', async () => {
		const { useCase, rows } = harness({ rows: ['billos-a1b2c3'] });
		const read = vi.spyOn(rows, 'read');
		const write = vi.spyOn(rows, 'write');
		await useCase.execute({ bytes: bundleOf(), mode: 'restore', overwrite: true });
		expect(read).not.toHaveBeenCalled();
		expect(write).toHaveBeenCalledWith('billos-a1b2c3', expect.anything(), { preserveLocalTeam: true });
	});

	it('keeps new ownership setup inside the lock until it finishes', async () => {
		const { useCase, lock, written } = harness();
		let locked = false;
		vi.spyOn(lock, 'withLock').mockImplementation(async (_id, run) => {
			locked = true;
			try { return await run(); } finally { locked = false; }
		});
		const result = await useCase.execute({ bytes: bundleOf(), mode: 'restore' }, {
			withTarget: async ({ existing }, write) => {
				expect(existing).toBe(false);
				const result = await write();
				expect(written).toEqual(['billos-a1b2c3']);
				await Promise.resolve();
				expect(locked).toBe(true);
				return result;
			}
		});
		expect(result.ok).toBe(true);
		expect(locked).toBe(false);
	});
});

describe('ImportProjectUseCase, on a Community installation holding one project (EVO-001)', () => {
	const holdsOne = { execute: async () => locked('secondProject') };

	it('refuses a copy before writing anything, offering the plan that opens more projects [criterion:ac-leaf-343d6e7d-aac1-4ec5-8a47-75da99d08d33]', async () => {
		const { useCase, written, promoted } = harness({}, ['a1b2c3'], holdsOne);

		await expect(useCase.execute({ bytes: bundleOf(), mode: 'copy', name: 'Expensa' })).rejects.toThrow(
			ProjectScopeRefusedError
		);
		await expect(useCase.execute({ bytes: bundleOf(), mode: 'copy' })).rejects.toThrow(
			'More active projects are available from the Solo Builder plan. Upgrade to keep building.'
		);
		expect(written).toEqual([]);
		expect(promoted).toEqual([]);
	});

	it('still restores over the project it holds: that is no new project', async () => {
		const { useCase, written } = harness({ rows: ['billos-a1b2c3'] }, ['aaaaaa'], holdsOne);

		const result = await useCase.execute({ bytes: bundleOf(), mode: 'restore', overwrite: true });

		expect(result).toMatchObject({ ok: true, projectId: 'billos-a1b2c3' });
		expect(written).toEqual(['billos-a1b2c3']);
	});
});
