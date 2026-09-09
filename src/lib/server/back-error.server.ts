import { error } from '@sveltejs/kit';
import { BackHttpError } from '$application/ports';

/**
 * Re-raise a lyriks-back rejection as the matching SvelteKit HTTP error, so a
 * proxy route surfaces the back's real status + message (403 owner-guard, 404,
 * 409…) instead of a generic 502. Anything that isn't a BackHttpError (a
 * SvelteKit error() already thrown, a bug) is rethrown untouched.
 */
export function rethrowBackError(e: unknown): never {
	if (e instanceof BackHttpError) error(e.status, e.message);
	throw e;
}
