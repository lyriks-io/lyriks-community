/**
 * Whether the work settles before the deadline. It never rejects: a failure
 * counts as settled, since the reading after it is then as fresh as it gets.
 * Used to bound how long a coherence reading waits for the behaviour
 * verification it folds in (ac-evo-coh-same-reading).
 */
export function settlesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), ms);
		void work
			.catch(() => {})
			.finally(() => {
				clearTimeout(timer);
				resolve(true);
			});
	});
}
