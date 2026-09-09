/**
 * What this install runs ON: the machine, what Docker grants it, and (on
 * Windows) the PC behind the WSL2 virtual machine.
 *
 * None of it can be read from inside the container. Under Docker Desktop the
 * process sees the Linux VM, whose CPU and memory are an allocation rather than
 * hardware, so a "16 GiB" answer would describe a setting and not the machine.
 * The appliance kit therefore reads the host at install and at every update and
 * leaves the facts in a file this container mounts read-only; everything here is
 * the anti-corruption layer over that file, plus the mapping onto the same
 * component rows the Versions screen already shows.
 *
 * Two consequences the screen must state rather than hide:
 *  - **These are a snapshot**, taken when the appliance was last installed or
 *    updated. Add RAM to the host and the record only catches up at the next
 *    update, which is why every block carries the moment it was read.
 *  - **Absence is normal.** An install whose kit predates the file (or one
 *    deployed by hand) shows no host section at all, never a guess.
 *
 * Pure: no IO. The adapter reads bytes, this parses and shapes them.
 */
import type { ComponentVersion } from './components';

/** The box the kit ran on. Under WSL2 or a hypervisor, that is the guest. */
export interface MachineFacts {
	readonly os: string | null;
	readonly kernel: string | null;
	readonly arch: string | null;
	readonly cpu: string | null;
	readonly cpus: number | null;
	readonly memoryGiB: number | null;
	readonly diskFreeGiB: number | null;
	readonly diskSizeGiB: number | null;
	/** `wsl`, `kvm`, `none`… why the memory above may not be the memory bought. */
	readonly virtualisation: string | null;
	readonly readAt: string | null;
}

/** What the engine actually grants the containers: the OOM numbers. */
export interface DockerFacts {
	readonly server: string | null;
	readonly compose: string | null;
	readonly os: string | null;
	readonly kernel: string | null;
	readonly cpus: number | null;
	readonly memoryGiB: number | null;
	readonly storageDriver: string | null;
	readonly readAt: string | null;
}

/** The real PC behind a WSL2 install, read through Windows interop. */
export interface WindowsFacts {
	readonly os: string | null;
	readonly cpu: string | null;
	readonly cpus: number | null;
	readonly memoryGiB: number | null;
	readonly readAt: string | null;
}

export interface HostFacts {
	/** Whether the machine was read at a first install or at an update. */
	readonly event: string | null;
	readonly recordedAt: string | null;
	/** First install of this appliance, carried forward across updates. */
	readonly installedAt: string | null;
	readonly release: string | null;
	readonly previousRelease: string | null;
	readonly kit: string | null;
	/** How the install came to exist: `bootstrap`, `windows-bootstrap`, `kit`. */
	readonly method: string | null;
	readonly machine: MachineFacts | null;
	readonly docker: DockerFacts | null;
	readonly windows: WindowsFacts | null;
}

/** What the platform process itself is given, read in-process at request time. */
export interface ContainerResources {
	/** CPUs visible to this process. */
	readonly cpus: number | null;
	/** The cgroup memory ceiling, when one is set (`null` = unlimited). */
	readonly memoryLimitGiB: number | null;
	/** Memory the kernel reports to this process. */
	readonly memoryTotalGiB: number | null;
}

/* ------------------------------------------------------------------ parsing */

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/**
 * A non-empty string, or null. Bounded: this file is small by construction, and
 * a corrupted one must not push a megabyte into a feedback report.
 */
function str(source: Record<string, unknown>, key: string): string | null {
	const value = source[key];
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, 200) : null;
}

/** A finite, non-negative number, or null. Anything else is not a measurement. */
function num(source: Record<string, unknown>, key: string): number | null {
	const value = source[key];
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
	return value;
}

function machine(raw: unknown): MachineFacts | null {
	const source = record(raw);
	if (!source) return null;
	return {
		os: str(source, 'os'),
		kernel: str(source, 'kernel'),
		arch: str(source, 'arch'),
		cpu: str(source, 'cpu'),
		cpus: num(source, 'cpus'),
		memoryGiB: num(source, 'memoryGiB'),
		diskFreeGiB: num(source, 'diskFreeGiB'),
		diskSizeGiB: num(source, 'diskSizeGiB'),
		virtualisation: str(source, 'virtualisation'),
		readAt: str(source, 'readAt')
	};
}

