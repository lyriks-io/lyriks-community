import { describe, expect, it } from 'vitest';
import { LoadPlatformComponentsUseCase, type PlatformBuildInfo } from './load-platform-components';
import type { BackSystemInfo } from '../ports/system-probes';
import type { ContainerResources, HostFacts } from '$domain/system';

const BUILD: PlatformBuildInfo = {
	version: '0.4.0',
	imageTag: 'v0.4.0',
	commit: 'abc123def456',
	builtAt: '2026-07-22T10:00:00Z'
};
const clock = { nowIso: () => '2026-07-22T12:00:00Z' };

/**
 * A host that never recorded anything is the DEFAULT here, so the existing
 * expectations keep describing an install with no such record: that is exactly
 * what every appliance installed before the kit learned to write one looks like.
 */
function build(overrides: {
	engine?: () => Promise<string | null>;
	back?: () => Promise<BackSystemInfo | null>;
	datastore?: () => Promise<string | null>;
	declared?: string;
	host?: () => Promise<HostFacts | null>;
	resources?: () => Promise<ContainerResources | null>;
}) {
	return new LoadPlatformComponentsUseCase(
		BUILD,
		{ engineVersion: overrides.engine ?? (async () => '0.13.0') },
		{ probe: overrides.back ?? (async () => null) },
		{ serverVersion: overrides.datastore ?? (async () => '16.4') },
		clock,
		overrides.declared ?? '0.13.0',
		{ read: overrides.host ?? (async () => null) },
		{ read: overrides.resources ?? (async () => null) }
	);
}

const HOST: HostFacts = {
	event: 'update',
	recordedAt: '2026-07-22T09:00:00Z',
	installedAt: '2026-05-02T08:00:00Z',
	release: '2026.07-3',
	previousRelease: '2026.06-1',
	kit: '2026.07-3',
	method: 'bootstrap',
	machine: {
		os: 'Ubuntu 22.04.4 LTS',
		kernel: 'Linux 5.15.0',
		arch: 'x86_64',
		cpu: 'AMD Ryzen 5 5600X',
		cpus: 12,
		memoryGiB: 12,
		diskFreeGiB: 217,
		diskSizeGiB: 251,
		virtualisation: 'wsl',
		readAt: '2026-07-22T09:00:00Z'
	},
	docker: {
		server: '27.4.0',
		compose: '2.31.0',
		os: 'Docker Desktop',
		kernel: 'Linux 5.15.0',
		cpus: 12,
		memoryGiB: 12,
		storageDriver: 'overlayfs',
		readAt: '2026-07-22T09:00:00Z'
	},
	windows: {
		os: 'Microsoft Windows 11 10.0.26200',
		cpu: 'AMD Ryzen 5 5600X',
		cpus: 12,
		memoryGiB: 32,
		readAt: '2026-07-22T09:00:00Z'
	}
};

const byId = <T extends { id: string }>(list: readonly T[], id: string): T =>
	list.find((c) => c.id === id)!;

