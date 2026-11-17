import { feedQueryParams, type FeedPage, type FeedQuery } from '$domain/activity';
import type { FeedCard } from '$lib/shared/home-feed';

/** One more page of Home's feed; null when it could not be read. */
export async function readFeedPage(query: FeedQuery, signal: AbortSignal): Promise<FeedPage<FeedCard> | null> {
	try {
		const res = await fetch(`/api/home/feed?${feedQueryParams(query)}`, { signal });
		return res.ok ? ((await res.json()) as FeedPage<FeedCard>) : null;
	} catch {
		return null;
	}
}
