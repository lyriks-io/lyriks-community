import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { unspaghettitSubprocessEnv } from './subprocess-env.server';

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
