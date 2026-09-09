/**
 * A non-2xx response from lyriks-back, carrying its HTTP status so callers — in
 * particular the platform's proxy routes — can surface the real reason (a 403
 * owner-guard, a 404, a 409) instead of a generic 502. Thrown by the back HTTP
 * adapter's user-triggered WRITE methods; best-effort READ methods still swallow.
 */
export class BackHttpError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'BackHttpError';
	}
}
