// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session } from '$application/ports';
import type { LicenseView } from '$domain/licensing';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Per-request session, resolved in hooks.server.ts from the cookie
			    (real auth) or the dev fallback. Never carries the bearer token. */
			session: Session;
			/** True when auth is enforced (LYRIKS_AUTH_REQUIRED=1). */
			authRequired: boolean;
			/** True when activation is enforced (LYRIKS_LICENSE_REQUIRED=1). */
			licenseRequired: boolean;
			/** Resolved product-activation state, when enforcement is on; else null. */
			license: LicenseView | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
