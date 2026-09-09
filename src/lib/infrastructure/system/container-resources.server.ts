import { readFile } from 'node:fs/promises';
import { availableParallelism, totalmem } from 'node:os';
import type { ContainerResourcesPort } from '$application/ports';
import type { ContainerResources } from '$domain/system';

/** cgroup v2 first (every current engine), then the v1 layout. */
const MEMORY_LIMIT_FILES = [
	'/sys/fs/cgroup/memory.max',
	'/sys/fs/cgroup/memory/memory.limit_in_bytes'
] as const;

const BYTES_PER_GIB = 1024 ** 3;

/**
 * cgroup v1 spells "no limit" as a number near 2^63, and reporting that as
 * 8388608 GiB is worse than saying nothing. Anything past a plausible machine
 * is the sentinel, not a measurement.
 */
const UNLIMITED_FROM = 1024 * BYTES_PER_GIB;

function toGiB(bytes: number): number {
	return Math.round((bytes / BYTES_PER_GIB) * 10) / 10;
}

async function memoryLimitBytes(): Promise<number | null> {
	for (const file of MEMORY_LIMIT_FILES) {
		try {
			const raw = (await readFile(file, 'utf8')).trim();
			if (raw === 'max') return null;
			const bytes = Number(raw);
			if (!Number.isFinite(bytes) || bytes <= 0 || bytes >= UNLIMITED_FROM) return null;
			return bytes;
		} catch {
			// Next layout, then no answer at all: a cgroup file is not a promise.
		}
	}
	return null;
}

/**
 * What this container actually holds, read live from its own runtime.
 *
 * The companion to the facts the kit recorded on the host, and the one reading
 * that cannot go stale: the recorded machine is a snapshot from the last
 * install or update, while this is measured on every load. On Docker Desktop
 * the two legitimately disagree, and the pair is the point: the machine has
 * 32 GiB, the engine was granted 12, and Lyriks is killed against the second.
 */
export class ProcessResources implements ContainerResourcesPort {
	async read(): Promise<ContainerResources | null> {
		try {
			const limit = await memoryLimitBytes();
			return {
				cpus: availableParallelism(),
				memoryLimitGiB: limit === null ? null : toGiB(limit),
				memoryTotalGiB: toGiB(totalmem())
			};
		} catch {
			return null;
		}
	}
}
