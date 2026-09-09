import { resolve } from 'node:path';

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
