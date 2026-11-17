import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unspaghettitSubprocessCwd, unspaghettitSubprocessEnv } from './subprocess-env.server';

describe('unspaghettitSubprocessEnv', () => {
	it('passes only process essentials and the snapshot boundary', () => {
		const env = unspaghettitSubprocessEnv(
			{
				PATH: '/usr/bin',
				HOME: '/srv/lyriks',
				NODE_ENV: 'production',
				ANTHROPIC_API_KEY: 'secret-byok',
				LYRIKS_PG_URL: 'postgres://secret',
				LYRIKS_LICENSE_PRIVATE_KEY: 'secret-signing-key',
				NODE_OPTIONS: '--require attacker.js'
			},
			'./data/unspa'
		);

		expect(env).toEqual({
			PATH: '/usr/bin',
			HOME: '/srv/lyriks',
			NODE_ENV: 'production',
			UNSPA_SNAPSHOTS: resolve('./data/unspa'),
			UNSPA_FILE_NAMING: 'id',
			UNSPA_SOLVER: 'off'
		});
		expect(JSON.stringify(env)).not.toContain('secret');
	});

	it('runs no solver where the installation does not prove, whatever the host asks', () => {
		const env = unspaghettitSubprocessEnv(
			{ PATH: '/usr/bin', UNSPA_SOLVER: 'wasm', UNSPA_SOLVER_PROCESSES: '6' },
			'./data/unspa'
		);
		expect(env.UNSPA_SOLVER).toBe('off');
		expect(env.UNSPA_SOLVER_PROCESSES).toBeUndefined();
		// Criterion 922ee1bd: the engine loads no proof module at all.
		expect(env.UNSPA_PROVER).toBeUndefined();
		expect(unspaghettitSubprocessEnv({ UNSPA_PROVER: '/opt/prover' }, './data/unspa').UNSPA_PROVER).toBeUndefined();
	});

	it('loads the proof module where the installation proves, the one the host names if any', () => {
		expect(unspaghettitSubprocessEnv({}, './data/unspa', true).UNSPA_PROVER).toBe('@lyriks/unspa-prover');
		expect(unspaghettitSubprocessEnv({ UNSPA_PROVER: ' /opt/prover ' }, './data/unspa', true).UNSPA_PROVER).toBe(
			'/opt/prover'
		);
	});

	it('runs the native solver only where the installation proves, with its tuning', () => {
		const env = unspaghettitSubprocessEnv(
			{ PATH: '/usr/bin', UNSPA_SOLVER: 'wasm', UNSPA_SOLVER_PROCESSES: '6', UNSPA_Z3_PATH: '/opt/z3' },
			'./data/unspa',
			true
		);
		expect(env.UNSPA_SOLVER).toBe('native');
		expect(env.UNSPA_SOLVER_PROCESSES).toBe('6');
		expect(env.UNSPA_Z3_PATH).toBe('/opt/z3');
		expect(unspaghettitSubprocessEnv({ UNSPA_SOLVER: 'off' }, './data/unspa', true).UNSPA_SOLVER).toBe('off');
	});
});

describe('unspaghettitSubprocessCwd', () => {
	it('starts the engine in a private empty directory, away from any checkout index', () => {
		const cwd = unspaghettitSubprocessCwd();
		try {
			expect(cwd.startsWith(tmpdir())).toBe(true);
			expect(readdirSync(cwd)).toEqual([]);
			// The engine adopts the first `.unspa.json` between its working directory
			// and a repository root: this one must not sit under the platform checkout.
			expect(cwd.startsWith(process.cwd())).toBe(false);
			expect(existsSync(join(cwd, '.unspa.json'))).toBe(false);
			expect(unspaghettitSubprocessCwd()).toBe(cwd);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
