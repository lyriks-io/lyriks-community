import { fail, redirect, type Actions } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
// PUBLIC_-prefixed variables live ONLY in the public store; $env/dynamic/private
// excludes them, so reading the dashboard URL from `env` returned undefined and
// every return to it silently fell back to "/".
import { env as publicEnv } from '$env/dynamic/public';
import { loginRateLimiter } from '$lib/server/rate-limit.server';
import { setSessionCookie } from '$lib/server/session-cookie.server';
import { getServices } from '$composition/container.server';
import { postLoginRedirect } from '$domain/auth/post-login-redirect';
import { licenseEmailMatches } from '$domain/licensing';
import type { PageServerLoad } from './$types';

/**
 * Self-service signup is OFF by default — enterprise users are provisioned via
 * SSO / admin invite. Set LYRIKS_ALLOW_SIGNUP=1 to allow local registration
 * (e.g. to bootstrap the first user on a fresh install).
 */
const signupAllowed = () => env.LYRIKS_ALLOW_SIGNUP === '1';

/**
 * Whether self-registration is still open (true only until the first account
 * exists: the one-time bootstrap lock). The identity source decides how to
 * answer when it cannot be reached (fail-open here, fail-closed below).
 */
function registrationOpen(): Promise<boolean> {
	return getServices().identity.registrationOpen();
}

/** Whether the identity source ANSWERS that no account exists yet (fail-closed). */
function installUnclaimed(): Promise<boolean> {
	return getServices().identity.installUnclaimed();
}

/**
 * Post-login destination — see postLoginRedirect for the rule and its refusals.
 */
function safeRedirect(url: URL): string {
	return postLoginRedirect(url.searchParams.get('redirect') ?? '', publicEnv.PUBLIC_UNSPA_DASHBOARD_URL);
}

/**
 * The still-open invitation behind a /login?redirect=/join/<token> bounce, read
 * from the identity source rather than believed from the query. Only an
 * Enterprise install has invitations at all; the open-source build answers
 * "not an invitation" for every link.
 */
async function invitationBehind(
	redirectTo: string
): Promise<{ token: string | null; invitation: { email: string; workspaceName: string | null } | null }> {
	const hooks = getServices().enterpriseHooks;
	return hooks ? hooks.invitationBehind(redirectTo) : { token: null, invitation: null };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	// Already signed in → no reason to be here.
	if (locals.session?.isAuthenticated) redirect(303, safeRedirect(url));
	// An invited teammate is bounced here as /login?redirect=/join/<token>. Their
	// account doesn't exist yet, so the invitation itself has to open registration:
	// an admin already made that provisioning decision, and an appliance ships with
	// self-service signup off, so gating on LYRIKS_ALLOW_SIGNUP would strand every
	// invitee on a sign-in form they cannot pass. The back still enforces it
	// (register-via-invite checks the pending invitation for that address).
	const redirectTo = safeRedirect(url);
	const { token: inviteToken, invitation } = await invitationBehind(redirectTo);
	const invitedToJoin = inviteToken !== null;
	const viaInvite = invitation !== null;
	const allowSignup = viaInvite || (signupAllowed() && (await registrationOpen()));
	// First run: the appliance installs with NO account and NO credentials, so the
	// very first visitor claims it here, with the licence key as the credential.
	// All three conditions matter. Auth off is a dev boot with an implicit
	// session; an existing account closes the window for good; and without
	// enforcement there is no key to prove anything with, which would leave a
	// bare "create the admin account" form on an open port.
	const services = getServices();
	const firstRun =
		locals.authRequired && services.licenseRequired() && (await installUnclaimed());
	return {
		authConfigured: services.identity.configured,
		authRequired: locals.authRequired,
		firstRun,
		allowSignup,
		viaInvite,
		// Pre-fill the address the invitation was issued to: acceptance only works
		// for that one, so making the invitee guess it is a trap.
		inviteEmail: invitation?.email ?? null,
		inviteWorkspace: invitation?.workspaceName ?? null,
		// A /join link the back no longer recognises. Saying so beats a sign-in
		// form that silently rejects an account they never got to create.
		inviteExpired: invitedToJoin && !viaInvite,
		redirectTo,
		// Set by the session guard when the back could not be reached — the page
		// explains the outage instead of silently bouncing the user here.
		backUnreachable: url.searchParams.get('reason') === 'unreachable'
	};
};

