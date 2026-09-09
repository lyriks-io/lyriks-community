import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UnspaProjectSnapshot } from '$lib/unspa-schema';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';

const snapshot = (id: string, name: string, featureIds: string[] = []) =>
	({
		format: 'unspaghettit',
		version: 1,
		project: { id, name, description: '', tags: [], featureIds, createdAt: 'x', updatedAt: 'x' }
	}) as unknown as UnspaProjectSnapshot;

/**
 * Unspaghettit names a project file after the project's NAME and renames it on
 * rename; the platform writes it id-named. Both must resolve to one record — a
 * second file for the same id is how two rival project records get created.
 */
describe('LocalFsBehaviorRepository project file resolution', () => {
	it('reads a project file the engine named after the project, not the id', () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(
			join(root, 'p1', 'causette.project.json'),
			JSON.stringify(snapshot('p1', 'Causette', ['f1']))
		);
		const repository = new LocalFsBehaviorRepository(root);

		expect(repository.loadProject('p1')).resolves.toMatchObject({
			project: { id: 'p1', featureIds: ['f1'] }
		});
	});

	it('overwrites that same file on save instead of forking a rival record', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(
			join(root, 'p1', 'causette.project.json'),
			JSON.stringify(snapshot('p1', 'Causette', ['f1']))
		);
		const repository = new LocalFsBehaviorRepository(root);

		await repository.saveProject(snapshot('p1', 'Causette', ['f1', 'f2']));

		const files = readdirSync(join(root, 'p1')).filter((f) => f.endsWith('.project.json'));
		expect(files).toEqual(['causette.project.json']); // no p1.project.json beside it
		const reloaded = await repository.loadProject('p1');
		expect(reloaded!.project.featureIds).toEqual(['f1', 'f2']);
	});

	it('falls back to the id-named path for a project that does not exist yet', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		const repository = new LocalFsBehaviorRepository(root);

		expect(await repository.loadProject('p1')).toBeNull();
		await repository.saveProject(snapshot('p1', 'New'));
		expect(readdirSync(join(root, 'p1'))).toEqual(['p1.project.json']);
	});
});

const featureSnapshot = (id: string, name: string) =>
	JSON.stringify({
		format: 'unspaghettit-feature',
		version: 1,
		feature: { id, name, surfaces: [], events: [], personas: [] }
	});

/**
 * The store is scoped per project folder; the engine that authors into it
 * resolves a feature id across every folder. A duplicated id therefore gives
 * one record two claimants, and the write goes wherever the engine indexed it.
 * Naming the other claimants is what lets a caller refuse rather than cross.
 */
describe('LocalFsBehaviorRepository feature id claims', () => {
	it('says nothing when the id belongs to this project alone', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		mkdirSync(join(root, 'p2'));
		writeFileSync(join(root, 'p1', 'feat-glossary.feature.json'), featureSnapshot('feat-glossary', 'Glossary'));
		writeFileSync(join(root, 'p2', 'feat-billing.feature.json'), featureSnapshot('feat-billing', 'Billing'));

		const repository = new LocalFsBehaviorRepository(root);

		await expect(repository.projectsHoldingFeature('p1', 'feat-glossary')).resolves.toEqual([]);
	});

	it('names the other project that stores the same id', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		mkdirSync(join(root, 'p2'));
		writeFileSync(join(root, 'p1', 'feat-glossary.feature.json'), featureSnapshot('feat-glossary', 'Glossary'));
		writeFileSync(join(root, 'p2', 'feat-glossary.feature.json'), featureSnapshot('feat-glossary', 'Vocabulaire'));

		const repository = new LocalFsBehaviorRepository(root);

		await expect(repository.projectsHoldingFeature('p1', 'feat-glossary')).resolves.toEqual(['p2']);
	});

	it('finds the claim even when the engine named the file after the feature', async () => {
		// `slugify(feature.name)` is how the engine names what it writes, so the
		// id-named fast path misses exactly the copy that caused the trouble.
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		mkdirSync(join(root, 'p2'));
		writeFileSync(join(root, 'p2', 'govern-the-glossary.feature.json'), featureSnapshot('feat-glossary', 'Govern the Glossary'));

		const repository = new LocalFsBehaviorRepository(root);

		await expect(repository.projectsHoldingFeature('p1', 'feat-glossary')).resolves.toEqual(['p2']);
	});

	it('does not mistake a nested element carrying the same id for the feature', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		mkdirSync(join(root, 'p2'));
		writeFileSync(
			join(root, 'p2', 'other.feature.json'),
			JSON.stringify({
				format: 'unspaghettit-feature',
				version: 1,
				feature: { id: 'feat-other', name: 'Other', surfaces: [{ id: 'feat-glossary', name: 'A surface' }] }
			})
		);

		const repository = new LocalFsBehaviorRepository(root);

		await expect(repository.projectsHoldingFeature('p1', 'feat-glossary')).resolves.toEqual([]);
	});

	it('answers on an empty workspace instead of throwing', async () => {
		const repository = new LocalFsBehaviorRepository(join(mkdtempSync(join(tmpdir(), 'lyriks-behavior-')), 'never-created'));

		await expect(repository.projectsHoldingFeature('p1', 'feat-glossary')).resolves.toEqual([]);
	});
});

