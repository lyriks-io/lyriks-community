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

	async isQueued(projectId: string): Promise<boolean> {
		return this.rows.has(projectId);
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

describe('DrainBackSyncOutboxUseCase under a Back that answers a signed-in person only [criterion:b7048daa]', () => {
	it('does not run a pass with nobody signed in: no push, no attempt counted', async () => {
		const outbox = new InMemoryBackSyncOutbox();
		await outbox.enqueue('p1');
		const push = { execute: vi.fn(async () => true) };
		await new DrainBackSyncOutboxUseCase(outbox, push, () => false).execute();
		expect(push.execute).not.toHaveBeenCalled();
		expect(outbox.rows.get('p1')?.attempts).toBe(0);
	});

	it("sends the copy of the one project asked, never another project's", async () => {
		const outbox = new InMemoryBackSyncOutbox();
		await outbox.enqueue('saved');
		await outbox.enqueue('other');
		const push = { execute: vi.fn(async () => true) };
		await new DrainBackSyncOutboxUseCase(outbox, push, () => true).executeFor('saved');
		expect(push.execute.mock.calls).toEqual([['saved']]);
		expect(outbox.rows.has('saved')).toBe(false);
		expect(outbox.rows.has('other')).toBe(true);
	});

	it('sends nothing for a project whose copy is up to date, or with nobody signed in', async () => {
		const outbox = new InMemoryBackSyncOutbox();
		await outbox.enqueue('waiting');
		const push = { execute: vi.fn(async () => true) };
		await new DrainBackSyncOutboxUseCase(outbox, push, () => true).executeFor('up-to-date');
		await new DrainBackSyncOutboxUseCase(outbox, push, () => false).executeFor('waiting');
		expect(push.execute).not.toHaveBeenCalled();
		expect(outbox.rows.has('waiting')).toBe(true);
	});

	it('counts a failed push of the project asked, as a pass would', async () => {
		const outbox = new InMemoryBackSyncOutbox();
		await outbox.enqueue('p1');
		await new DrainBackSyncOutboxUseCase(outbox, { execute: async () => false }, () => true).executeFor('p1');
		expect(outbox.rows.get('p1')?.attempts).toBe(1);
	});
});
