import { fail, redirect } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { isLicenseValid } from '$domain/licensing';
import { requireAdmin } from '$lib/server/admin.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// `locals.license` is populated by the activation gate when enforcement is on;
	// otherwise resolve on demand so operators can pre-activate a build too.
	const services = getServices();
	const view = locals.license ?? (await services.loadActivation.execute());
	return {
		license: view,
		enforced: services.licenseRequired(),
		// Drives the copy: a Community operator is sent to the free key form, a
		// paying one to sales. Reading it here keeps the branch on the server.
		installEdition: services.installEdition(),
		// Shown once activated, for the operator to register the install by hand.
		// Only resolved then: an install that has no key yet has nothing to register,
		// and this is the screen every request of an unlicensed appliance lands on.
		registrationCode: isLicenseValid(view) ? await services.loadInstallRegistration.execute() : null,
		// Drives the "go back" affordance: only shown when there is actually a
		// superseded key to go back to.
		hasPreviousKey: await services.hasPreviousLicense()
	};
};

export const actions: Actions = {
	/**
	 * Try a key without adopting it. Replacing a licence is otherwise a one-way
	 * door: the working key is destroyed to find out what the new one grants, and
	 * a renewal that verifies can still carry fewer seats or a shorter window
	 * than was agreed. Nothing is stored here.
	 */
	preview: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const key = String(form.get('key') ?? '');
		const result = await getServices().previewLicense.execute(key);
		if (!result.ok) return fail(400, { reason: result.reason, status: result.view.status });
		return { preview: result.view, key };
	},

	/** Step back to the key this install ran on before the current one. */
	restorePrevious: async (event) => {
		requireAdmin(event);
		const services = getServices();
		const actor = event.locals.session?.email ?? 'operator';
		const result = await services.restorePreviousLicense.execute(actor);
		if (!result.ok) return fail(400, { restoreReason: result.reason });
		await services.syncBackLicence.execute(true);
		return { restored: result.view };
	},

	activate: async (event) => {
		requireAdmin(event);
		const { request, locals } = event;
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		const actor = locals.session?.email ?? 'operator';
		const services = getServices();
		const result = await services.activateLicense.execute(key, actor);
		if (!result.ok) return fail(400, { reason: result.reason, status: result.view.status });
		// A fresh licence is the install's best identity default (operator name
		// from the customer field). Best-effort; never overwrites a chosen name.
		await services.seedActivationDefaults.execute(result.view.entitlements);
		// Deliver the key to the Back's seat gate right away, so multi-user limits
		// reflect the new licence without waiting for a throttled resync.
		await services.syncBackLicence.execute(true);
		// Activated — leave the wall and open the product.
		redirect(303, '/');
	},

	deactivate: async (event) => {
		requireAdmin(event);
		const { locals } = event;
		const actor = locals.session?.email ?? 'operator';
		await getServices().deactivateLicense.execute(actor);
		return { deactivated: true };
	}
};
