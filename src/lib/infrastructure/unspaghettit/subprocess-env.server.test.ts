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
			UNSPA_FILE_NAMING: 'id'
		});
		expect(JSON.stringify(env)).not.toContain('secret');
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
