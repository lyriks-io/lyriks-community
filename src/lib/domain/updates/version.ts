/**
 * Release-version arithmetic for the appliance's update check.
 *
 * Versions travel as container image tags, so this parses the tag vocabulary the
 * appliance actually ships (`v0.2.0`, `0.2.0`, `1.2.3-rc.1`) and ignores
 * everything else. Moving tags (`latest`, `behavior`, `edge`) and branch builds
 * are deliberately NOT versions: they carry no ordering, so an install running
 * one can never be told it is "behind".
 *
 * Pure: no IO, no network — comparison only.
 */

/** A parsed semantic version. `prerelease` is undefined for a final release. */
export interface Version {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	/** Dot-separated identifiers after `-`, e.g. `rc.1` → ['rc','1']. */
	readonly prerelease?: readonly string[];
}

/** `v1.2.3`, `1.2.3`, `1.2.3-rc.1` — build metadata (`+sha`) is ignored. */
const VERSION_TAG = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parse an image tag into a Version, or null when the tag carries no ordering. */
export function parseVersion(tag: string): Version | null {
	const m = VERSION_TAG.exec(tag.trim());
	if (!m) return null;
	const prerelease = m[4] ? m[4].split('.') : undefined;
	return {
		major: Number(m[1]),
		minor: Number(m[2]),
		patch: Number(m[3]),
		...(prerelease ? { prerelease } : {})
	};
}

/** Compare prerelease identifiers per semver: numeric < alphanumeric, field by field. */
function comparePrerelease(a: readonly string[], b: readonly string[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		// A shorter prerelease sorts first: `1.0.0-rc` < `1.0.0-rc.1`.
		if (i >= a.length) return -1;
		if (i >= b.length) return 1;
		const x = a[i];
		const y = b[i];
		const xNum = /^\d+$/.test(x);
		const yNum = /^\d+$/.test(y);
		if (xNum && yNum) {
			if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
			continue;
		}
		// Numeric identifiers always have lower precedence than alphanumeric ones.
		if (xNum !== yNum) return xNum ? -1 : 1;
		if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}

/** Order two versions: -1 when a < b, 0 when equal, 1 when a > b. */
export function compareVersions(a: Version, b: Version): number {
	if (a.major !== b.major) return a.major < b.major ? -1 : 1;
	if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
	if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
	// A prerelease precedes its own final release: 1.0.0-rc.1 < 1.0.0.
	if (a.prerelease && !b.prerelease) return -1;
	if (!a.prerelease && b.prerelease) return 1;
	if (a.prerelease && b.prerelease) return comparePrerelease(a.prerelease, b.prerelease);
	return 0;
}

/** Render a Version back to its canonical `v`-prefixed tag. */
export function formatVersion(v: Version): string {
	const core = `v${v.major}.${v.minor}.${v.patch}`;
	return v.prerelease?.length ? `${core}-${v.prerelease.join('.')}` : core;
}

/**
 * The highest final release among `tags`. Prereleases are skipped unless the
 * install already runs one — an operator on a stable release is never nudged onto
 * an rc, but one already on `1.1.0-rc.1` still learns about `1.1.0-rc.2`.
 */
export function pickLatest(tags: readonly string[], includePrerelease = false): Version | null {
	let best: Version | null = null;
	for (const tag of tags) {
		const v = parseVersion(tag);
		if (!v) continue;
		if (v.prerelease && !includePrerelease) continue;
		if (!best || compareVersions(v, best) > 0) best = v;
	}
	return best;
}
