import { describe, expect, it } from 'vitest';
import { componentsReport } from './components';
import { hostComponents, parseHostFacts } from './host-facts';

/** Exactly what the appliance kit writes, byte shape included. */
const RECORD = {
	schema: 1,
	event: 'update',
	recordedAt: '2026-08-24T11:21:02Z',
	installedAt: '2026-08-01T09:00:00Z',
	release: '2026.08-41',
	previousRelease: '2026.08-40',
	kit: '2026.08-41',
	method: 'bootstrap',
	machine: {
		os: 'Ubuntu 22.04.4 LTS',
		kernel: 'Linux 5.15.167.4-microsoft-standard-WSL2',
		arch: 'x86_64',
		cpu: 'AMD Ryzen 5 5600X 6-Core Processor',
		cpus: 12,
		memoryGiB: 12,
		diskFreeGiB: 217,
		diskSizeGiB: 251,
		virtualisation: 'wsl',
		readAt: '2026-08-24T11:21:02Z'
	},
	docker: {
		server: '27.4.0',
		compose: '2.31.0-desktop.2',
		os: 'Docker Desktop',
		kernel: 'Linux 5.15.167.4-microsoft-standard-WSL2',
		cpus: 12,
		memoryGiB: 12,
		storageDriver: 'overlayfs',
		readAt: '2026-08-24T11:21:02Z'
	},
	windows: {
		os: 'Microsoft Windows 11 Famille 10.0.26200',
		cpu: 'AMD Ryzen 5 5600X 6-Core Processor',
		cpus: 12,
		memoryGiB: 32,
		readAt: '2026-08-24T11:21:02Z'
	}
};

describe('parseHostFacts', () => {
	it('reads the record the kit writes', () => {
		const facts = parseHostFacts(RECORD);
		expect(facts?.machine?.memoryGiB).toBe(12);
		expect(facts?.windows?.memoryGiB).toBe(32);
		expect(facts?.docker?.storageDriver).toBe('overlayfs');
		expect(facts?.previousRelease).toBe('2026.08-40');
	});

	it('answers null for anything that is not a record', () => {
		expect(parseHostFacts(null)).toBeNull();
		expect(parseHostFacts('12 GiB')).toBeNull();
		expect(parseHostFacts([RECORD])).toBeNull();
		// Well-formed JSON that describes no machine at all describes nothing.
		expect(parseHostFacts({ schema: 1, event: 'install' })).toBeNull();
	});

	it('drops a fact it cannot trust rather than passing it through', () => {
		const facts = parseHostFacts({
			machine: { os: '  ', cpus: 'twelve', memoryGiB: -4, diskFreeGiB: 217 }
		});
		expect(facts?.machine?.os).toBeNull();
		expect(facts?.machine?.cpus).toBeNull();
		expect(facts?.machine?.memoryGiB).toBeNull();
		expect(facts?.machine?.diskFreeGiB).toBe(217);
	});
});

describe('hostComponents', () => {
	it('names a WSL2 guest for what it is and keeps the PC beside it', () => {
		const rows = hostComponents(parseHostFacts(RECORD), null);
		const machine = rows.find((r) => r.id === 'machine');
		const windows = rows.find((r) => r.id === 'windows-host');
		expect(machine?.name).toBe('WSL2 virtual machine');
		expect(machine?.build?.Memory).toBe('12 GiB');
		// The whole point of the pair: the machine has 32 GiB, Lyriks was given 12.
		expect(windows?.build?.Memory).toBe('32 GiB');
	});

	it('stands the container row up alone when no host was ever recorded', () => {
		const rows = hostComponents(null, { cpus: 4, memoryLimitGiB: 2, memoryTotalGiB: 12 });
		expect(rows.map((r) => r.id)).toEqual(['container']);
		expect(rows[0].version).toBe('4 cores');
		expect(rows[0].build?.['Memory limit']).toBe('2 GiB');
	});

	it('says an unlimited container is unlimited instead of showing a number', () => {
		const rows = hostComponents(null, { cpus: 4, memoryLimitGiB: null, memoryTotalGiB: 12 });
		expect(rows[0].build?.['Memory limit']).toContain('none');
	});

	it('omits a block the host never reported', () => {
		const rows = hostComponents(parseHostFacts({ machine: { os: 'Debian 12' } }), null);
		expect(rows.map((r) => r.id)).toEqual(['machine']);
		expect(rows[0].name).toBe('Machine');
	});

	it('travels in the report a feedback carries', () => {
		const report = componentsReport(hostComponents(parseHostFacts(RECORD), null));
		expect(report).toContain('WSL2 virtual machine: Ubuntu 22.04.4 LTS (recorded)');
		expect(report).toContain('Memory: 12 GiB');
		expect(report).toContain('Windows PC: Microsoft Windows 11 Famille 10.0.26200');
		expect(report).toContain('Docker engine: 27.4.0');
	});
});