/** Sign in against the identity source: the session token, or the refusal. */
function signIn(email: string, password: string): Promise<{ token: string } | { error: string }> {
	return getServices().identity.login(email, password);
}

/** Create an account at the identity source: the session token, or the refusal. */
function signUp(input: {
	email: string;
	password: string;
	firstName?: string;
	lastName?: string;
}): Promise<{ token: string } | { error: string }> {
	return getServices().identity.register(input);
}

/** Why a key was refused at first run, in the words of someone holding it. */
const FIRST_RUN_REASONS: Record<string, string> = {
	empty: 'Enter your licence key.',
	invalid: 'That key is not valid for this installation. Check for copy/paste errors.',
	retired: 'That key was issued under a signing key we have retired. It is genuine: ask us for a replacement.',
	expired: 'That licence has expired. Ask us for a renewal key.',
	tampered: 'The system clock is set in the past. Correct the machine date and time, then try again.',
	wrong_edition: 'That key was issued for a lower edition than this installation runs.'
};

/** Throttle credential attempts per client IP; returns a fail() when over. */
function rateLimited(getClientAddress: () => string, mode: 'login' | 'register' | 'firstRun') {
	let ip = 'unknown';
	try {
		ip = getClientAddress();
	} catch {
		// address unavailable (e.g. some adapters) — fall back to a shared bucket
	}
	if (!loginRateLimiter.check(`${mode}:${ip}`, Date.now())) {
		return fail(429, { mode, message: 'Too many attempts. Please wait a few minutes and try again.' });
	}
	return null;
}

