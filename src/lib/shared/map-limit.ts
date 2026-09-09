/**
 * Run `fn` over `items` with at most `limit` promises in flight at once, keeping
 * the result in input order. A pure, framework-free bound on fan-out.
 *
 * Why this exists: an unbounded `Promise.all(items.map(fn))` over "every project"
 * or "every feature" spawns hundreds of concurrent IO calls at once. On a small
 * appliance box that starves the Postgres pool (connections can't be acquired
 * within `connectionTimeoutMillis`, so the whole batch rejects) and thrashes the
 * event loop. Bounding the width turns a thundering herd into steady progress
 * without changing the observable result or the reject-on-first-error semantics.
 */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const n = items.length;
	const results = new Array<R>(n);
	const width = Math.max(1, Math.min(Math.trunc(limit), n || 1));
	let next = 0;
	async function worker(): Promise<void> {
		for (let i = next++; i < n; i = next++) {
			results[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: width }, () => worker()));
	return results;
}
