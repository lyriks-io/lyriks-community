import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { licenseDigest } from '$domain/licensing';
import { componentsReport } from '$domain/system';
import { tierLabel } from '$domain/tier/tier';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * The feedback dialog's server side. GET hands the dialog everything it needs
 * in one round-trip: the relay endpoint (already resolved to '' when the
 * channel is off, by flag or by the operator switch) and the install context
 * worth attaching to a report. Sending is deliberately NOT here: the online
 * channel posts from the user's browser straight to the relay, so the
 * appliance server never gains an egress path.
 */
export const GET: RequestHandler = async () => {
	const services = getServices();
	const settings = await services.loadFeedbackSettings.execute();
	// Context is advisory: a store hiccup must not take the dialog down.
	const [components, license, install] = await Promise.all([
		services.loadPlatformComponents.execute().catch(() => []),
		services.loadActivation.execute().catch(() => null),
		services.loadInstallRegistration.execute().catch(() => '')
	]);
	return json({
		settings,
		endpoint: settings.onlineEnabled ? services.feedbackEndpoint() : '',
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

/** Flip the app-wide online-channel switch. Admin-only, like the AI switch. */
export const PUT: RequestHandler = async (event) => {
	const { request, locals } = event;
	requireAdmin(event);
	const body = await request.json().catch(() => ({}));
	const services = getServices();
	const settings = await services.saveFeedbackSettings.execute(body);
	services.audit.record({
		action: 'settings.update',
		actor: locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev'),
		outcome: 'success',
		detail: `feedback-online=${settings.onlineEnabled ? 'offered' : 'hidden'}`
	});
	return json({ settings });
};
