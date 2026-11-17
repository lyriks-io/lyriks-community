import { describe, expect, it } from 'vitest';
import { SyncBackLicenceUseCase } from './sync-back-licence';
import type {
	ActivationRepositoryPort,
	BackLicenceSyncPort,
	ClockPort,
	StoredActivation
} from '../ports';

function activations(stored: StoredActivation | null): ActivationRepositoryPort {
	return {
		load: async () => stored,
		save: async () => {},
	loadPrevious: async () => null,
		clear: async () => {},
		readClockFloor: async () => null,
		advanceClockFloor: async () => {},
		ensureInstallId: async () => 'test-install'
	};
}

/** Records every key pushed, so a test can assert what the Back received. */
function backSync(enabled = true) {
	const pushed: (string | null)[] = [];
	const port: BackLicenceSyncPort = {
		enabled,
		sync: async (key) => {
			pushed.push(key);
			return true;
		}
	};
	return { port, pushed };
}

const clockAt = (iso: string): ClockPort => ({ nowIso: () => iso });

const KEY = 'lyk_key.sig';

describe('SyncBackLicenceUseCase', () => {
	it('pushes the stored key to the Back', async () => {
		const { port, pushed } = backSync();
		const uc = new SyncBackLicenceUseCase(
			activations({ key: KEY, activatedAt: '2026-08-13T00:00:00.000Z' }),
			port,
			clockAt('2026-08-13T00:00:00.000Z')
		);
		expect(await uc.execute(true)).toBe(true);
		expect(pushed).toEqual([KEY]);
	});

	it('pushes null when nothing is activated (clears the Back)', async () => {
		const { port, pushed } = backSync();
		const uc = new SyncBackLicenceUseCase(activations(null), port, clockAt('2026-08-13T00:00:00.000Z'));
		await uc.execute(true);
		expect(pushed).toEqual([null]);
	});

	it('does nothing when the Back adapter is disabled (standalone)', async () => {
		const { port, pushed } = backSync(false);
		const uc = new SyncBackLicenceUseCase(
			activations({ key: KEY, activatedAt: 'x' }),
			port,
			clockAt('2026-08-13T00:00:00.000Z')
		);
		expect(await uc.execute(true)).toBe(false);
		expect(pushed).toEqual([]);
	});

	it('throttles unforced calls to at most once per minute', async () => {
		const { port, pushed } = backSync();
		const activationRepo = activations({ key: KEY, activatedAt: 'x' });
		// First unforced call at t0 pushes; a second 30s later is throttled; 61s later pushes again.
		const uc = new SyncBackLicenceUseCase(activationRepo, port, {
			nowIso: (() => {
				const times = [
					'2026-08-13T00:00:00.000Z',
					'2026-08-13T00:00:30.000Z',
					'2026-08-13T00:01:01.000Z'
				];
				let i = 0;
				return () => times[Math.min(i++, times.length - 1)];
			})()
		});
		expect(await uc.execute()).toBe(true); // t0: pushes
		expect(await uc.execute()).toBe(false); // t0+30s: throttled
		expect(await uc.execute()).toBe(true); // t0+61s: pushes
		expect(pushed).toEqual([KEY, KEY]);
	});

	it('forced calls bypass the throttle', async () => {
		const { port, pushed } = backSync();
		const uc = new SyncBackLicenceUseCase(
			activations({ key: KEY, activatedAt: 'x' }),
			port,
			clockAt('2026-08-13T00:00:00.000Z')
		);
		await uc.execute(true);
		await uc.execute(true);
		expect(pushed).toEqual([KEY, KEY]);
	});
});
