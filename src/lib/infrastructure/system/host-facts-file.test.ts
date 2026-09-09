import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HostFactsFile } from './host-facts-file.server';

async function fileWith(content: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'lyriks-host-'));
	const path = join(dir, 'host.json');
	await writeFile(path, content, 'utf8');
	return path;
}

describe('HostFactsFile', () => {
	it('reads the record the appliance kit writes', async () => {
		const path = await fileWith(
			JSON.stringify({
				schema: 1,
				event: 'install',
				release: '2026.08-41',
				machine: { os: 'Debian 12', cpus: 8, memoryGiB: 16 }
			})
		);
		const facts = await new HostFactsFile(path).read();
		expect(facts?.release).toBe('2026.08-41');
		expect(facts?.machine?.memoryGiB).toBe(16);
	});

	it('answers null when no install ever recorded a host', async () => {
		expect(await new HostFactsFile('/nowhere/host.json').read()).toBeNull();
	});

	it('answers null on a truncated or corrupted file instead of throwing', async () => {
		const path = await fileWith('{ "machine": { "os": "Debian');
		expect(await new HostFactsFile(path).read()).toBeNull();
	});

	it('refuses a file far larger than the record can be', async () => {
		const path = await fileWith(JSON.stringify({ machine: { os: 'x'.repeat(70_000) } }));
		expect(await new HostFactsFile(path).read()).toBeNull();
	});
});