export const actions: Actions = {
	/**
	 * First run, step one: prove the pair. An address alone would let whoever
	 * reaches a fresh appliance first claim it; a key alone would let anyone who
	 * has seen the key claim it under any address. The key must therefore be
	 * valid for THIS install and issued to THIS address, and nothing is stored
	 * until the operator has also chosen a password.
	 */
	firstRunCheck: async ({ request, locals, getClientAddress }) => {
		// Throttled like any other credential attempt: the pair is checked before
		// anyone is authenticated, and every attempt costs a signature
		// verification. Its own bucket, so a mistyped key cannot spend the budget
		// the password step needs.
		const limited = rateLimited(getClientAddress, 'firstRun');
		if (limited) return limited;
		const services = getServices();
		if (!locals.authRequired || !services.licenseRequired() || !(await installUnclaimed())) {
			return fail(403, { mode: 'firstRun', message: 'This installation is already claimed.' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const key = String(form.get('key') ?? '').trim();
		if (!email || !key) {
			return fail(400, { mode: 'firstRun', email, message: 'Enter your email address and your licence key.' });
		}

		const preview = await services.previewLicense.execute(key);
		if (!preview.ok) {
			return fail(400, { mode: 'firstRun', email, reason: preview.reason, message: FIRST_RUN_REASONS[preview.reason] });
		}
		const verdict = licenseEmailMatches(preview.view.entitlements!, email);
		if (verdict !== 'match') {
			return fail(400, {
				mode: 'firstRun',
				email,
				reason: verdict,
				message:
					verdict === 'mismatch'
						? 'This licence key was issued to a different address. Use the address the key was sent to, or ask us to re-issue it.'
						: 'This licence key predates the address check, so it cannot prove who it belongs to. Ask us for a re-issued key naming your address.'
			});
		}
		return { mode: 'firstRun', step: 'password' as const, email, key, license: preview.view };
	},

	/**
	 * First run, step two: claim the install. Everything is re-checked here
	 * rather than trusted from the round trip, because the browser is free to
	 * post whatever it likes: the pair is proven again, and the window is proven
	 * still open, before an account exists.
	 */
	firstRunCreate: async ({ request, cookies, getClientAddress, url, locals }) => {
		const limited = rateLimited(getClientAddress, 'register');
		if (limited) return limited;
		const services = getServices();
		if (!locals.authRequired || !services.licenseRequired() || !(await installUnclaimed())) {
			return fail(403, { mode: 'firstRun', message: 'This installation is already claimed.' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const key = String(form.get('key') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		if (!password) return fail(400, { mode: 'firstRun', step: 'password' as const, email, key, message: 'Choose a password.' });
		if (password !== confirm) {
			return fail(400, { mode: 'firstRun', step: 'password' as const, email, key, message: 'The two passwords do not match.' });
		}

		const preview = await services.previewLicense.execute(key);
		if (!preview.ok) {
			return fail(400, { mode: 'firstRun', email, reason: preview.reason, message: FIRST_RUN_REASONS[preview.reason] });
		}
		if (licenseEmailMatches(preview.view.entitlements!, email) !== 'match') {
			return fail(400, { mode: 'firstRun', email, message: 'This licence key was not issued to that address.' });
		}

		// Activate BEFORE creating the account: an install that activates and then
		// fails to register can be finished by trying again, while an account
		// created against a licence that then refuses to store would land its
		// owner on the activation wall with no way to pass it.
		const activation = await services.activateLicense.execute(key, email);
		if (!activation.ok) {
			return fail(400, { mode: 'firstRun', email, reason: activation.reason, message: FIRST_RUN_REASONS[activation.reason] });
		}
		await services.seedActivationDefaults.execute(activation.view.entitlements);
		await services.syncBackLicence.execute(true);

		const result = await signUp({ email, password });
		if ('error' in result) {
			getServices().audit.record({ action: 'auth.register', actor: email, outcome: 'failure', detail: result.error });
			return fail(400, { mode: 'firstRun', step: 'password' as const, email, key, message: result.error });
		}
		getServices().audit.record({ action: 'auth.register', actor: email, outcome: 'success', detail: 'first run' });
		setSessionCookie(cookies, result.token);
		// What the identity source does for a freshly claimed install (Enterprise
		// gives the account the workspace it owns, named after the licence
		// customer). Best-effort by contract: one can be created from the app.
		await services.identity.afterFirstRun(result.token, {
			customer: preview.view.entitlements?.customer ?? '',
			edition: preview.view.entitlements?.edition
		});
		redirect(303, safeRedirect(url));
	},

	login: async ({ request, cookies, getClientAddress, url }) => {
		const limited = rateLimited(getClientAddress, 'login');
		if (limited) return limited;
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { mode: 'login', email, message: 'Email and password are required.' });

		const result = await signIn(email, password);
		if ('error' in result) {
			getServices().audit.record({ action: 'auth.login', actor: email, outcome: 'failure', detail: result.error });
			return fail(400, { mode: 'login', email, message: result.error });
		}

		getServices().audit.record({ action: 'auth.login', actor: email, outcome: 'success' });
		setSessionCookie(cookies, result.token);
		redirect(303, safeRedirect(url));
	},

	register: async ({ request, cookies, getClientAddress, url }) => {
		const limited = rateLimited(getClientAddress, 'register');
		if (limited) return limited;
		// The one bypass of the instance-wide signup switch is a still-open
		// invitation. It is re-read from the back here, so the bypass costs a real
		// token and not a hand-written ?redirect= query.
		const { invitation } = await invitationBehind(safeRedirect(url));
		if (!signupAllowed() && !invitation) {
			return fail(403, { mode: 'register', message: 'Self-service signup is disabled. Contact your administrator.' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		// The back owns identity as two parts (first/last); it refuses a `name`.
		const firstName = String(form.get('firstName') ?? '').trim();
		const lastName = String(form.get('lastName') ?? '').trim();
		if (!email || !password) return fail(400, { mode: 'register', email, message: 'Email and password are required.' });
		// Registering off an invitation only works for the invited address (the back
		// matches on it), so name it here instead of letting the back answer with
		// its generic "registration is closed".
		if (invitation && !signupAllowed() && email.toLowerCase() !== invitation.email.toLowerCase()) {
			return fail(400, {
				mode: 'register',
				email,
				message: `This invitation was issued to ${invitation.email}. Sign up with that address, or ask for a new invitation.`
			});
		}

		const result = await signUp({
			email,
			password,
			...(firstName ? { firstName } : {}),
			...(lastName ? { lastName } : {})
		});
		if ('error' in result) {
			getServices().audit.record({ action: 'auth.register', actor: email, outcome: 'failure', detail: result.error });
			// An invitee who already has an account (invited into a second workspace)
			// lands on the sign-up form by default: send them to sign-in with the
			// address kept, rather than leaving them on a form that cannot succeed.
			if (/already registered/i.test(result.error)) {
				return fail(400, {
					mode: 'login',
					email,
					message: 'This address already has an account. Sign in and the invitation is waiting.'
				});
			}
			return fail(400, { mode: 'register', email, message: result.error });
		}

		getServices().audit.record({ action: 'auth.register', actor: email, outcome: 'success' });
		setSessionCookie(cookies, result.token);
		redirect(303, safeRedirect(url));
	}
};
