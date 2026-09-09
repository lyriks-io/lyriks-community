import { describe, expect, it } from 'vitest';
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
function harness(taken: { rows?: string[]; kernel?: string[] } = {}, suffixes = ['aaaaaa']) {
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
		() => suffixes[Math.min(next++, suffixes.length - 1)]
	);
	return { useCase, written, promoted, removed, attempts: () => next };
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
