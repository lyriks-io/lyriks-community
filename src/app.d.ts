// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session } from '$application/ports';
import type { LicenseView, UpgradePlan } from '$domain/licensing';
import type { AppServices } from '$composition/container.server';

declare global {
	namespace App {
		interface Error {
			message: string;
			/** What opens the refused capability, under the message (EVO-001). */
			detail?: string;
			/** The plan that opens what was refused: the refusal is an offer, which a page shows with View plans (EVO-006). */
			plan?: UpgradePlan | null;
			/** A project held inactive (Community, or a key that grants fewer projects): the error page offers to make it active. */
			inactiveProjectId?: string;
			/** How many active projects the key grants, beside an inactive project (EVO-016). */
			activeProjectsGranted?: number;
		}
		interface Locals {
			/** The application's services for this request, handed over at the edge (hooks.server.ts). */
			services: AppServices;
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
		interface PageState {
			/** The behavior editor opened from the Features page, as one step of the
			    browser history (shallow routing), with where the tree was scrolled. */
			behaviorEditor?: { path: string | null; scrollTop: number; historyLength: number };
		}
		// interface Platform {}
	}
}

export {};