function docker(raw: unknown): DockerFacts | null {
	const source = record(raw);
	if (!source) return null;
	return {
		server: str(source, 'server'),
		compose: str(source, 'compose'),
		os: str(source, 'os'),
		kernel: str(source, 'kernel'),
		cpus: num(source, 'cpus'),
		memoryGiB: num(source, 'memoryGiB'),
		storageDriver: str(source, 'storageDriver'),
		readAt: str(source, 'readAt')
	};
}

function windows(raw: unknown): WindowsFacts | null {
	const source = record(raw);
	if (!source) return null;
	return {
		os: str(source, 'os'),
		cpu: str(source, 'cpu'),
		cpus: num(source, 'cpus'),
		memoryGiB: num(source, 'memoryGiB'),
		readAt: str(source, 'readAt')
	};
}

/**
 * Parse the file the kit wrote. Anything unrecognisable yields `null`, which the
 * screen reads as "this install never recorded its host": the same honest
 * outcome as a missing file.
 */
export function parseHostFacts(raw: unknown): HostFacts | null {
	const source = record(raw);
	if (!source) return null;
	const facts: HostFacts = {
		event: str(source, 'event'),
		recordedAt: str(source, 'recordedAt'),
		installedAt: str(source, 'installedAt'),
		release: str(source, 'release'),
		previousRelease: str(source, 'previousRelease'),
		kit: str(source, 'kit'),
		method: str(source, 'method'),
		machine: machine(source.machine),
		docker: docker(source.docker),
		windows: windows(source.windows)
	};
	// A record that describes no vantage point at all describes nothing.
	return facts.machine || facts.docker || facts.windows ? facts : null;
}

/* ------------------------------------------------------------------- shaping */

function gib(value: number | null): string | null {
	return value === null ? null : `${value} GiB`;
}

function count(value: number | null): string | null {
	return value === null ? null : String(value);
}

/** Build a facts map, dropping every fact the host did not report. */
function factMap(
	entries: readonly (readonly [string, string | null])[]
): Record<string, string> | undefined {
	const kept = entries.filter((entry): entry is readonly [string, string] => entry[1] !== null);
	return kept.length ? Object.fromEntries(kept) : undefined;
}

/** A WSL2 guest is not the machine an operator thinks they are looking at. */
function isWsl(machineFacts: MachineFacts): boolean {
	return (machineFacts.virtualisation ?? '').toLowerCase().startsWith('wsl');
}

/** Never a bare date: which moment produced this reading is half the fact. */
function recordedSentence(host: HostFacts): string {
	const when = host.recordedAt ? `, on ${host.recordedAt.slice(0, 10)}` : '';
	const release = host.release ? ` to ${host.release}` : '';
	const moment = host.event === 'update' ? `the last update${release}` : `the install${release}`;
	return `Read on the host during ${moment}${when}.`;
}

function machineRow(host: HostFacts, machineFacts: MachineFacts): ComponentVersion {
	const wsl = isWsl(machineFacts);
	const disk =
		machineFacts.diskFreeGiB === null
			? null
			: machineFacts.diskSizeGiB === null
				? `${machineFacts.diskFreeGiB} GiB free`
				: `${machineFacts.diskFreeGiB} GiB free of ${machineFacts.diskSizeGiB} GiB`;
	return {
		id: 'machine',
		name: wsl ? 'WSL2 virtual machine' : 'Machine',
		origin: 'host',
		version: machineFacts.os,
		status: 'recorded',
		detail: wsl
			? `${recordedSentence(host)} A WSL2 guest is granted its CPU and memory by Windows, so these are not the PC's own figures.`
			: recordedSentence(host),
		build: factMap([
			['Processor', machineFacts.cpu],
			['Cores', count(machineFacts.cpus)],
			['Memory', gib(machineFacts.memoryGiB)],
			['Disk', disk],
			['Kernel', machineFacts.kernel],
			['Architecture', machineFacts.arch],
			['Virtualisation', machineFacts.virtualisation]
		])
	};
}