/**
 * The engine names files `slugify(feature.name)`; the platform asks by id. The
 * folder index is what keeps that lookup from re-parsing the whole folder on
 * every read, and it must follow every kind of change the folder sees.
 */
describe('LocalFsBehaviorRepository feature reads', () => {
	const feature = (id: string, name: string, extra: Record<string, unknown> = {}) =>
		JSON.stringify({
			format: 'unspaghettit-feature',
			version: 1,
			feature: { id, name, surfaces: [], events: [], personas: [], ...extra }
		});

	it('reads an engine-named feature by the id inside it', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(join(root, 'p1', 'browse-rooms.feature.json'), feature('feat-rooms', 'Browse rooms'));
		const repository = new LocalFsBehaviorRepository(root);

		await expect(repository.loadFeature('p1', 'feat-rooms')).resolves.toMatchObject({
			feature: { id: 'feat-rooms', name: 'Browse rooms' }
		});
		expect(await repository.loadFeature('p1', 'feat-nope')).toBeNull();
	});

	it('parses a file once across repeated reads, and again once it changed on disk', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		const path = join(root, 'p1', 'browse-rooms.feature.json');
		writeFileSync(path, feature('feat-rooms', 'Browse rooms'));
		const repository = new LocalFsBehaviorRepository(root);

		const first = await repository.loadFeature('p1', 'feat-rooms');
		const second = await repository.loadFeature('p1', 'feat-rooms');
		expect(second).toBe(first); // same parse handed back, not a fresh one

		// An in-place rewrite by another writer (the engine, a restore) is seen at
		// once: the stamp changed, so the next read parses again.
		writeFileSync(path, feature('feat-rooms', 'Browse every room', { description: 'longer' }));
		const third = await repository.loadFeature('p1', 'feat-rooms');
		expect(third).not.toBe(first);
		expect(third!.feature).toMatchObject({ name: 'Browse every room' });
	});

	it('hands out frozen snapshots so no reader can edit the shared parse', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(join(root, 'p1', 'feat-rooms.feature.json'), feature('feat-rooms', 'Browse rooms'));
		const repository = new LocalFsBehaviorRepository(root);

		const snapshot = (await repository.loadFeature('p1', 'feat-rooms'))!;
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.feature)).toBe(true);
		expect(Object.isFrozen((snapshot.feature as { surfaces: unknown[] }).surfaces)).toBe(true);
		expect(() => {
			(snapshot.feature as { name: string }).name = 'edited';
		}).toThrow(TypeError);
	});

	it('follows an engine-side rename of the file', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(join(root, 'p1', 'browse-rooms.feature.json'), feature('feat-rooms', 'Browse rooms'));
		const repository = new LocalFsBehaviorRepository(root);
		await repository.loadFeature('p1', 'feat-rooms');

		// The engine renames on `feature.name` change: new file, old one gone.
		writeFileSync(join(root, 'p1', 'explore-rooms.feature.json'), feature('feat-rooms', 'Explore rooms'));
		rmSync(join(root, 'p1', 'browse-rooms.feature.json'));

		await expect(repository.loadFeature('p1', 'feat-rooms')).resolves.toMatchObject({
			feature: { name: 'Explore rooms' }
		});
	});

	it('sees a feature the engine added after the folder was first indexed', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(join(root, 'p1', 'browse-rooms.feature.json'), feature('feat-rooms', 'Browse rooms'));
		const repository = new LocalFsBehaviorRepository(root);
		expect(await repository.loadFeature('p1', 'feat-map')).toBeNull();

		writeFileSync(join(root, 'p1', 'show-the-map.feature.json'), feature('feat-map', 'Show the map'));

		await expect(repository.loadFeature('p1', 'feat-map')).resolves.toMatchObject({
			feature: { id: 'feat-map' }
		});
	});

	it('overwrites the engine-named file on save and serves the new content', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(join(root, 'p1', 'browse-rooms.feature.json'), feature('feat-rooms', 'Browse rooms'));
		const repository = new LocalFsBehaviorRepository(root);
		const existing = (await repository.loadFeature('p1', 'feat-rooms'))!;

		await repository.saveFeature('p1', {
			...existing,
			feature: { ...(existing.feature as Record<string, unknown>), name: 'Browse rooms v2' }
		} as typeof existing);

		expect(readdirSync(join(root, 'p1'))).toEqual(['browse-rooms.feature.json']);
		expect((await repository.loadFeature('p1', 'feat-rooms'))!.feature).toMatchObject({
			name: 'Browse rooms v2'
		});
	});

	it('prefers the id-named file when a slug-named twin carries the same id', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-behavior-'));
		mkdirSync(join(root, 'p1'));
		writeFileSync(join(root, 'p1', 'browse-rooms.feature.json'), feature('feat-rooms', 'engine copy'));
		writeFileSync(join(root, 'p1', 'feat-rooms.feature.json'), feature('feat-rooms', 'platform copy'));
		const repository = new LocalFsBehaviorRepository(root);

		expect((await repository.loadFeature('p1', 'feat-rooms'))!.feature).toMatchObject({
			name: 'platform copy'
		});
	});
});
