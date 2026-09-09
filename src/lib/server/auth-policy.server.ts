import { env } from '$env/dynamic/private';
import { isAuthEnforced } from '$domain/licensing';

/** One effective policy for HTTP guards and adapter identity propagation. */
export function authEnforced(): boolean {
	return isAuthEnforced({ edition: env.LYRIKS_EDITION, flag: env.LYRIKS_AUTH_REQUIRED, dev: import.meta.env.DEV });
}
