import { isCommunity, locked, type ScopeCheck } from './community-scope';

/**
 * Who may sign in to a Community installation (EVO-001): its one user. Where
 * the identity source can hold several accounts (an installation moved down
 * from a paid plan), only the installation's holder gets in; every former
 * member is refused with the plan that opens sharing. `holders` are the
 * addresses that hold the installation (its licence holder and administrators);
 * with none known the identity source's own single account is the one user.
 */
export function communitySignIn(
	edition: string | null | undefined,
	input: { readonly email: string; readonly holders: readonly string[]; readonly severalAccounts: boolean }
): ScopeCheck {
	if (!isCommunity(edition) || !input.severalAccounts || input.holders.length === 0) return { ok: true };
	const email = input.email.trim().toLowerCase();
	return input.holders.some((h) => h.trim().toLowerCase() === email) ? { ok: true } : locked('sharing');
}

/** A second account, opened by sign-up or by an invitation, is refused on Community once one exists. */
export function communityRegistration(edition: string | null | undefined, input: { readonly accountExists: boolean; readonly viaInvitation: boolean }): ScopeCheck {
	return isCommunity(edition) && (input.accountExists || input.viaInvitation) ? locked('sharing') : { ok: true };
}
