import { describe, expect, it } from 'vitest';
import type { ActiveProjectStorePort } from '$application/ports';
import type { ProjectSummary } from '$domain/catalog';
import { MakeProjectActiveUseCase, ResolveActiveProjectUseCase, projectScopeAccess } from './active-project';

const project = (id: string, lastSavedAt: string | null): ProjectSummary => ({ id, name: id, description: '', industry: '', lastSavedAt });

/** An installation moved down from Enterprise: three projects, `b` saved last. */
const MOVED_DOWN = [project('a', '2026-11-01'), project('b', '2026-11-10'), project('c', null)];

function memoryStore(initial: string[] = []) {
	let value = initial;
	const store: ActiveProjectStorePort = { load: async () => value, save: async (ids) => void (value = [...ids]) };
	return { store, value: () => value };
}

/** The number of projects each edition's key grants here: 1 on Community, every project otherwise, unless `granted` says. */
function setup(edition: string | undefined, projects = MOVED_DOWN, chosen: string[] = [], granted: number | null = edition === 'community' ? 1 : null) {
	const catalog = { list: async () => projects };
	const memory = memoryStore(chosen);
	const resolve = new ResolveActiveProjectUseCase(() => granted, catalog, memory.store);
	return { resolve, make: new MakeProjectActiveUseCase(resolve, catalog, memory.store), memory };
}

describe('ResolveActiveProjectUseCase (EVO-001, feat 128)', () => {
	it('holds the project saved last active while none was chosen', async () => {
		expect(await setup('community').resolve.execute()).toEqual({ activeProjectIds: ['b'], projectCount: 3, granted: 1 });
	});

	it('holds the chosen one, and falls back once it is deleted', async () => {
		expect((await setup('community', MOVED_DOWN, ['c']).resolve.execute())?.activeProjectIds).toEqual(['c']);
		expect((await setup('community', MOVED_DOWN, ['gone']).resolve.execute())?.activeProjectIds).toEqual(['b']);
	});

	it('reads nothing where the key grants every project', async () => {
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
		expect(await make.execute('a')).toEqual({ ok: true, activeProjectIds: ['a'], previousProjectId: 'b' });
		expect(memory.value()).toEqual(['a']);
		const state = await resolve.execute();
		expect(projectScopeAccess('community', state, 'a')).toEqual({ ok: true });
		expect(projectScopeAccess('community', state, 'b').ok).toBe(false);
	});

	it('refuses an unknown project, and where the key grants every project', async () => {
		expect(await setup('community').make.execute('nope')).toEqual({ ok: false, reason: 'not_found' });
		expect(await setup('enterprise').make.execute('a')).toEqual({ ok: false, reason: 'unlimited' });
	});
});

// EVO-016: the Community rule with N, the number the Enterprise key states.
describe('N active projects (EVO-016, feat 128)', () => {
	const FOUR = [project('a', '2026-11-01'), project('b', '2026-11-10'), project('c', '2026-11-05'), project('d', null)];

	it('holds the N saved last active and the others inactive [criterion:ac-leaf-e00f8726-ec61-4b51-b8f6-a32794c70c36] [criterion:ac-leaf-abf6f54e-6aa4-41f4-93ff-62a247dfb181]', async () => {
		const { resolve } = setup('enterprise', FOUR, [], 2);
		const state = await resolve.execute();
		expect(state).toEqual({ activeProjectIds: ['b', 'c'], projectCount: 4, granted: 2 });
		expect(projectScopeAccess('enterprise', state, 'b')).toEqual({ ok: true });
		expect(projectScopeAccess('enterprise', state, 'a')).toMatchObject({ ok: false, plan: null });
	});

	it('asks which active project to set aside when every place is taken, and sets aside the one picked [criterion:ac-leaf-601e615e-7310-47b4-a7d1-5b8d24f45605]', async () => {
		const { make, memory } = setup('enterprise', FOUR, [], 2);
		expect(await make.execute('a')).toEqual({
			ok: false,
			reason: 'choose_set_aside',
			activeProjects: [
				{ id: 'b', name: 'b' },
				{ id: 'c', name: 'c' }
			]
		});
		expect(memory.value()).toEqual([]);
		expect(await make.execute('a', 'c')).toEqual({ ok: true, activeProjectIds: ['a', 'b'], previousProjectId: 'c' });
		expect(memory.value()).toEqual(['a', 'b']);
	});

	it('never sets aside a project that is not active, and changes nothing for one already active [criterion:ac-leaf-601e615e-7310-47b4-a7d1-5b8d24f45605]', async () => {
		const { make, memory } = setup('enterprise', FOUR, [], 2);
		expect(await make.execute('a', 'd')).toMatchObject({ ok: false, reason: 'choose_set_aside' });
		expect(await make.execute('b')).toEqual({ ok: true, activeProjectIds: ['b', 'c'], previousProjectId: null });
		expect(memory.value()).toEqual([]);
	});

	it('sets aside the one active project without asking where the key grants 1 [criterion:ac-leaf-601e615e-7310-47b4-a7d1-5b8d24f45605]', async () => {
		const { make } = setup('enterprise', FOUR, [], 1);
		expect(await make.execute('a')).toEqual({ ok: true, activeProjectIds: ['a'], previousProjectId: 'b' });
	});
});
