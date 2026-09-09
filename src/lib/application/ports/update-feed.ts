/**
 * Outbound port answering "which versions of this appliance exist?".
 *
 * The default adapter answers "I don't know" without touching the network, which
 * is what an air-gapped install must do: the appliance ships with zero runtime
 * egress and this port must never regress that. Only an operator who opts in
 * (`LYRIKS_UPDATE_CHECK=1`) gets an adapter that talks to anything, and even then
 * it talks to the image registry the install *already* pulls from — no new
 * destination, and an internal mirror keeps it inside the customer's network.
 *
 * Best-effort by contract: a feed that is unreachable, unauthorized or slow
 * returns null rather than throwing. Not knowing whether an update exists is
 * never an error worth failing a page render over.
 */
export interface UpdateFeedPort {
	/** True when this install is configured to ask anyone at all. */
	readonly enabled: boolean;
	/**
	 * Version tags the feed offers (e.g. ['v0.2.0','v0.3.0','latest']), unfiltered —
	 * the domain decides which carry an ordering. Null when the feed cannot answer.
	 */
	listVersions(): Promise<readonly string[] | null>;
}
