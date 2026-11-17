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

function feed(tags: readonly string[] | null): UpdateFeedPort {
	return { destination: 'registry.test', listVersions: vi.fn().mockResolvedValue(tags) };
}

const check = (f: UpdateFeedPort, running: string, clock: ClockPort, allowed = true) =>
	new CheckForUpdateUseCase(f, async () => running, clock, async () => allowed);

describe('CheckForUpdateUseCase', () => {
	it('reports a newer release', async () => {
		const { clock } = fakeClock();
		const status = await check(feed(['v0.2.0', 'v0.3.0', 'latest']), 'v0.2.0', clock).execute();
		expect(status).toEqual({ state: 'available', current: 'v0.2.0', latest: 'v0.3.0' });
	});

	it('reports current on the newest release', async () => {
		const { clock } = fakeClock();
		const status = await check(feed(['v0.3.0']), 'v0.3.0', clock).execute();
		expect(status).toEqual({ state: 'current', current: 'v0.3.0' });
	});

	it('reads a dated release name and offers the next one', async () => {
		const { clock } = fakeClock();
		const status = await check(feed(['2026.10-63', '2026.11-64', 'stable']), '2026.10-63', clock).execute();
		expect(status).toEqual({ state: 'available', current: '2026.10-63', latest: '2026.11-64' });
	});

	it('orders dated releases by number, not by text', async () => {
		const { clock } = fakeClock();
		const status = await check(feed(['2026.11-9', '2026.11-10']), '2026.11-9', clock).execute();
		expect(status).toEqual({ state: 'available', current: '2026.11-9', latest: '2026.11-10' });
	});

	it('compares a tag only with tags of its own kind', async () => {
		const { clock } = fakeClock();
		const tags = ['v0.9.40', '2026.11-64', 'stable'];
		expect(await check(feed(tags), 'v0.9.40', clock).execute()).toEqual({ state: 'current', current: 'v0.9.40' });
		expect(await check(feed(tags), '2026.11-64', clock).execute()).toEqual({
			state: 'current',
			current: '2026.11-64'
		});
	});

	it('never touches the feed before an administrator allowed it: the air-gapped default', async () => {
		const { clock } = fakeClock();
		const f = feed(['v9.9.9']);
		const status = await check(f, 'v0.2.0', clock, false).execute();
		expect(status).toEqual({ state: 'unknown' });
		expect(f.listVersions).not.toHaveBeenCalled();
	});

	it('stops answering from its cache as soon as the check is withdrawn', async () => {
		const { clock } = fakeClock();
		const f = feed(['v0.3.0']);
		let allowed = true;
		const useCase = new CheckForUpdateUseCase(f, async () => 'v0.2.0', clock, async () => allowed);
		expect((await useCase.execute()).state).toBe('available');
		allowed = false;
		expect(await useCase.execute()).toEqual({ state: 'unknown' });
	});

	it('never touches the feed when the release is not known', async () => {
		const { clock } = fakeClock();
		const f = feed(['v9.9.9']);
		const status = await check(f, 'stable', clock).execute();
		expect(status).toEqual({ state: 'unknown' });
		expect(f.listVersions).not.toHaveBeenCalled();
	});

	it('serves a cached answer within the TTL, then refreshes after it', async () => {
		const { clock, advanceHours } = fakeClock();
		const f = feed(['v0.3.0']);
		const useCase = check(f, 'v0.2.0', clock);

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
		const useCase = check(f, 'v0.2.0', clock);
		await useCase.execute();
		await useCase.execute(true);
		expect(f.listVersions).toHaveBeenCalledTimes(2);
	});

	it('does not cache a failure, so a recovered registry is seen at once', async () => {
		const { clock } = fakeClock();
		const f: UpdateFeedPort = {
			destination: 'registry.test',
			listVersions: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(['v0.3.0'])
		};
		const useCase = check(f, 'v0.2.0', clock);

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
		expect(await check(feed(tags), 'v1.0.0', clock).execute()).toEqual({
			state: 'current',
			current: 'v1.0.0'
		});
		expect(await check(feed(tags), 'v1.1.0-rc.1', clock).execute()).toEqual({
			state: 'available',
			current: 'v1.1.0-rc.1',
			latest: 'v1.1.0-rc.2'
		});
	});
});
