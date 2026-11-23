import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	query: vi.fn(),
	connect: vi.fn(),
	options: null as Record<string, unknown> | null
}));

vi.mock('$env/dynamic/private', () => ({ env: { LYRIKS_PG_URL: 'postgres://test', LYRIKS_PG_POOL_MAX: '10' } }));
vi.mock('./pg-migrations.server', () => ({ runMigrations: vi.fn(async () => {}) }));
vi.mock('pg', () => {
	class Pool {
		options: Record<string, unknown>;
		constructor(options: Record<string, unknown>) {
			this.options = options;
			state.options = options;
		}
		query(...args: unknown[]) {
			return state.query(...args);
		}
		connect() {
			return state.connect();
		}
	}
	return { default: { Pool } };
});

const { isConnectTimeout, pgQuery, poolMin, ready } = await import('./pg-database.server');

describe('poolMin', () => {
	it('keeps four connections by default, what is configured otherwise, never more than the maximum', () => {
		expect(poolMin(undefined, 40)).toBe(4);
		expect(poolMin('8', 40)).toBe(8);
		expect(poolMin('0', 40)).toBe(0);
		expect(poolMin('12', 10)).toBe(10);
		expect(poolMin('not a number', 40)).toBe(4);
	});
});

describe('pgQuery', () => {
	beforeEach(() => {
		state.query.mockReset();
		state.connect.mockReset();
		state.connect.mockResolvedValue({ release: vi.fn() });
	});

	it('opens the kept connections once the schema is ready', async () => {
		await ready();
		await vi.waitFor(() => expect(state.connect).toHaveBeenCalledTimes(4));
		expect(state.options).toMatchObject({ max: 10, min: 4 });
	});

	it('tries a statement once more when it found no connection in time', async () => {
		state.query
			.mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'))
			.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
		await expect(pgQuery('SELECT 1')).resolves.toEqual({ rows: [{ ok: 1 }] });
		expect(state.query).toHaveBeenCalledTimes(2);
	});

	it('does not run again a statement the database answered with an error', async () => {
		state.query.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));
		await expect(pgQuery('INSERT 1')).rejects.toThrow('duplicate key');
		expect(state.query).toHaveBeenCalledTimes(1);
	});

	it('gives up after the second wait', async () => {
		state.query.mockRejectedValue(new Error('timeout exceeded when trying to connect'));
		await expect(pgQuery('SELECT 1')).rejects.toThrow('timeout exceeded');
		expect(state.query).toHaveBeenCalledTimes(2);
	});
});

describe('isConnectTimeout', () => {
	it('names only the pool giving up on a connection', () => {
		expect(isConnectTimeout(new Error('timeout exceeded when trying to connect'))).toBe(true);
		expect(isConnectTimeout(new Error('Query read timeout'))).toBe(false);
		expect(isConnectTimeout('timeout exceeded when trying to connect')).toBe(false);
	});
});
