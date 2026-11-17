/**
 * Outbound port answering "which versions of this appliance exist?".
 *
 * It asks the image registry the install already pulls from, so it adds no new
 * destination, and an internal mirror keeps it inside the customer's network. The
 * use-case calls it only once an administrator allowed the check: the appliance
 * ships with zero runtime egress and this port must never regress that.
 *
 * Best-effort by contract: a feed that is unreachable, unauthorized or slow
 * returns null rather than throwing. Not knowing whether an update exists is
 * never an error worth failing a page render over.
 */
export interface UpdateFeedPort {
	/** The host that would be asked, named to the administrator who decides. */
	readonly destination: string;
	/**
	 * Version tags the feed offers (e.g. ['2026.11-64','stable']), unfiltered:
	 * the domain decides which carry an ordering. Null when the feed cannot answer.
	 */
	listVersions(): Promise<readonly string[] | null>;
}
