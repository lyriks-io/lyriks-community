import { describe, expect, it } from 'vitest';
import type { ActiveProjectStorePort } from '$application/ports';
import type { ProjectSummary } from '$domain/catalog';
import { MakeProjectActiveUseCase, ResolveActiveProjectUseCase, projectScopeAccess } from './active-project';

const project = (id: string, lastSavedAt: string | null): ProjectSummary => ({ id, name: id, description: '', industry: '', lastSavedAt });

/** An installation moved down from Enterprise: three projects, `b` saved last. */
const MOVED_DOWN = [project('a', '2026-11-01'), project('b', '2026-11-10'), project('c', null)];

function memoryStore(initial: string | null = null) {
	let value = initial;
	const store: ActiveProjectStorePort = { load: async () => value, save: async (id) => void (value = id) };
	return { store, value: () => value };
}

function setup(edition: string | undefined, projects = MOVED_DOWN, chosen: string | null = null) {
	const catalog = { list: async () => projects };
	const memory = memoryStore(chosen);
	const resolve = new ResolveActiveProjectUseCase(() => edition, catalog, memory.store);
	return { resolve, make: new MakeProjectActiveUseCase(resolve, catalog, memory.store), memory };
}

describe('ResolveActiveProjectUseCase (EVO-001, feat 128)', () => {
	it('holds the project saved last active while none was chosen', async () => {
		expect(await setup('community').resolve.execute()).toEqual({ activeProjectId: 'b', projectCount: 3 });
	});

	it('holds the chosen one, and falls back once it is deleted', async () => {
		expect((await setup('community', MOVED_DOWN, 'c').resolve.execute())?.activeProjectId).toBe('c');
		expect((await setup('community', MOVED_DOWN, 'gone').resolve.execute())?.activeProjectId).toBe('b');
	});

	it('reads nothing on every other edition', async () => {
		expect(await setup('enterprise').resolve.execute()).toBeNull();
		expect(await setup(undefined).resolve.execute()).toBeNull();
	});
});

describe('projectScopeAccess', () => {
	it('opens the active project and holds the others inactive on Community', async () => {
		const state = await setup('community').resolve.execute();
		expect(projectScopeAccess('community', state, 'b')).toEqual({ ok: true });
		const refused = projectScopeAccess('community', state, 'a');
		expect(refused.ok).toBe(false);
		expect(!refused.ok && refused.reason).toContain('Make it the active project');
	});

	it('opens every project without limit once the installation moves up', async () => {
		for (const edition of ['solo_builder', 'team', 'enterprise']) {
			const state = await setup(edition).resolve.execute();
			for (const p of MOVED_DOWN) expect(projectScopeAccess(edition, state, p.id)).toEqual({ ok: true });
		}
	});

	it('opens the only project a Community installation holds', async () => {
		const state = await setup('community', [project('only', null)]).resolve.execute();
		expect(projectScopeAccess('community', state, 'only')).toEqual({ ok: true });
	});
});

describe('MakeProjectActiveUseCase', () => {
	it('makes the project active and the previous one inactive', async () => {
		const { make, resolve, memory } = setup('community');
		expect(await make.execute('a')).toEqual({ ok: true, activeProjectId: 'a', previousProjectId: 'b' });
		expect(memory.value()).toBe('a');
		const state = await resolve.execute();
		expect(projectScopeAccess('community', state, 'a')).toEqual({ ok: true });
		expect(projectScopeAccess('community', state, 'b').ok).toBe(false);
	});

	it('refuses an unknown project and every edition but Community', async () => {
		expect(await setup('community').make.execute('nope')).toEqual({ ok: false, reason: 'not_found' });
		expect(await setup('enterprise').make.execute('a')).toEqual({ ok: false, reason: 'not_community' });
	});
});
