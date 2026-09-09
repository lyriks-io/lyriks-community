/**
 * What the install should be told about its own currency.
 *
 * Deliberately conservative: anything the platform cannot prove — the check is
 * off, the registry did not answer, or either side runs a moving tag — resolves
 * to `unknown`, never to `current`. An air-gapped install (the default) sits at
 * `unknown` forever and shows nothing, which is the correct behaviour: silence is
 * honest, "you are up to date" would be a claim we cannot support with no feed.
 *
 * Pure: no IO — a fold of (current, latest) into a status.
 */
import { compareVersions, formatVersion, parseVersion, type Version } from './version';

export type UpdateState =
	/** No comparable answer: check disabled, feed unreachable, or a moving tag. */
	| 'unknown'
	/** Running the newest version the feed offers. */
	| 'current'
	/** A newer release exists. */
	| 'available';

export interface UpdateStatus {
	readonly state: UpdateState;
	/** The running version tag, when it is a real version. */
	readonly current?: string;
	/** The newest offered version, only when state is `available`. */
	readonly latest?: string;
}

const UNKNOWN: UpdateStatus = { state: 'unknown' };

/**
 * Resolve the status shown to operators.
 *
 * `latest` is whatever the feed reported (null when it could not say). A latest
 * that is older than or equal to the running version means the install is
 * current — never report a downgrade as an update.
 */
export function resolveUpdateStatus(
	currentTag: string,
	latest: Version | null
): UpdateStatus {
	const current = parseVersion(currentTag);
	// A moving tag (`latest`, `behavior`) has no ordering — nothing truthful to say.
	if (!current) return UNKNOWN;
	if (!latest) return UNKNOWN;
	if (compareVersions(latest, current) > 0) {
		return { state: 'available', current: formatVersion(current), latest: formatVersion(latest) };
	}
	return { state: 'current', current: formatVersion(current) };
}

/** True when the running tag carries an ordering the check can reason about. */
export function isComparableVersion(tag: string): boolean {
	return parseVersion(tag) !== null;
}
