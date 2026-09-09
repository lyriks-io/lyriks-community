import { afterEach, describe, expect, it, vi } from 'vitest';
import { backSyncRetryDelaySeconds, type BackSyncOutboxPort } from '../ports';
import { DrainBackSyncOutboxUseCase } from './drain-back-sync-outbox';

/** In-memory outbox mirroring the PG adapter's coalescing + backoff contract. */
class InMemoryBackSyncOutbox implements BackSyncOutboxPort {
	readonly rows = new Map<
		string,
		{ queuedAt: string; attempts: number; nextAttemptAt: number; lastError: string | null }
	>();

	async enqueue(projectId: string): Promise<void> {
		const existing = this.rows.get(projectId);
		this.rows.set(projectId, {
			queuedAt: existing?.queuedAt ?? new Date().toISOString(),
			attempts: 0,
			nextAttemptAt: Date.now(),
			lastError: existing?.lastError ?? null
		});
	}

	async due(limit: number): Promise<string[]> {
		const now = Date.now();
		return [...this.rows.entries()]
			.filter(([, row]) => row.nextAttemptAt <= now)
			.sort(([, a], [, b]) => a.nextAttemptAt - b.nextAttemptAt)
			.slice(0, limit)
			.map(([projectId]) => projectId);
	}

	async succeeded(projectId: string): Promise<void> {
		this.rows.delete(projectId);
	}

	async failed(projectId: string, error: string): Promise<void> {
		const row = this.rows.get(projectId);
		if (!row) return;
		row.attempts += 1;
		row.nextAttemptAt = Date.now() + backSyncRetryDelaySeconds(row.attempts) * 1000;
		row.lastError = error;
	}

	async pending() {
		const oldest = [...this.rows.values()].map((row) => row.queuedAt).sort()[0] ?? null;
		return { count: this.rows.size, oldestQueuedAt: oldest };
	}
}

function createDrain(pushResults: Record<string, () => Promise<boolean>>) {
	const outbox = new InMemoryBackSyncOutbox();
	const execute = vi.fn(async (projectId: string) => {
		const push = pushResults[projectId];
		if (!push) throw new Error(`unexpected push for ${projectId}`);
		return push();
	});
	const drain = new DrainBackSyncOutboxUseCase(outbox, { execute });
	return { outbox, drain, execute };
}

describe('backSyncRetryDelaySeconds', () => {
	it('doubles from 10s and caps at 15 minutes', () => {
		expect(backSyncRetryDelaySeconds(1)).toBe(10);
		expect(backSyncRetryDelaySeconds(2)).toBe(20);
		expect(backSyncRetryDelaySeconds(5)).toBe(160);
		expect(backSyncRetryDelaySeconds(8)).toBe(900);
		expect(backSyncRetryDelaySeconds(20)).toBe(900);
	});
});

describe('DrainBackSyncOutboxUseCase', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('pushes every due project and clears the row on success', async () => {
		const { outbox, drain, execute } = createDrain({
			'project-1': async () => true,
			'project-2': async () => true
		});
		await outbox.enqueue('project-1');
		await outbox.enqueue('project-2');

		await drain.execute();

		expect(execute).toHaveBeenCalledTimes(2);
		expect(await outbox.pending()).toEqual({ count: 0, oldestQueuedAt: null });
	});

	it('keeps the row with backoff and a recorded error when the push reports failure', async () => {
		const { outbox, drain } = createDrain({ 'project-1': async () => false });
		await outbox.enqueue('project-1');

		await drain.execute();

		const row = outbox.rows.get('project-1');
		expect(row?.attempts).toBe(1);
		expect(row?.lastError).toContain('envelope push to back failed');
		expect(row?.nextAttemptAt).toBeGreaterThan(Date.now() + 9_000);
		// Backed off — an immediate second pass finds nothing due.
		expect(await outbox.due(10)).toEqual([]);
	});

	it('records a thrown push as a failed attempt instead of rejecting', async () => {
		const { outbox, drain } = createDrain({
			'project-1': async () => {
				throw new Error('socket hang up');
			}
		});
		await outbox.enqueue('project-1');

		await expect(drain.execute()).resolves.toBeUndefined();
		expect(outbox.rows.get('project-1')?.lastError).toContain('socket hang up');
	});

	it('a fresh enqueue resets the retry ladder after failures', async () => {
		const { outbox, drain } = createDrain({ 'project-1': async () => false });
		await outbox.enqueue('project-1');
		await drain.execute();
		expect(await outbox.due(10)).toEqual([]);

		await outbox.enqueue('project-1');
		expect(await outbox.due(10)).toEqual(['project-1']);
		expect(outbox.rows.get('project-1')?.attempts).toBe(0);
	});

	it('ignores an overlapping trigger while a pass is in flight', async () => {
		let releasePush!: () => void;
		const gate = new Promise<void>((resolve) => (releasePush = resolve));
		const { outbox, drain, execute } = createDrain({
			'project-1': async () => {
				await gate;
				return true;
			}
		});
		await outbox.enqueue('project-1');
		const due = vi.spyOn(outbox, 'due');

		const first = drain.execute();
		await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
		const second = drain.execute();
		releasePush();
		await Promise.all([first, second]);

		expect(due).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('never rejects when the outbox itself fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const outbox = new InMemoryBackSyncOutbox();
		vi.spyOn(outbox, 'due').mockRejectedValueOnce(new Error('pg down'));
		const drain = new DrainBackSyncOutboxUseCase(outbox, { execute: async () => true });

		await expect(drain.execute()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('outbox drain failed'),
			expect.stringContaining('pg down')
		);
		// The in-flight flag was released — the next pass runs normally.
		await outbox.enqueue('project-1');
		await drain.execute();
		expect(await outbox.pending()).toEqual({ count: 0, oldestQueuedAt: null });
	});
});
