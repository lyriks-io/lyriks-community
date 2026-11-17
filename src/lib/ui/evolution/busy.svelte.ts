/**
 * The veil an Evolution page draws while a long act runs on the server: what
 * Lyriks is doing, in words, over a page that takes no click until it is done.
 * It is shown only while a real act is in flight, never on a timer.
 */
let label = $state<string | null>(null);

/** What is being done right now, or null. */
export const busyLabel = (): string | null => label;

/** Runs the act under the veil, saying what it does; the veil lifts however it ends. */
export async function whileBusy<T>(what: string, act: () => Promise<T>): Promise<T> {
	label = what;
	try {
		return await act();
	} finally {
		label = null;
	}
}
