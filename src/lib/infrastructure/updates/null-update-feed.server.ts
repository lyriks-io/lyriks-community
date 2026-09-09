import type { UpdateFeedPort } from '$application/ports';

/**
 * The default feed: answers "I don't know" without any IO.
 *
 * This is what makes "zero runtime egress by default" true for the update check
 * rather than merely intended — the shipped default has no code path that can
 * reach the network at all. An install only talks to a registry when an operator
 * sets `LYRIKS_UPDATE_CHECK=1` and the composition root swaps this out.
 */
export class NullUpdateFeed implements UpdateFeedPort {
	readonly enabled = false;

	async listVersions(): Promise<null> {
		return null;
	}
}
