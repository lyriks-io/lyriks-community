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

/**
 * Why a status is `unknown`, so Settings can name it (criterion dc44978e). The
 * band ignores it: it speaks only of an available release.
 */
export type UnknownReason =
	/** No administrator allowed the check: nothing was asked. */
	| 'off'
	/** A moving tag with no recorded release: nothing to compare. */
	| 'release_unknown'
	/** The registry was asked and gave no usable answer. */
	| 'no_answer'
	/** The registry answered but holds no release of the kind the install runs. */
	| 'no_release';

export interface UpdateStatus {
	readonly state: UpdateState;
	/** The running version tag, when it is a real version. */
	readonly current?: string;
	/** The newest offered version, only when state is `available`. */
	readonly latest?: string;
	/** Set only when state is `unknown`. */
	readonly reason?: UnknownReason;
	/**
	 * When this answer was established (ISO): the moment the registry answered,
	 * kept with the answer while it is reused, or the moment of a check that asked
	 * nothing (criterion 7212cfa5).
	 */
	readonly checkedAt?: string;
}

/** The status a check that could not compare anything reports. */
export function unknownStatus(reason: UnknownReason, current?: string): UpdateStatus {
	return current ? { state: 'unknown', current, reason } : { state: 'unknown', reason };
}

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
	if (!current) return unknownStatus('release_unknown');
	if (!latest) return unknownStatus('no_release', formatVersion(current));
	if (compareVersions(latest, current) > 0) {
		return { state: 'available', current: formatVersion(current), latest: formatVersion(latest) };
	}
	return { state: 'current', current: formatVersion(current) };
}

/** True when the running tag carries an ordering the check can reason about. */
export function isComparableVersion(tag: string): boolean {
	return parseVersion(tag) !== null;
}

/**
 * The release this install really runs. A pinned tag says so itself; on a moving
 * alias (`stable`, the default) the tag says nothing, so the release the kit
 * recorded at the last install or update answers instead.
 */
export function runningRelease(imageTag: string, recordedRelease: string | null | undefined): string {
	return isComparableVersion(imageTag) ? imageTag : (recordedRelease ?? imageTag);
}
