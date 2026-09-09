import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join, resolve, sep } from 'node:path';

import type {
	LoadedFolder,
	PromoteCanonicalInput,
	ReconciliationStorePort
} from '$application/ports';
import {
	FEATURE_SUFFIX,
	PROJECT_SUFFIX,
	UNSPA_FEATURE_FORMAT,
	UNSPA_PROJECT_FORMAT,
	UNSPA_VERSION
} from '$lib/unspa-schema';

const QUARANTINE_DIRNAME = '.quarantine';
const STAGING_DIRNAME = '.staging';

/**
 * Filesystem adapter for the reconciliation engine over `data/unspa`. Reads
 * folders by content id (never by filename), stages the canonical folder in a
 * private temp dir and atomically swaps it in, and moves losing folders into a
 * timestamped, recoverable quarantine. Mirrors LocalFsBehaviorRepository's
 * path-escape guard and its deliberate "never re-chmod a pre-existing dir" rule
 * (the shared enterprise volume is owned by different uids).
 */
export class FsReconciliationStore implements ReconciliationStorePort {
	readonly #root: string;

	constructor(root = 'data/unspa') {
		this.#root = resolve(root);
	}

	async loadCandidates(folderKeys: readonly string[]): Promise<LoadedFolder[]> {
		return folderKeys.map((folderKey) => this.#loadFolder(folderKey));
	}

	async promoteCanonical(input: PromoteCanonicalInput): Promise<void> {
		const canonicalDir = this.#folderDir(input.canonicalKernelId);
		const staging = join(this.#root, STAGING_DIRNAME, `${input.canonicalKernelId}.${process.pid}.${randomSuffix()}`);
		try {
			// 1. Build the full canonical folder in a private staging dir.
			this.#ensureOwnedDir(staging);
			this.#writeFile(join(staging, `${input.canonicalKernelId}${PROJECT_SUFFIX}`), {
				format: UNSPA_PROJECT_FORMAT,
				version: UNSPA_VERSION,
				project: input.project
			});
			for (const feature of input.features) {
				const id = String((feature as { id?: unknown }).id ?? '');
				this.#assertSafeId(id, 'featureId');
				this.#writeFile(join(staging, `${id}${FEATURE_SUFFIX}`), {
					format: UNSPA_FEATURE_FORMAT,
					version: UNSPA_VERSION,
					feature
				});
			}
			// 2. Back up any existing canonical folder into the quarantine, then swap.
			//    Two renames aren't a single atomic step, but each is atomic and the
			//    use-case is retryable: a crash between them leaves either the intact
			//    old folder (in quarantine) or the new one — never a half-written mix.
			if (existsSync(canonicalDir)) {
				const backup = this.#quarantineDest(`${input.canonicalKernelId}.pre-reconcile`, input.quarantineStamp);
				renameSync(canonicalDir, backup);
			}
			renameSync(staging, canonicalDir);
		} finally {
			if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
		}
	}

	async quarantine(folderKey: string, stamp: string): Promise<string | null> {
		const dir = this.#folderDir(folderKey);
		if (!existsSync(dir)) return null;
		const dest = this.#quarantineDest(folderKey, stamp);
		renameSync(dir, dest);
		return dest;
	}

	#loadFolder(folderKey: string): LoadedFolder {
		const dir = this.#folderDir(folderKey);
		const folder: LoadedFolder & {
			project: Record<string, unknown> | null;
			features: Array<{ id: string; feature: Record<string, unknown>; fileName: string }>;
		} = {
			folderKey,
			project: null,
			features: []
		};
		if (!existsSync(dir)) return folder;
		// A folder can hold two manifests (the engine renames its file on rename).
		// Resolve the same way LocalFsBehaviorRepository reads: the id-named file is
		// authoritative, anything else is only a fallback.
		let manifestIsIdNamed = false;
		for (const name of readdirSync(dir).sort()) {
			const full = join(dir, name);
			if (name.endsWith(PROJECT_SUFFIX)) {
				const snap = readJson(full);
				const project = snap?.project;
				if (!project || typeof project !== 'object' || manifestIsIdNamed) continue;
				const idNamed = name === `${folderKey}${PROJECT_SUFFIX}`;
				if (folder.project && !idNamed) continue;
				folder.project = project as Record<string, unknown>;
				manifestIsIdNamed = idNamed;
			} else if (name.endsWith(FEATURE_SUFFIX)) {
				const snap = readJson(full);
				const feature = snap?.feature;
				const id = (feature as { id?: unknown } | undefined)?.id;
				if (feature && typeof feature === 'object' && typeof id === 'string') {
					folder.features.push({ id, feature: feature as Record<string, unknown>, fileName: name });
				}
			}
		}
		return folder;
	}

	#quarantineDest(name: string, stamp: string): string {
		this.#assertSafeId(name, 'folderKey');
		const batch = join(this.#root, QUARANTINE_DIRNAME, stamp);
		this.#ensureOwnedDir(batch);
		// Never overwrite an already-quarantined folder (e.g. a repeat reconcile in
		// the same timestamp batch): pick the first free `<name>`, `<name>-2`, … path.
		let dest = join(batch, name);
		for (let n = 2; existsSync(dest); n++) dest = join(batch, `${name}-${n}`);
		return dest;
	}

	#folderDir(folderKey: string): string {
		this.#assertSafeId(folderKey, 'folderKey');
		const dir = resolve(this.#root, folderKey);
		if (!dir.startsWith(this.#root + sep)) throw new Error('folderKey escapes behavior workspace');
		return dir;
	}

	#assertSafeId(id: string, label: string): void {
		if (!id || id.length > 255 || id === '.' || id === '..' || /[\\/\0]/.test(id)) {
			throw new Error(`${label} is not a safe filesystem identifier`);
		}
	}

	/** Create a dir we own and lock it to 0o700 — but never re-chmod a pre-existing one. */
	#ensureOwnedDir(dir: string): void {
		if (existsSync(dir)) return;
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		chmodSync(dir, 0o700);
	}

	#writeFile(path: string, snapshot: unknown): void {
		writeFileSync(path, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
		chmodSync(path, 0o600);
	}
}

function readJson(path: string): { project?: unknown; feature?: unknown } | null {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

function randomSuffix(): string {
	// Not security-sensitive; just a collision-resistant staging-dir suffix.
	return `${Date.now().toString(36)}${Math.trunc(Math.random() * 1e9).toString(36)}`;
}
