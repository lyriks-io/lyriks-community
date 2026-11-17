import { describe, expect, it } from 'vitest';
import { compareVersions, formatVersion, parseVersion, pickLatest } from './version';
import { isComparableVersion, resolveUpdateStatus, runningRelease } from './update-status';

const v = (tag: string) => {
	const parsed = parseVersion(tag);
	if (!parsed) throw new Error(`not a version: ${tag}`);
	return parsed;
};

describe('parseVersion', () => {
	it('accepts the tag vocabulary the appliance ships', () => {
		expect(parseVersion('v0.2.0')).toEqual({ major: 0, minor: 2, patch: 0 });
		expect(parseVersion('0.2.0')).toEqual({ major: 0, minor: 2, patch: 0 });
		expect(parseVersion('1.2.3-rc.1')).toEqual({
			major: 1,
			minor: 2,
			patch: 3,
			prerelease: ['rc', '1']
		});
	});

	it('ignores build metadata', () => {
		expect(parseVersion('v1.2.3+abc123')).toEqual({ major: 1, minor: 2, patch: 3 });
	});

	it('rejects moving tags and branch builds, which carry no ordering', () => {
		for (const tag of ['latest', 'behavior', 'edge', 'main', 'v1.2', 'nightly-2026-07-17']) {
			expect(parseVersion(tag), tag).toBeNull();
		}
	});
});

describe('compareVersions', () => {
	it('orders by major, then minor, then patch', () => {
		expect(compareVersions(v('1.0.0'), v('2.0.0'))).toBe(-1);
		expect(compareVersions(v('1.2.0'), v('1.1.9'))).toBe(1);
		expect(compareVersions(v('1.1.2'), v('1.1.10'))).toBe(-1);
		expect(compareVersions(v('1.1.1'), v('v1.1.1'))).toBe(0);
	});

	it('sorts a prerelease before its final release', () => {
		expect(compareVersions(v('1.0.0-rc.1'), v('1.0.0'))).toBe(-1);
		expect(compareVersions(v('1.0.0'), v('1.0.0-rc.1'))).toBe(1);
	});

	it('orders prerelease identifiers per semver', () => {
		expect(compareVersions(v('1.0.0-rc.1'), v('1.0.0-rc.2'))).toBe(-1);
		// A shorter prerelease sorts first.
		expect(compareVersions(v('1.0.0-rc'), v('1.0.0-rc.1'))).toBe(-1);
		// Numeric identifiers rank below alphanumeric ones.
		expect(compareVersions(v('1.0.0-1'), v('1.0.0-alpha'))).toBe(-1);
	});
});

describe('pickLatest', () => {
	it('takes the highest final release and skips unparseable tags', () => {
		const tags = ['latest', 'v0.9.0', 'behavior', 'v0.10.0', 'v0.2.0'];
		expect(formatVersion(pickLatest(tags)!)).toBe('v0.10.0');
	});

	it('skips prereleases unless the caller opts in', () => {
		const tags = ['v1.0.0', 'v1.1.0-rc.1'];
		expect(formatVersion(pickLatest(tags)!)).toBe('v1.0.0');
		expect(formatVersion(pickLatest(tags, true)!)).toBe('v1.1.0-rc.1');
	});

	it('returns null when nothing is a version', () => {
		expect(pickLatest(['latest', 'behavior'])).toBeNull();
	});
});

describe('resolveUpdateStatus', () => {
	it('reports an available update when the feed offers a newer release', () => {
		expect(resolveUpdateStatus('v0.2.0', v('v0.3.0'))).toEqual({
			state: 'available',
			current: 'v0.2.0',
			latest: 'v0.3.0'
		});
	});

	it('reports current when running the newest release', () => {
		expect(resolveUpdateStatus('v0.3.0', v('v0.3.0'))).toEqual({
			state: 'current',
			current: 'v0.3.0'
		});
	});

	it('never presents a downgrade as an update', () => {
		expect(resolveUpdateStatus('v0.4.0', v('v0.3.0'))).toEqual({
			state: 'current',
			current: 'v0.4.0'
		});
	});

	it('stays unknown when the feed cannot answer — the air-gapped default', () => {
		// Silence is honest; "up to date" would be a claim with no feed behind it.
		expect(resolveUpdateStatus('v0.2.0', null)).toEqual({ state: 'unknown' });
	});

	it('stays unknown when the install runs a moving tag', () => {
		expect(resolveUpdateStatus('behavior', v('v9.9.9'))).toEqual({ state: 'unknown' });
		expect(resolveUpdateStatus('latest', v('v9.9.9'))).toEqual({ state: 'unknown' });
	});
});

describe('isComparableVersion', () => {
	it('separates real versions from moving tags', () => {
		expect(isComparableVersion('v0.2.0')).toBe(true);
		expect(isComparableVersion('behavior')).toBe(false);
	});
});

describe('dated release names', () => {
	it('reads and writes them back as they are named', () => {
		expect(formatVersion(v('2026.11-64'))).toBe('2026.11-64');
		expect(formatVersion(v('2026.08-1'))).toBe('2026.08-1');
		expect(isComparableVersion('2026.11-64')).toBe(true);
	});

	it('orders them by number', () => {
		expect(compareVersions(v('2026.11-10'), v('2026.11-9'))).toBe(1);
		expect(compareVersions(v('2027.01-1'), v('2026.12-99'))).toBe(1);
	});

	it('picks only among tags of the kind asked for', () => {
		const tags = ['v0.9.40', '2026.11-64', '2026.10-63', 'stable'];
		expect(formatVersion(pickLatest(tags, false, 'release')!)).toBe('2026.11-64');
		expect(formatVersion(pickLatest(tags)!)).toBe('v0.9.40');
	});
});

describe('runningRelease', () => {
	it('trusts a pinned tag', () => {
		expect(runningRelease('2026.11-64', '2026.10-63')).toBe('2026.11-64');
	});

	it('reads the release the kit recorded when the tag is a moving alias', () => {
		expect(runningRelease('stable', '2026.11-64')).toBe('2026.11-64');
	});

	it('stays on the moving tag, so unknown, when nothing was recorded', () => {
		expect(runningRelease('stable', null)).toBe('stable');
		expect(isComparableVersion(runningRelease('stable', undefined))).toBe(false);
	});
});
