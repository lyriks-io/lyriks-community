/**
 * Tell an operator whether a newer appliance release exists.
 *
 * Two properties this use-case must keep:
 *  - **Never block the UI on the network.** The feed is best-effort and the
 *    result is cached, so rendering a banner cannot turn into a per-request call
 *    to a registry that may be slow or gone.
 *  - **Never claim what it cannot prove.** No feed, no answer, or a moving tag →
 *    `unknown` with its reason: the band shows nothing, Settings names why.
 *
 * The check is advisory only. Applying an update stays a deliberate operator
 * action on the host (`./lyriks update`): the platform container has no Docker
 * socket and must never get one just to update itself.
 */
import { formatVersion, pickLatest, resolveUpdateStatus, isComparableVersion, parseVersion, unknownStatus } from '$domain/updates';
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
	 * `once` is an administrator's confirmed consent to ask a single time while
	 * the automatic check is off (rule 231398c6); it implies `force`.
	 */
	async execute(force = false, once = false): Promise<UpdateStatus> {
		// Short-circuit before any IO: a check nobody allowed or confirmed, or a
		// release nobody knows, can never produce an answer, so an air-gapped
		// install never builds a request by itself.
		const allowed = await this.allowed();
		if (!allowed && !once) return this.#stamped(unknownStatus('off'));
		const current = await this.currentVersion();
		if (!isComparableVersion(current)) return this.#stamped(unknownStatus('release_unknown'));

		const nowMs = Date.parse(this.clock.nowIso());
		if (allowed && !force && !once && this.#cache && nowMs - this.#cache.atMs < CACHE_TTL_MS) {
			return this.#cache.status;
		}

		const tags = await this.feed.listVersions();
		// An operator already on a prerelease keeps hearing about newer prereleases;
		// one on a stable release is never nudged onto an rc.
		const running = parseVersion(current);
		const onPrerelease = running?.prerelease !== undefined;
		const status = this.#stamped(
			tags
				? resolveUpdateStatus(current, pickLatest(tags, onPrerelease, running?.scheme))
				: unknownStatus('no_answer', running ? formatVersion(running) : undefined)
		);

		// Only cache an answer the feed actually gave. Caching a failure would hide a
		// recovered registry for the whole TTL.
		if (tags) this.#cache = { status, atMs: nowMs };
		return status;
	}

	/** The answer as of now; a kept answer keeps the moment it was given (criterion 7212cfa5). */
	#stamped(status: UpdateStatus): UpdateStatus {
		return { ...status, checkedAt: this.clock.nowIso() };
	}
}
