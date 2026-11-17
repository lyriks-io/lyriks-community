import { json } from '@sveltejs/kit';
import { licenseDigest } from '$domain/licensing';
import { componentsReport } from '$domain/system';
import { tierLabel } from '$domain/tier';
import type { RequestHandler } from './$types';

/**
 * The feedback dialog's server side. GET hands the dialog everything it needs
 * in one round-trip: the relay endpoint (already resolved to '' when the
 * channel is off, by flag or by the configuration of the installation) and the install context
 * worth attaching to a report. Sending is deliberately NOT here: the online
 * channel posts from the user's browser straight to the relay, so the
 * appliance server never gains an egress path.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const services = locals.services;
	const settings = await services.loadFeedbackSettings.execute();
	const { feedbackOnline } = await services.loadInstallConfiguration.allowance();
	// Context is advisory: a store hiccup must not take the dialog down.
	const [components, license, install] = await Promise.all([
		services.loadPlatformComponents.execute().catch(() => []),
		services.loadActivation.execute().catch(() => null),
		services.loadInstallRegistration.execute().catch(() => '')
	]);
	return json({
		settings,
		endpoint: feedbackOnline ? services.feedbackEndpoint() : '',
		context: {
			edition: tierLabel(services.currentTier()),
			// The FULL Versions panel (status, detail, build facts) and the licence
			// block: what support needs to reproduce without a follow-up question.
			versions: componentsReport(components),
			license: license ? licenseDigest(license) : '',
			install
		}
	});
};
