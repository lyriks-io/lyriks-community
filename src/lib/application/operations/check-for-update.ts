/**
 * Tell an operator whether a newer appliance release exists.
 *
 * Two properties this use-case must keep:
 *  - **Never block the UI on the network.** The feed is best-effort and the
 *    result is cached, so rendering a banner cannot turn into a per-request call
 *    to a registry that may be slow or gone.
 *  - **Never claim what it cannot prove.** No feed, no answer, or a moving tag →
 *    `unknown`, and the UI shows nothing (see `resolveUpdateStatus`).
 *
 * The check is advisory only. Applying an update stays a deliberate operator
 * action on the host (`./lyriks update`): the platform container has no Docker
 * socket and must never get one just to update itself.
 */
import { pickLatest, resolveUpdateStatus, isComparableVersion, parseVersion } from '$domain/updates';
import type { UpdateStatus } from '$domain/updates';
import type { ClockPort } from '../ports/clock';
import type { UpdateFeedPort } from '../ports/update-feed';

/** How long a feed answer is reused. Releases are rare; hammering a registry is rude. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CachedStatus {
	readonly status: UpdateStatus;
	readonly atMs: number;
}

export class CheckForUpdateUseCase {
	#cache: CachedStatus | null = null;

	constructor(
		private readonly feed: UpdateFeedPort,
		/** The release this install runs; see `runningRelease`. */
		private readonly currentVersion: () => Promise<string>,
		private readonly clock: ClockPort,
		/** Whether an administrator allowed this installation to ask. */
		private readonly allowed: () => Promise<boolean>
	) {}

	/** The host the check would ask. */
	get destination(): string {
		return this.feed.destination;
	}

	/**
	 * Resolve the install's update status, reusing a cached answer within the TTL.
	 * `force` bypasses the cache for an explicit operator-triggered re-check.
	 */
	async execute(force = false): Promise<UpdateStatus> {
		// Short-circuit before any IO: a check nobody allowed, or a release nobody
		// knows, can never produce an answer, so an air-gapped install never even
		// builds a request.
		if (!(await this.allowed())) return { state: 'unknown' };
		const current = await this.currentVersion();
		if (!isComparableVersion(current)) return { state: 'unknown' };

		const nowMs = Date.parse(this.clock.nowIso());
		if (!force && this.#cache && nowMs - this.#cache.atMs < CACHE_TTL_MS) {
			return this.#cache.status;
		}

		const tags = await this.feed.listVersions();
		// An operator already on a prerelease keeps hearing about newer prereleases;
		// one on a stable release is never nudged onto an rc.
		const running = parseVersion(current);
		const onPrerelease = running?.prerelease !== undefined;
		const status = resolveUpdateStatus(
			current,
			tags ? pickLatest(tags, onPrerelease, running?.scheme) : null
		);

		// Only cache an answer the feed actually gave. Caching a failure would hide a
		// recovered registry for the whole TTL.
		if (tags) this.#cache = { status, atMs: nowMs };
		return status;
	}
}
