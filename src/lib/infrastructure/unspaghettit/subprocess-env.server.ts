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

/** How an installation that proves may tune its solver (processes, timeouts, binary). */
const SOLVER_TUNING = [
	'UNSPA_SOLVER_PROCESSES',
	'UNSPA_SOLVER_IDLE_MS',
	'UNSPA_SOLVER_LIMIT_S',
	'UNSPA_Z3_PATH',
	'UNSPA_PROOF_CACHE'
] as const;

/** The proof module an installation that proves loads into the engine, unless the host names another. */
export const PROOF_MODULE = '@lyriks/unspa-prover';

/**
 * Minimal environment for the isolated optional engine subprocess. `proofs`
 * says whether this installation proves the spec (Enterprise): the engine then
 * loads the proof module (UNSPA_PROVER), which runs the native solver or none,
 * never the WebAssembly one, which can take gigabytes per proof. Without it
 * the engine holds no solver and loads none.
 */
export function unspaghettitSubprocessEnv(
	host: NodeJS.ProcessEnv,
	snapshotsRoot: string,
	proofs = false
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
	// An operator may still turn the solver off on an installation that proves.
	child.UNSPA_SOLVER = proofs && host.UNSPA_SOLVER?.trim().toLowerCase() !== 'off' ? 'native' : 'off';
	if (proofs) {
		child.UNSPA_PROVER = host.UNSPA_PROVER?.trim() || PROOF_MODULE;
		for (const key of SOLVER_TUNING) {
			const value = host[key];
			if (value) child[key] = value;
		}
	}
	return child;
}
