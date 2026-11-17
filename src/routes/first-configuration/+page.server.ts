import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin.server';
import type { PageServerLoad } from './$types';

/** Where an administrator lands right after the password, once (action d431d906). */
export const load: PageServerLoad = async (event) => {
	if (!isAdmin(event)) redirect(303, '/');
	const services = event.locals.services;
	const configuration = await services.loadInstallConfiguration.execute();
	if (configuration.validated) redirect(303, '/settings#configuration');
	const assistant = await services.loadAssistantSettings.execute();
	return {
		configuration,
		destinations: services.outboundDestinations(),
		assistantEnabled: assistant.enabled
	};
};
