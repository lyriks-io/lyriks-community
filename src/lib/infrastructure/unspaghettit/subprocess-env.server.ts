import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A private, empty working directory for the engine subprocess.
 *
 * The engine binds itself to the first `.unspa.json` it finds walking up from
 * its working directory. Inherited from a platform run out of its own checkout,
 * that is the PLATFORM's index, of another project: every index-less tool then
 * cross-references a customer's feature against it and answers "all missing".
 * The platform never owns an index (it lives in the caller's repository), so
 * the engine must start where there is none to find.
 */
export function unspaghettitSubprocessCwd(): string {
	// One directory per platform process: a reconnect reuses it, unless a tmp
	// cleaner took it away in the meantime.
	if (!engineCwd || !existsSync(engineCwd)) engineCwd = mkdtempSync(join(tmpdir(), 'lyriks-engine-'));
	return engineCwd;
}

let engineCwd: string | null = null;

const PASSTHROUGH = [
	'HOME',
	'PATH',
	'TMPDIR',
	'TEMP',
	'TMP',
	'LANG',
	'LC_ALL',
	'SYSTEMROOT',
	'COMSPEC',
	'PATHEXT',
	'WINDIR'
] as const;

/** Minimal environment for the isolated optional engine subprocess. */
export function unspaghettitSubprocessEnv(
	host: NodeJS.ProcessEnv,
	snapshotsRoot: string
): Record<string, string> {
	const child: Record<string, string> = {};
	for (const key of PASSTHROUGH) {
		const value = host[key];
		if (value) child[key] = value;
	}
	if (host.NODE_ENV) child.NODE_ENV = host.NODE_ENV;
	child.UNSPA_SNAPSHOTS = resolve(snapshotsRoot);
	// The kernel folder is ours and resolved by id: ask the engine to name the
	// files it writes by id too, so a rename never moves a file and one folder
	// stops holding two naming conventions (ours id-named, the engine's
	// slug-named). Engines that predate the option ignore the variable.
	child.UNSPA_FILE_NAMING = 'id';
	return child;
}
