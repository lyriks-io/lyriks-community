import { describe, expect, it, vi } from 'vitest';
import { CheckForUpdateUseCase } from './check-for-update';
import type { ClockPort } from '../ports/clock';
import type { UpdateFeedPort } from '../ports/update-feed';

/** A clock the test advances by hand, so the TTL is exercised deterministically. */
function fakeClock(startMs = Date.parse('2026-07-17T00:00:00.000Z')) {
	let ms = startMs;
	return {
		clock: { nowIso: () => new Date(ms).toISOString() } satisfies ClockPort,
		advanceHours: (h: number) => {
			ms += h * 60 * 60 * 1000;
		}
	};
}

function feed(tags: readonly string[] | null, enabled = true): UpdateFeedPort {
	return { enabled, listVersions: vi.fn().mockResolvedValue(tags) };
}

describe('CheckForUpdateUseCase', () => {
	it('reports a newer release', async () => {
		const { clock } = fakeClock();
		const status = await new CheckForUpdateUseCase(
			feed(['v0.2.0', 'v0.3.0', 'latest']),
			'v0.2.0',
			clock
		).execute();
		expect(status).toEqual({ state: 'available', current: 'v0.2.0', latest: 'v0.3.0' });
	});

	it('reports current on the newest release', async () => {
		const { clock } = fakeClock();
		const status = await new CheckForUpdateUseCase(feed(['v0.3.0']), 'v0.3.0', clock).execute();
		expect(status).toEqual({ state: 'current', current: 'v0.3.0' });
	});

	it('never touches the feed when the check is disabled — the air-gapped default', async () => {
		const { clock } = fakeClock();
		const f = feed(['v9.9.9'], false);
		const status = await new CheckForUpdateUseCase(f, 'v0.2.0', clock).execute();
		expect(status).toEqual({ state: 'unknown' });
		expect(f.listVersions).not.toHaveBeenCalled();
	});

	it('never touches the feed when the install runs a moving tag', async () => {
		const { clock } = fakeClock();
		const f = feed(['v9.9.9']);
		const status = await new CheckForUpdateUseCase(f, 'behavior', clock).execute();
		expect(status).toEqual({ state: 'unknown' });
		expect(f.listVersions).not.toHaveBeenCalled();
	});

	it('serves a cached answer within the TTL, then refreshes after it', async () => {
		const { clock, advanceHours } = fakeClock();
		const f = feed(['v0.3.0']);
		const useCase = new CheckForUpdateUseCase(f, 'v0.2.0', clock);

		await useCase.execute();
		await useCase.execute();
		expect(f.listVersions).toHaveBeenCalledTimes(1);

		advanceHours(7); // past the 6h TTL
		await useCase.execute();
		expect(f.listVersions).toHaveBeenCalledTimes(2);
	});

	it('re-checks on demand when forced', async () => {
		const { clock } = fakeClock();
		const f = feed(['v0.3.0']);
		const useCase = new CheckForUpdateUseCase(f, 'v0.2.0', clock);
		await useCase.execute();
		await useCase.execute(true);
		expect(f.listVersions).toHaveBeenCalledTimes(2);
	});

	it('does not cache a failure, so a recovered registry is seen at once', async () => {
		const { clock } = fakeClock();
		const f: UpdateFeedPort = {
			enabled: true,
			listVersions: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(['v0.3.0'])
		};
		const useCase = new CheckForUpdateUseCase(f, 'v0.2.0', clock);

		expect(await useCase.execute()).toEqual({ state: 'unknown' });
		expect(await useCase.execute()).toEqual({
			state: 'available',
			current: 'v0.2.0',
			latest: 'v0.3.0'
		});
		expect(f.listVersions).toHaveBeenCalledTimes(2);
	});

	it('offers newer prereleases only to an install already on one', async () => {
		const { clock } = fakeClock();
		const tags = ['v1.0.0', 'v1.1.0-rc.2'];
		expect(await new CheckForUpdateUseCase(feed(tags), 'v1.0.0', clock).execute()).toEqual({
			state: 'current',
			current: 'v1.0.0'
		});
		expect(await new CheckForUpdateUseCase(feed(tags), 'v1.1.0-rc.1', clock).execute()).toEqual({
			state: 'available',
			current: 'v1.1.0-rc.1',
			latest: 'v1.1.0-rc.2'
		});
	});
});