describe('LoadPlatformComponentsUseCase', () => {
	it('reports the platform build stamped into the image', async () => {
		const components = await build({}).execute();
		const platform = byId(components, 'platform');
		expect(platform.version).toBe('0.4.0');
		expect(platform.status).toBe('running');
		expect(platform.build).toEqual({
			'Image tag': 'v0.4.0',
			Commit: 'abc123def456',
			Built: '2026-07-22T10:00:00Z'
		});
	});

	it('prefers the version the running engine reports over the declared one', async () => {
		const components = await build({ engine: async () => '0.10.2', declared: '0.13.0' }).execute();
		const engine = byId(components, 'unspaghettit');
		expect(engine.version).toBe('0.10.2');
		expect(engine.status).toBe('reachable');
		// The drift is stated, not hidden — this is the local-checkout case.
		expect(engine.detail).toContain('0.13.0');
	});

	it('falls back to the declared engine version when the engine is silent', async () => {
		const components = await build({ engine: async () => null }).execute();
		const engine = byId(components, 'unspaghettit');
		expect(engine.version).toBe('0.13.0');
		expect(engine.status).toBe('unknown');
	});

	it('reads a standalone install as not-configured, never as broken', async () => {
		const components = await build({ back: async () => null }).execute();
		expect(byId(components, 'back').status).toBe('not-configured');
		expect(byId(components, 'dpo').status).toBe('not-configured');
	});

	it('keeps a reachable back without a version as unknown rather than guessing', async () => {
		const components = await build({
			back: async () => ({ reachable: true, apiVersion: null, dpo: 'available', dpoVersion: null })
		}).execute();
		const back = byId(components, 'back');
		expect(back.status).toBe('unknown');
		expect(back.version).toBeNull();
		expect(byId(components, 'dpo').status).toBe('unknown');
	});

	it('surfaces the versions a back reports for itself and the DPO engine', async () => {
		const components = await build({
			back: async () => ({
				reachable: true,
				apiVersion: '0.3.0',
				dpo: 'available',
				dpoVersion: '1.2.3'
			})
		}).execute();
		expect(byId(components, 'back').version).toBe('0.3.0');
		expect(byId(components, 'dpo')).toMatchObject({ version: '1.2.3', status: 'reachable' });
	});

	it('marks a configured but silent back unreachable', async () => {
		const components = await build({
			back: async () => ({ reachable: false, apiVersion: null, dpo: 'unknown', dpoVersion: null })
		}).execute();
		expect(byId(components, 'back').status).toBe('unreachable');
		const dpo = byId(components, 'dpo');
		expect(dpo.status).toBe('unknown');
		// Nothing reported anything here, so the row must not claim it did.
		expect(dpo.detail).not.toMatch(/^Reported by/);
	});

	it('degrades a single row when its probe throws, never the screen', async () => {
		const components = await build({
			engine: async () => {
				throw new Error('engine exploded');
			},
			datastore: async () => {
				throw new Error('db exploded');
			}
		}).execute();
		expect(components).toHaveLength(6);
		expect(byId(components, 'unspaghettit').status).toBe('unknown');
		expect(byId(components, 'postgres').status).toBe('unreachable');
		expect(byId(components, 'platform').status).toBe('running');
	});

	it('shows nothing about the host when the kit never recorded one', async () => {
		const components = await build({}).execute();
		expect(components.filter((c) => c.origin === 'host')).toEqual([]);
	});

	it('adds the recorded machine, the PC behind it and what Docker grants', async () => {
		const components = await build({ host: async () => HOST }).execute();
		const machine = byId(components, 'machine');
		// A WSL2 guest is named for what it is: its 12 GiB is an allocation.
		expect(machine.name).toBe('WSL2 virtual machine');
		expect(machine.version).toBe('Ubuntu 22.04.4 LTS');
		expect(machine.status).toBe('recorded');
		expect(machine.build).toMatchObject({ Memory: '12 GiB', Cores: '12' });
		// The date and the release the reading belongs to, never a bare snapshot.
		expect(machine.detail).toContain('2026-07-22');
		expect(machine.detail).toContain('2026.07-3');
		expect(byId(components, 'windows-host').build).toMatchObject({ Memory: '32 GiB' });
		expect(byId(components, 'docker').version).toBe('27.4.0');
		expect(byId(components, 'install').build).toMatchObject({
			Installed: '2026-05-02',
			'Last update': '2026-07-22',
			'Updated from': '2026.06-1'
		});
	});

	it('reports what this container itself holds, with or without a record', async () => {
		const resources = async () => ({ cpus: 4, memoryLimitGiB: 2, memoryTotalGiB: 12 });
		const components = await build({ resources }).execute();
		const container = byId(components, 'container');
		expect(container.status).toBe('running');
		expect(container.version).toBe('4 cores');
		expect(container.build).toMatchObject({ 'Memory limit': '2 GiB' });
	});

	it('degrades the host section alone when its file cannot be read', async () => {
		const components = await build({
			host: async () => {
				throw new Error('unreadable');
			},
			resources: async () => ({ cpus: 4, memoryLimitGiB: null, memoryTotalGiB: 12 })
		}).execute();
		expect(components.some((c) => c.id === 'machine')).toBe(false);
		expect(byId(components, 'container').status).toBe('running');
		expect(byId(components, 'platform').status).toBe('running');
	});

	it('caches probes within the TTL and re-probes when forced', async () => {
		let calls = 0;
		const useCase = build({
			engine: async () => {
				calls += 1;
				return '0.13.0';
			}
		});
		await useCase.execute();
		await useCase.execute();
		expect(calls).toBe(1);
		await useCase.execute(true);
		expect(calls).toBe(2);
	});
});
