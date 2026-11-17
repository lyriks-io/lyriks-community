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
		expect(await new CheckProjectCreationUseCase(() => 'community', catalog).execute()).toEqual({ ok: true });
	});

	it('refuses a second project on Community, saying Community holds one project', async () => {
		const { catalog } = catalogOf([project('a')]);
		const check = await new CheckProjectCreationUseCase(() => 'community', catalog).execute();
		expect(check).toMatchObject({ ok: false, plan: 'solo_builder' });
		expect(!check.ok && check.reason).toBe('Community holds one project. Solo Builder opens several.');
	});

	it('never counts on any other edition', async () => {
		for (const edition of ['enterprise', 'pro', undefined]) {
			const { catalog, reads } = catalogOf([project('a'), project('b')]);
			expect(await new CheckProjectCreationUseCase(() => edition, catalog).execute()).toEqual({ ok: true });
			expect(reads()).toBe(0);
		}
	});
});

describe('CreateProjectUseCase under the Community scope', () => {
	const clock: ClockPort = { nowIso: () => '2026-11-16T00:00:00.000Z' };
	const portfolio = { listDomains: async () => [], saveDomain: async () => {}, setMeta: async () => {} } as unknown as PortfolioRepositoryPort;

	it('refuses before saving anything when Community already holds a project', async () => {
		const saved: unknown[] = [];
		const drafts = { save: async (d: unknown) => void saved.push(d) } as unknown as FoundationIdentityRepositoryPort;
		const scope = new CheckProjectCreationUseCase(() => 'community', catalogOf([project('a')]).catalog);
		const uc = new CreateProjectUseCase(drafts, clock, portfolio, undefined, () => 'abc123', undefined, scope);

		await expect(uc.execute({ name: 'Second' })).rejects.toBeInstanceOf(ProjectScopeRefusedError);
		expect(saved).toEqual([]);
	});

	it('creates the first one', async () => {
		const drafts = { save: async () => {} } as unknown as FoundationIdentityRepositoryPort;
		const scope = new CheckProjectCreationUseCase(() => 'community', catalogOf([]).catalog);
		const uc = new CreateProjectUseCase(drafts, clock, portfolio, undefined, () => 'abc123', undefined, scope);

		expect(await uc.execute({ name: 'First' })).toBe('first-abc123');
	});
});
