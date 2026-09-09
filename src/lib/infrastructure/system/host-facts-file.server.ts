import { readFile } from 'node:fs/promises';
import type { HostFactsPort } from '$application/ports';
import { parseHostFacts, type HostFacts } from '$domain/system';

/**
 * Where the appliance kit leaves what it read off the host. The compose file
 * mounts the kit's own `host/` directory here, read-only; nothing in the app
 * ever writes it, and no install is required to have one.
 */
const DEFAULT_PATH = '/app/data/host/host.json';

/** Big enough for the record several times over, small enough to reject a mistake. */
const MAX_BYTES = 64 * 1024;

/**
 * The host facts, as a file. `install.sh` and `./lyriks update` write it on the
 * host, where the machine is actually visible; this container can only read it.
 *
 * Every failure is the same answer: `null`. A missing file is the ordinary state
 * of an install whose kit predates the feature, or one deployed by hand, and the
 * Versions screen is built to show nothing rather than guess.
 */
export class HostFactsFile implements HostFactsPort {
	constructor(private readonly path: string = DEFAULT_PATH) {}

	async read(): Promise<HostFacts | null> {
		try {
			const raw = await readFile(this.path, 'utf8');
			if (raw.length > MAX_BYTES) return null;
			return parseHostFacts(JSON.parse(raw));
		} catch {
			return null;
		}
	}
}
