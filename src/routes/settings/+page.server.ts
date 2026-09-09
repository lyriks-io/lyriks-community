import { getServices } from '$composition/container.server';
import { tierLabel } from '$domain/tier/tier';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';
import type { PageServerLoad } from './$types';

/**
 * Member administration is an Enterprise capability, served by the overlay's
 * hook when it is compiled in. The open-source build shows the section
 * inactive under an Enterprise badge, so the operator learns where the
 * capability lives and which edition unlocks it.
 */
const LOCKED_MEMBERS = { locked: true as const, workspace: null };

export const load: PageServerLoad = async (event) => {
	const services = getServices();
	const ai = await services.loadSettings.execute();
	// The feedback-channel switch (Settings → Feedback): whether the dialog may
	// offer its online channel on this install.
	const feedback = await services.loadFeedbackSettings.execute();
	// Everything the licence key reports belongs on this screen too, not only on
	// /activate: the account section is where an operator looks themselves up.
	// Client-safe view (never the raw key), re-verified offline on each load.
	const license = await services.loadActivation.execute();
	const tier = services.currentTier();
	// Identity owned elsewhere (the Back) versus the local operator profile.
	const isEnterprise = services.identity.multiUser;
	const email = event.locals.session?.email ?? null;

	// Account identity. In Community / solo editions the display name is
	// operator-editable and stored in Postgres; in Enterprise, identity is owned
	// by lyriks-back and edited as the first/last name of my own roster row.
	const operator = isEnterprise ? null : await services.loadOperatorProfile.execute();
	// What this install is made of — every component self-reported (see the
	// use-case). Probed on load and cached there, so the panel is truthful the
	// moment it is opened without a client round-trip.
	const components = await services.loadPlatformComponents.execute();
	// Currency of this install. The use-case caches for hours and short-circuits
	// before any IO when the feed is off or the tag is not comparable, so an
	// air-gapped appliance never builds a request. Failure is swallowed to
	// `unknown`: a registry that is slow or gone must not stop Settings rendering,
	// and "unknown" is what the UI shows nothing for.
	const update = await services.checkForUpdate.execute().catch(() => ({ state: 'unknown' as const }));
	const account = {
		email,
		displayName: operator?.displayName ?? '',
		tier,
		editionLabel: tierLabel(tier),
		role: null as string | null,
		/**
		 * Where this account's name is owned, which is also where the editor writes:
		 *  - 'operator' — the local operator profile (Community / solo).
		 *  - 'self'     — the back-owned identity, edited through /v1/users/me.
		 *  - 'none'     — read-only (someone else administers this identity).
		 *
		 * Enterprise is 'self', never 'none'. It used to be read-only unless you
		 * were an owner/admin of a workspace, on the reasoning that the back only
		 * lets an owner/admin write a member profile. That is true of editing
		 * SOMEBODY ELSE's row, and irrelevant here: the back has always let an
		 * account edit itself. The gate denied ordinary members the right to fix
		 * their own name, and told the appliance's first admin — who belongs to no
		 * workspace yet — to ask an administrator, being the administrator.
		 */
		nameSource: (isEnterprise ? 'self' : 'operator') as 'operator' | 'self' | 'none',
		/**
		 * The password form shows whenever this session actually signed in with
		 * a credential, which is what LYRIKS_AUTH_REQUIRED=1 means, for every
		 * edition: Community's single seat is a real account too. Gating the
		 * form on nameSource conflated "who owns the display name" with "does
		 * this session hold a password" and hid the only way to carry out the
		 * installer's own first instruction.
		 */
		canChangePassword: event.locals.authRequired === true,
		/** Set with nameSource 'member': the caller's own row in the roster. */
		userId: null as string | null,
		workspaceId: null as string | null,
		firstName: '',
		lastName: ''
	};

	// Enterprise identity comes from the account itself, not from a roster row —
	// so it loads for an account that belongs to no workspace, which is exactly
	// the state a freshly bootstrapped admin is in.
	if (isEnterprise) {
		const own = await services.identity.profile(event.cookies.get(SESSION_COOKIE) ?? '');
		if (own) {
			account.firstName = own.firstName;
			account.lastName = own.lastName;
			account.displayName = [own.firstName, own.lastName].filter(Boolean).join(' ');
		}
	}

	// Member administration and the Community reclaim belong to the Enterprise
	// overlay: its hooks resolve the caller's workspace and roster and render
	// through its own panels. Without the overlay the section is a locked notice.
	const hooks = services.enterpriseHooks;
	const membersAdmin = hooks ? await hooks.settingsMembers(event) : LOCKED_MEMBERS;
	const reclaim = hooks ? await hooks.settingsReclaim(event) : null;
	if (
		membersAdmin &&
		typeof membersAdmin === 'object' &&
		'account' in membersAdmin &&
		membersAdmin.account &&
		typeof membersAdmin.account === 'object'
	) {
		// The roster row is the richer source for the caller's own name and ids.
		Object.assign(account, membersAdmin.account);
	}

	return {
		ai,
		feedback,
		license,
		account,
		components,
		update,
		reclaim,
		membersAdmin
	};
};
