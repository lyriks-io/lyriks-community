import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { ProjectLockPort } from '$application/ports';

const LOCKS_DIRNAME = '.locks';

/**
 * Cross-process per-project mutex backed by an exclusive lock directory under
 * `data/unspa/.locks/<projectId>`. `mkdirSync` is atomic (fails if the dir
 * exists), which gives real exclusion — including against a concurrent MCP or
 * dashboard writer on the shared volume, not just another request in-process.
 * A lock older than `staleMs` is reclaimed so a crashed holder can't wedge the
 * store forever.
 */
export class FsProjectLock implements ProjectLockPort {
	readonly #root: string;
	readonly #staleMs: number;
	readonly #retryMs: number;
	readonly #maxWaitMs: number;

	constructor(root = 'data/unspa', opts: { staleMs?: number; retryMs?: number; maxWaitMs?: number } = {}) {
		this.#root = resolve(root);
		this.#staleMs = opts.staleMs ?? 5 * 60_000;
		this.#retryMs = opts.retryMs ?? 100;
		this.#maxWaitMs = opts.maxWaitMs ?? 30_000;
	}

	async withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
		const dir = this.#lockDir(projectId);
		await this.#acquire(dir);
		try {
			return await fn();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	async #acquire(dir: string): Promise<void> {
		const deadline = Date.now() + this.#maxWaitMs;
		for (;;) {
			try {
				mkdirSync(dir, { recursive: false });
				writeFileSync(join(dir, 'holder'), `${process.pid} ${new Date().toISOString()}\n`);
				return;
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
				if (this.#isStale(dir)) {
					rmSync(dir, { recursive: true, force: true });
					continue; // reclaim and retry immediately
				}
				if (Date.now() >= deadline) throw new Error(`could not acquire project lock: ${dir}`);
				await delay(this.#retryMs);
			}
		}
	}

	#isStale(dir: string): boolean {
		try {
			return Date.now() - statSync(dir).mtimeMs > this.#staleMs;
		} catch {
			return false; // vanished between checks — treat as not-stale; next mkdir wins
		}
	}

	#lockDir(projectId: string): string {
		if (!projectId || projectId.length > 255 || /[\\/\0]/.test(projectId)) {
			throw new Error('projectId is not a safe lock identifier');
		}
		// Ensure the `.locks` parent exists so the child mkdir stays atomic (the
		// exclusion primitive is the non-recursive mkdir of the per-project dir).
		const locksRoot = join(this.#root, LOCKS_DIRNAME);
		if (!existsSync(locksRoot)) mkdirSync(locksRoot, { recursive: true });
		return join(locksRoot, projectId);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