function windowsRow(windowsFacts: WindowsFacts): ComponentVersion {
	return {
		id: 'windows-host',
		name: 'Windows PC',
		origin: 'host',
		version: windowsFacts.os,
		status: 'recorded',
		detail: 'The machine hosting the WSL2 guest above, read through Windows itself.',
		build: factMap([
			['Processor', windowsFacts.cpu],
			['Cores', count(windowsFacts.cpus)],
			['Memory', gib(windowsFacts.memoryGiB)]
		])
	};
}

function dockerRow(dockerFacts: DockerFacts): ComponentVersion {
	return {
		id: 'docker',
		name: 'Docker engine',
		origin: 'host',
		version: dockerFacts.server,
		status: 'recorded',
		// This memory, not the machine's, is what a container is killed against.
		detail: "What the engine grants this appliance. Containers are killed against these figures, not the machine's.",
		build: factMap([
			['Compose', dockerFacts.compose],
			['Engine OS', dockerFacts.os],
			['Cores', count(dockerFacts.cpus)],
			['Memory', gib(dockerFacts.memoryGiB)],
			['Storage driver', dockerFacts.storageDriver],
			['Kernel', dockerFacts.kernel]
		])
	};
}

/**
 * The one row that needs no kit: what this process is given right now. It is
 * also the guard against a stale record, since it is read live on every load.
 */
function containerRow(resources: ContainerResources): ComponentVersion {
	return {
		id: 'container',
		name: 'This container',
		origin: 'host',
		// A container has no version, and the digest prints this slot: the count
		// it was granted is the honest headline, where "unknown" would be a lie.
		version: resources.cpus === null ? null : `${resources.cpus} cores`,
		status: 'running',
		detail: 'What the platform process itself sees, read live.',
		build: factMap([
			[
				'Memory limit',
				resources.memoryLimitGiB === null
					? "none (the engine's own limit applies)"
					: gib(resources.memoryLimitGiB)
			],
			['Memory visible', gib(resources.memoryTotalGiB)]
		])
	};
}

/** How the appliance came to exist, in the words an operator would use. */
function methodLabel(method: string | null): string | null {
	switch (method) {
		case 'bootstrap':
			return 'the get.lyriks.io one-line install';
		case 'windows-bootstrap':
			return 'the get.lyriks.io Windows install';
		case 'kit':
			return 'the appliance kit, by hand';
		default:
			return method;
	}
}

/** A day is the useful grain here; the hour would only add noise to a ticket. */
function day(iso: string | null): string | null {
	return iso ? iso.slice(0, 10) : null;
}

/**
 * The appliance's own history: when it was first installed, when it last moved,
 * and which kit did it. None of this is visible anywhere else, and it is the
 * first thing asked in a support conversation.
 */
function installRow(host: HostFacts): ComponentVersion | null {
	const build = factMap([
		['Installed', day(host.installedAt)],
		['Last update', host.event === 'update' ? day(host.recordedAt) : null],
		['Updated from', host.previousRelease],
		['Kit', host.kit],
		['Installed with', methodLabel(host.method)]
	]);
	if (!build && !host.release) return null;
	return {
		id: 'install',
		name: 'This install',
		origin: 'host',
		version: host.release,
		status: 'recorded',
		detail: 'Written by the appliance kit at install and at every update.',
		build
	};
}

/**
 * The host section of Settings → Versions, in reading order: the install
 * itself, the machine, the PC behind it when there is one, what Docker grants,
 * and what this process actually holds. `host` is null on an install that never
 * recorded one, and the container row still stands alone.
 */
export function hostComponents(
	host: HostFacts | null,
	resources: ContainerResources | null
): ComponentVersion[] {
	const rows: ComponentVersion[] = [];
	if (host) {
		const install = installRow(host);
		if (install) rows.push(install);
	}
	if (host?.machine) rows.push(machineRow(host, host.machine));
	if (host?.windows) rows.push(windowsRow(host.windows));
	if (host?.docker) rows.push(dockerRow(host.docker));
	if (resources) rows.push(containerRow(resources));
	return rows;
}
