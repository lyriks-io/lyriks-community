import { describe, expect, it } from 'vitest';
import { ProcessResources, type CgroupReader } from './container-resources.server';

/**
 * The memory ceiling this container really runs under, read from its cgroup on
 * every load: cgroup v2 first, then v1, and "unlimited" said as such rather
 * than as an absurd number.
 */

const V2 = '/sys/fs/cgroup/memory.max';
const V1 = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
const GiB = 1024 ** 3;

function cgroup(files: Record<string, string>): CgroupReader {
	return async (path) => {
		if (path in files) return files[path];
		throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
	};
}

const limitOf = async (files: Record<string, string>) => (await new ProcessResources(cgroup(files)).read())?.memoryLimitGiB;

describe('the memory ceiling of the container', () => {
	it('reads the cgroup v2 limit in GiB, to one decimal', async () => {
		expect(await limitOf({ [V2]: `${12 * GiB}\n` })).toBe(12);
		expect(await limitOf({ [V2]: String(Math.round(1.26 * GiB)) })).toBe(1.3);
	});

	it('says unlimited when cgroup v2 says max, without falling back to v1', async () => {
		expect(await limitOf({ [V2]: 'max', [V1]: String(4 * GiB) })).toBeNull();
	});

	it('falls back to the cgroup v1 limit when v2 is absent', async () => {
		expect(await limitOf({ [V1]: String(6 * GiB) })).toBe(6);
	});

	it('reads the v1 "no limit" sentinel near 2^63 as unlimited', async () => {
		expect(await limitOf({ [V1]: '9223372036854771712' })).toBeNull();
	});

	it('says unlimited for an unreadable value or no cgroup at all', async () => {
		expect(await limitOf({ [V2]: 'garbage' })).toBeNull();
		expect(await limitOf({ [V2]: '0' })).toBeNull();
		expect(await limitOf({})).toBeNull();
	});

	it('always reports the CPUs and the memory the kernel shows the process', async () => {
		const resources = await new ProcessResources(cgroup({})).read();
		expect(resources?.cpus).toBeGreaterThan(0);
		expect(resources?.memoryTotalGiB).toBeGreaterThan(0);
	});
});
