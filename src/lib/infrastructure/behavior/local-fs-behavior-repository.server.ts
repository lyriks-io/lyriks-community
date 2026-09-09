import {
	existsSync,
	chmodSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
	renameSync,
	rmSync
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import type { BehaviorRepositoryPort } from '$application/ports';
import { fingerprint } from '$domain/scope';
import {
	FEATURE_SUFFIX,
	PROJECT_SUFFIX,
	type UnspaFeatureSnapshot,
	type UnspaProjectSnapshot
} from '$lib/unspa-schema';

/**
 * One project folder's file map: which file holds which record, keyed by the
 * id INSIDE the file. Valid as long as the directory's mtime holds: every write
 * into a folder, ours or the engine's, is an atomic rename, and a rename always
 * stamps the directory. The map therefore never has to be refreshed on a timer.
 */
interface FolderIndex {
	readonly dirMtimeMs: number;
	readonly featureFileById: ReadonlyMap<string, string>;
	readonly projectFileById: ReadonlyMap<string, string>;
}

/**
 * A parsed file, valid while its inode, size and mtime hold. The inode is what
 * catches an atomic rewrite (ours and the engine's both rename a fresh file
 * over the old one) that lands inside the same mtime tick with the same size.
 */
interface ParsedFile {
	readonly ino: number;
	readonly size: number;
	readonly mtimeMs: number;
	readonly bytes: number;
	readonly value: unknown;
}

/**
 * Parsed text held at once, process-wide. A large workspace is a few tens of
 * megabytes of JSON; past this the least recently read files are dropped and
 * simply re-read on their next use.
 */
const PARSED_CACHE_BYTES = 64 * 1024 * 1024;

/**
 * Freeze a parsed document all the way down. Every reader of the same file gets
 * the same object back, so one caller editing it in place would hand its edit to
 * every other request in the process, and eventually to disk. A frozen tree turns
 * that into an immediate error at the offending line instead. Callers already
 * build new objects to write (`{ ...existing, feature: { ... } }`).
 */
function deepFreeze<T>(value: T): T {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}

/** The record id a parsed feature file carries, or null when it is not one. */
function featureIdOf(value: unknown): string | null {
	const feature = (value as { feature?: { id?: unknown } } | null)?.feature;
	return typeof feature?.id === 'string' ? feature.id : null;
}

/** The record id a parsed project file carries, or null when it is not one. */
function projectIdOf(value: unknown): string | null {
	const project = (value as { project?: { id?: unknown } } | null)?.project;
	return typeof project?.id === 'string' ? project.id : null;
}

/**
 * Filesystem adapter for `BehaviorRepositoryPort`. Mirrors Unspaghettit OSS's
 * `snapshotLayout`: one folder per project, one `<slug>.project.json` inside,
 * features beside it. The project slug is the Lyriks projectId so the path is
 * stable across renames of `productName`.
 *
 * Reads go through two caches that make them cost a `stat` instead of a parse:
 *
 *  - a per-folder index from record id to file name, because the engine names
 *    the files it writes `slugify(feature.name)` while this adapter is asked for
 *    an id. Without it, every read of an engine-named feature listed the folder
 *    and parsed its files one by one until the id matched: quadratic in the
 *    feature count, on every page load, which is exactly the multi-second
 *    Features page a large project showed.
 *  - a parsed-document cache keyed on the file's size and mtime, so the several
 *    loaders that each read the same leaf during one request parse it once.
 *
 * Both validate against the filesystem on every read (one `stat` each), so a
 * write from the engine, another replica or a restore is seen immediately.
 */
export class LocalFsBehaviorRepository implements BehaviorRepositoryPort {
	readonly #root: string;
	readonly #folders = new Map<string, FolderIndex>();
	readonly #parsed = new Map<string, ParsedFile>();
	#parsedBytes = 0;

	constructor(root = 'data/unspa') {
		this.#root = resolve(root);
	}

	workspaceRoot(): string {
		return this.#root;
	}

	/**
	 * Cheap identity of one project's kernel folder: every file name with its size
	 * and mtime, hashed. It exists so a reader can tell whether the behavior it
	 * cached still describes what is on disk.
	 *
	 * Section revisions cannot answer that on their own: behavior authored through
	 * the engine (the MCP's apply_behavior_batch) writes shells here directly and
	 * leaves no revision behind, so a cache keyed on revisions alone would keep
	 * serving a verdict from before the author's last batch.
	 */
	kernelSignature(projectId: string): string {
		let dir: string;
		try {
			dir = this.#projectDir(projectId);
		} catch {
			return 'invalid';
		}
		if (!existsSync(dir)) return 'absent';
		const entries: string[] = [];
		for (const name of readdirSync(dir).sort()) {
			try {
				const stats = statSync(join(dir, name));
				entries.push(`${name}:${stats.size}:${Math.trunc(stats.mtimeMs)}`);
			} catch {
				// Vanished mid-scan (an atomic write's temp file): skip it.
			}
		}
		return fingerprint(entries);
	}

	async loadProject(projectId: string): Promise<UnspaProjectSnapshot | null> {
		const path = this.#existingProjectFile(projectId);
		if (!path) return null;
		return this.#readJson(path) as UnspaProjectSnapshot | null;
	}

	async saveProject(snapshot: UnspaProjectSnapshot): Promise<void> {
		const id = snapshot.project.id;
		// Same rule as `saveFeature`: overwrite the file that already holds this id,
		// whatever Unspaghettit named it, so the two never fork into rival records.
		await this.#writeAtomic(this.#existingProjectFile(id) ?? this.#projectPath(id), snapshot);
	}

	async loadFeature(projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> {
		const path = this.#existingFeatureFile(projectId, featureId);
		if (!path) return null;
		return this.#readJson(path) as UnspaFeatureSnapshot | null;
	}

	async saveFeature(projectId: string, snapshot: UnspaFeatureSnapshot): Promise<void> {
		const featureId = (snapshot.feature as { id?: string }).id;
		if (!featureId) throw new Error('feature snapshot missing `feature.id`');
		// Unspaghettit owns the store: it names files by `slugify(feature.name)` and
		// renames on rename, keeping the canonical id only in content. Overwrite the
		// file that already holds this id (whatever its name) so we never strand the
		// engine's copy behind a duplicate id-named shell; only fall back to the
		// id-named path when no file exists yet.
		const path = this.#existingFeatureFile(projectId, featureId) ?? this.#featurePath(projectId, featureId);
		await this.#writeAtomic(path, snapshot);
	}

	/**
	 * Every OTHER project folder whose kernel holds a record under `featureId`.
	 *
	 * The engine resolves a feature id across the whole workspace while this
	 * store is scoped per folder, so a duplicated id gives one record two
	 * claimants: an authoring batch lands wherever the engine indexed it, and
	 * the project that asked reads its own folder and finds nothing. Answering
	 * which folders claim the id lets a caller refuse the write and say where
	 * the clash is, instead of writing into a stranger's project.
	 *
	 * Both file namings count, since both occur in a live workspace: the
	 * id-named file this adapter writes, and the `slugify(feature.name)` file
	 * the engine writes. The folder index answers for both from the id INSIDE
	 * each file, so a nested element that happens to carry the id is never
	 * mistaken for the feature.
	 */
	async projectsHoldingFeature(projectId: string, featureId: string): Promise<readonly string[]> {
		this.#assertSafeId(featureId, 'featureId');
		if (!existsSync(this.#root)) return [];
		const holders: string[] = [];
		for (const entry of readdirSync(this.#root, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === projectId) continue;
			if (this.#folderHoldsFeature(join(this.#root, entry.name), featureId)) {
				holders.push(entry.name);
			}
		}
		return holders;
	}

	/** Does this one folder store a feature record with that id, under any name? */
	#folderHoldsFeature(dir: string, featureId: string): boolean {
		if (existsSync(join(dir, `${featureId}${FEATURE_SUFFIX}`))) return true;
		return this.#folderIndex(dir)?.featureFileById.has(featureId) ?? false;
	}

	async deleteProject(projectId: string): Promise<void> {
		const dir = this.#projectDir(projectId);
		rmSync(dir, { recursive: true, force: true });
		this.#forgetFolder(dir);
	}

	#projectPath(projectId: string): string {
		return join(this.#projectDir(projectId), `${projectId}${PROJECT_SUFFIX}`);
	}

	#featurePath(projectId: string, featureId: string): string {
		this.#assertSafeId(featureId, 'featureId');
		return join(this.#projectDir(projectId), `${featureId}${FEATURE_SUFFIX}`);
	}

	#projectDir(projectId: string): string {
		this.#assertSafeId(projectId, 'projectId');
		const dir = resolve(this.#root, projectId);
		if (!dir.startsWith(this.#root + sep)) throw new Error('projectId escapes behavior workspace');
		return dir;
	}

	#assertSafeId(id: string, label: string): void {
		if (!id || id.length > 255 || id === '.' || id === '..' || /[\\/\0]/.test(id)) {
			throw new Error(`${label} is not a safe filesystem identifier`);
		}
	}

	/**
	 * Resolve the on-disk file holding the project snapshot, by content `project.id`
	 * rather than filename: Unspaghettit names a project file `<slugify(name)>` and
	 * renames it when the project is renamed, so the id-named path we write by
	 * default is only the fast path. Without this, an engine-side rename leaves the
	 * platform reading nothing and re-creating a rival record beside it.
	 */
	#existingProjectFile(projectId: string): string | null {
		const direct = this.#projectPath(projectId);
		if (existsSync(direct)) return direct;
		return this.#indexedFile(this.#projectDir(projectId), (index) =>
			index.projectFileById.get(projectId)
		);
	}

	/**
	 * Resolve the on-disk file holding `featureId`, mirroring how Unspaghettit's
	 * `JsonFolderFeatureRepository` reads (by content `feature.id`, not filename).
	 * Fast path is the id-named file we write by default; otherwise the folder
	 * index names the engine's slug-named file. Returns null if absent.
	 */
	#existingFeatureFile(projectId: string, featureId: string): string | null {
		const direct = this.#featurePath(projectId, featureId);
		if (existsSync(direct)) return direct;
		return this.#indexedFile(this.#projectDir(projectId), (index) =>
			index.featureFileById.get(featureId)
		);
	}

	/**
	 * The file `pick` names in the folder's index, verified to still exist.
	 *
	 * Directory mtimes come from the kernel's coarse clock (a few ms), so a file
	 * added or renamed right after the index was built can share its stamp. A
	 * miss, or a name that vanished, therefore rebuilds the index once and asks
	 * again. A rebuild over a warm parse cache is a listing plus one `stat` per
	 * file, so a genuine miss stays cheap.
	 */
	#indexedFile(dir: string, pick: (index: FolderIndex) => string | undefined): string | null {
		for (let attempt = 0; attempt < 2; attempt++) {
			const index = this.#folderIndex(dir);
			if (!index) return null;
			const name = pick(index);
			if (name) {
				const path = join(dir, name);
				if (existsSync(path)) return path;
			}
			this.#folders.delete(dir);
		}
		return null;
	}

	/**
	 * The folder's id-to-file map, rebuilt only when the directory's mtime moved.
	 * A rebuild lists the folder and reads each record file through the parsed
	 * cache, so after one write it costs one parse (the changed file) plus a
	 * `stat` per sibling, not a parse of everything.
	 */
	#folderIndex(dir: string): FolderIndex | null {
		let dirMtimeMs: number;
		try {
			dirMtimeMs = statSync(dir).mtimeMs;
		} catch {
			this.#folders.delete(dir);
			return null;
		}
		const cached = this.#folders.get(dir);
		if (cached && cached.dirMtimeMs === dirMtimeMs) return cached;

		const featureFileById = new Map<string, string>();
		const projectFileById = new Map<string, string>();
		for (const name of readdirSync(dir)) {
			const isFeature = name.endsWith(FEATURE_SUFFIX);
			const isProject = !isFeature && name.endsWith(PROJECT_SUFFIX);
			if (!isFeature && !isProject) continue;
			let value: unknown;
			try {
				value = this.#readJson(join(dir, name));
			} catch {
				continue; // unreadable or partial file: a sibling may still hold the id
			}
			const id = isFeature ? featureIdOf(value) : projectIdOf(value);
			if (!id) continue;
			const byId = isFeature ? featureFileById : projectFileById;
			const suffix = isFeature ? FEATURE_SUFFIX : PROJECT_SUFFIX;
			// Twins under one id (an id-named shell beside the engine's slug-named
			// copy) resolve to the id-named file, as the direct fast path always did.
			if (!byId.has(id) || name === `${id}${suffix}`) byId.set(id, name);
		}
		const index: FolderIndex = { dirMtimeMs, featureFileById, projectFileById };
		this.#folders.set(dir, index);
		return index;
	}

	/**
	 * Parse a file, or hand back the parse of the same bytes from an earlier read.
	 * Validity is the file's (size, mtime) pair, checked on every call, so this is
	 * never a source of stale data across writers. Null when the file is gone.
	 * Throws on malformed JSON, like a direct read would.
	 */
	#readJson(path: string): unknown {
		let stats: { ino: number; size: number; mtimeMs: number };
		try {
			stats = statSync(path);
		} catch {
			this.#forgetFile(path);
			return null;
		}
		const hit = this.#parsed.get(path);
		if (hit && hit.ino === stats.ino && hit.size === stats.size && hit.mtimeMs === stats.mtimeMs) {
			// Re-insert so the Map's order stays least recently used first.
			this.#parsed.delete(path);
			this.#parsed.set(path, hit);
			return hit.value;
		}
		const text = readFileSync(path, 'utf8');
		const value = deepFreeze(JSON.parse(text) as unknown);
		this.#forgetFile(path);
		this.#parsed.set(path, {
			ino: stats.ino,
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			bytes: text.length,
			value
		});
		this.#parsedBytes += text.length;
		for (const [oldest, entry] of this.#parsed) {
			if (this.#parsedBytes <= PARSED_CACHE_BYTES) break;
			this.#parsed.delete(oldest);
			this.#parsedBytes -= entry.bytes;
		}
		return value;
	}

	#forgetFile(path: string): void {
		const entry = this.#parsed.get(path);
		if (!entry) return;
		this.#parsed.delete(path);
		this.#parsedBytes -= entry.bytes;
	}

	#forgetFolder(dir: string): void {
		this.#folders.delete(dir);
		for (const path of [...this.#parsed.keys()]) {
			if (path.startsWith(dir + sep)) this.#forgetFile(path);
		}
	}

	async #writeAtomic(path: string, snapshot: unknown): Promise<void> {
		const dir = dirname(path);
		// Own-and-lock-down only the dir WE create; never re-chmod a pre-existing one.
		// `data/unspa` is a shared volume on enterprise installs: the back creates a
		// project's folder under its own uid before the platform (uid 1000) first
		// writes a kernel section into it. `chmodSync` by a non-owner throws EPERM,
		// which surfaced as an opaque 500 on every kernel-backed save (features/data/
		// experience). An existing dir's perms aren't ours to set; leave them be.
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
			chmodSync(dir, 0o700); // pin 0o700 regardless of umask (we own it: always safe)
		}
		const tmp = `${path}.tmp`;
		writeFileSync(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
		chmodSync(tmp, 0o600);
		renameSync(tmp, path);
		// The stat check would catch both on the next read; dropping them now keeps
		// a read that races the write from ever pairing old bytes with a new stamp.
		this.#forgetFile(path);
		this.#folders.delete(dir);
	}
}
