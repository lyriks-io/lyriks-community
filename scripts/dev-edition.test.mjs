import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	WSL_DEV_PORT,
	WSL_UNSPA_DASHBOARD_PORT,
	devCompanionEnvironment,
	devEditionEnvironment,
	envFileValue,
	hostDatabaseUrl,
	resolveDevDpoEnvironment,
	resolveDevPgUrl,
	viteArguments,
	withWslDefaults
} from './dev-edition.mjs';

describe('development edition presets', () => {
	it('selects the Community deployment and free workspace tier together', () => {
		assert.deepEqual(devEditionEnvironment('community'), {
			LYRIKS_EDITION: 'community',
				LYRIKS_BACK_DEV_PLAN: 'free',
			LYRIKS_BACK_DISABLE: '1'
		});
	});

	it('selects the Enterprise deployment and workspace tier together', () => {
		assert.deepEqual(devEditionEnvironment('enterprise'), {
			LYRIKS_EDITION: 'enterprise',
				LYRIKS_BACK_DEV_PLAN: 'enterprise'
		});
	});

	it('rejects an unknown edition', () => {
		assert.throws(() => devEditionEnvironment('paid'), /community or enterprise/);
	});

	it('does not forward pnpm argument separators to Vite', () => {
		assert.deepEqual(viteArguments(['--', '--host', '127.0.0.1']), ['--host', '127.0.0.1']);
		assert.deepEqual(viteArguments(['--host', '127.0.0.1']), ['--host', '127.0.0.1']);
	});

	it('avoids the WSL-reserved Vite port unless a port was explicitly selected', () => {
		assert.deepEqual(withWslDefaults([], '5.15.0-microsoft-standard-WSL2'), [
			'--port',
			WSL_DEV_PORT
		]);
		assert.deepEqual(withWslDefaults(['--port', '5191'], '5.15.0-microsoft-standard-WSL2'), [
			'--port',
			'5191'
		]);
		assert.deepEqual(withWslDefaults([], '6.8.0-generic'), []);
	});

	it('avoids the appliance MCP port for the WSL Unspaghettit companion', () => {
		assert.deepEqual(devCompanionEnvironment({}, '5.15.0-microsoft-standard-WSL2'), {
			UNSPA_DASHBOARD_PORT: WSL_UNSPA_DASHBOARD_PORT
		});
		assert.deepEqual(
			devCompanionEnvironment(
				{ UNSPA_DASHBOARD_PORT: '3105' },
				'5.15.0-microsoft-standard-WSL2'
			),
			{ UNSPA_DASHBOARD_PORT: '3105' }
		);
		assert.deepEqual(devCompanionEnvironment({}, '6.8.0-generic'), {});
	});

	it('reads quoted and exported dotenv values', () => {
		assert.equal(envFileValue('export LYRIKS_PG_URL="postgres://local/db"', 'LYRIKS_PG_URL'), 'postgres://local/db');
		assert.equal(envFileValue('# ignored\nDATABASE_URL=postgres://back/db', 'DATABASE_URL'), 'postgres://back/db');
	});

	it('translates the Back Docker database hostname for a host-run WSL process', () => {
		assert.equal(
			hostDatabaseUrl('postgresql://lyriks:secret@postgres:5432/lyriks'),
			'postgresql://lyriks:secret@127.0.0.1:5432/lyriks'
		);
	});

	it('resolves PostgreSQL configuration by explicit, platform, then sibling priority', () => {
		const platform = ['LYRIKS_PG_URL=postgres://platform/db'];
		const back = 'DATABASE_URL=postgres://back@postgres:5432/back';
		assert.equal(resolveDevPgUrl({ LYRIKS_PG_URL: 'postgres://explicit/db' }, platform, back), 'postgres://explicit/db');
		assert.equal(resolveDevPgUrl({}, platform, back), 'postgres://platform/db');
		assert.equal(resolveDevPgUrl({}, [], back), 'postgres://back@127.0.0.1:5432/back');
		assert.equal(resolveDevPgUrl({}, [], ''), null);
	});

	it('wires the local formal engine only for Enterprise development', () => {
		assert.deepEqual(resolveDevDpoEnvironment('community', {}, [], ''), {});
		assert.deepEqual(resolveDevDpoEnvironment('enterprise', {}, [], ''), {
			ENGINE_GRPC_ADDR: '127.0.0.1:50051',
			ENGINE_AUTH_TOKEN: 'lyriks-local-development',
			ENGINE_HTTP_URL: 'http://127.0.0.1:8081'
		});
	});

	it('prefers explicit DPO configuration over platform and sibling dotenv values', () => {
		assert.deepEqual(
			resolveDevDpoEnvironment(
				'enterprise',
				{ ENGINE_GRPC_ADDR: '127.0.0.1:51000', ENGINE_AUTH_TOKEN: 'explicit' },
				['ENGINE_GRPC_ADDR=127.0.0.1:52000\nENGINE_AUTH_TOKEN=platform'],
				'ENGINE_GRPC_ADDR=engine:50051\nENGINE_AUTH_TOKEN=back\nENGINE_HTTP_URL=http://engine:8080'
			),
			{
				ENGINE_GRPC_ADDR: '127.0.0.1:51000',
				ENGINE_AUTH_TOKEN: 'explicit',
				// Not set explicitly ⇒ the sibling back's value wins over the fallback.
				ENGINE_HTTP_URL: 'http://engine:8080'
			}
		);
	});
});
