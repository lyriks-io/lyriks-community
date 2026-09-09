/**
 * Minimal in-memory fixed-window rate limiter. Single-node only (state lives in
 * this process) — a clustered deployment needs a shared store (Redis); see the
 * scalability blockers. Good enough today to blunt credential brute-forcing on
 * the auth endpoints.
 */
interface Window {
	count: number;
	resetAt: number;
}

export class RateLimiter {
	readonly #limit: number;
	readonly #windowMs: number;
	readonly #hits = new Map<string, Window>();

	constructor(limit: number, windowMs: number) {
		this.#limit = limit;
		this.#windowMs = windowMs;
	}

	/** Returns true if this key is allowed (and records the hit), false if over. */
	check(key: string, now: number): boolean {
		const w = this.#hits.get(key);
		if (!w || now >= w.resetAt) {
			this.#hits.set(key, { count: 1, resetAt: now + this.#windowMs });
			this.#sweep(now);
			return true;
		}
		if (w.count >= this.#limit) return false;
		w.count += 1;
		return true;
	}

	/** Drop expired windows so the map can't grow unbounded. */
	#sweep(now: number): void {
		if (this.#hits.size < 1024) return;
		for (const [k, w] of this.#hits) if (now >= w.resetAt) this.#hits.delete(k);
	}
}

/** Auth attempts per IP: 10 per 5 minutes. */
export const loginRateLimiter = new RateLimiter(10, 5 * 60 * 1000);
