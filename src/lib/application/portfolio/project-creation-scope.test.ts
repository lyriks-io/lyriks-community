import { describe, expect, it } from 'vitest';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';
import type { ProjectSummary } from '$domain/catalog';
import { CheckProjectCreationUseCase, ProjectScopeRefusedError } from './project-creation-scope';
import { CreateProjectUseCase } from './create-project';

const project = (id: string): ProjectSummary => ({ id, name: id, description: '', industry: '', lastSavedAt: null });

function catalogOf(projects: ProjectSummary[]) {
	let reads = 0;
	return {
		catalog: { list: async () => (reads++, projects) },
		reads: () => reads
	};
}

describe('CheckProjectCreationUseCase (EVO-001, feat 42)', () => {
	it('lets Community create its first project', async () => {
		const { catalog } = catalogOf([]);
		expect(await new CheckProjectCreationUseCase(() => 'community', () => 1, catalog).execute()).toEqual({ ok: true });
	});

	it('refuses a second project on Community with the offer of Solo Builder [criterion:ac-leaf-343d6e7d-aac1-4ec5-8a47-75da99d08d33]', async () => {
		const { catalog } = catalogOf([project('a')]);
		const check = await new CheckProjectCreationUseCase(() => 'community', () => 1, catalog).execute();
		expect(check).toMatchObject({ ok: false, plan: 'solo_builder', detail: 'See https://lyriks.io/pricing.' });
		expect(!check.ok && check.reason).toBe('More active projects are available from the Solo Builder plan. Upgrade to keep building.');
	});

	it('never counts where the key grants every project', async () => {
		for (const edition of ['enterprise', 'pro', undefined]) {
			const { catalog, reads } = catalogOf([project('a'), project('b')]);
			expect(await new CheckProjectCreationUseCase(() => edition, () => null, catalog).execute()).toEqual({ ok: true });
			expect(reads()).toBe(0);
		}
	});

	// EVO-016, criteria ff8aad5f and 55c38a1e.
	it('refuses a project beyond the number an Enterprise key grants, and creates below it [criterion:ac-leaf-ff8aad5f-23ae-48f8-b999-9ad426ac53b4] [criterion:ac-leaf-55c38a1e-a7de-445d-a584-3e992c46cdfb]', async () => {
		const full = await new CheckProjectCreationUseCase(() => 'enterprise', () => 2, catalogOf([project('a'), project('b')]).catalog).execute();
		expect(full).toMatchObject({ ok: false, plan: null });
		expect(!full.ok && full.reason).toBe("This installation's licence holds 2 active projects. Ask for a key with more projects to keep building.");
		expect(await new CheckProjectCreationUseCase(() => 'enterprise', () => 2, catalogOf([project('a')]).catalog).execute()).toEqual({ ok: true });
	});
});

describe('CreateProjectUseCase under the Community scope', () => {
	const clock: ClockPort = { nowIso: () => '2026-11-16T00:00:00.000Z' };
	const portfolio = { listDomains: async () => [], saveDomain: async () => {}, setMeta: async () => {} } as unknown as PortfolioRepositoryPort;

	it('refuses before saving anything when Community already holds a project', async () => {
		const saved: unknown[] = [];
		const drafts = { save: async (d: unknown) => void saved.push(d) } as unknown as FoundationIdentityRepositoryPort;
		const scope = new CheckProjectCreationUseCase(() => 'community', () => 1, catalogOf([project('a')]).catalog);
		const uc = new CreateProjectUseCase(drafts, clock, portfolio, undefined, () => 'abc123', undefined, scope);

		await expect(uc.execute({ name: 'Second' })).rejects.toBeInstanceOf(ProjectScopeRefusedError);
		expect(saved).toEqual([]);
	});

	it('creates the first one', async () => {
		const drafts = { save: async () => {} } as unknown as FoundationIdentityRepositoryPort;
		const scope = new CheckProjectCreationUseCase(() => 'community', () => 1, catalogOf([]).catalog);
		const uc = new CreateProjectUseCase(drafts, clock, portfolio, undefined, () => 'abc123', undefined, scope);

		expect(await uc.execute({ name: 'First' })).toBe('first-abc123');
	});
});
