import type { IdentityAccount } from '$application/ports';

// This is a proof for one HTTP request, never a reusable authorization cache.
// Keep the token server-side, outside client-safe locals, and compare it again
// in case a later server handler changed the session cookie.
const accounts = new WeakMap<Request, { readonly token: string; readonly account: IdentityAccount }>();

export function rememberRequestIdentity(request: Request, token: string, account: IdentityAccount): void {
	accounts.set(request, { token, account });
}

export function requestIdentity(request: Request, token: string): IdentityAccount | undefined {
	const proof = accounts.get(request);
	return proof?.token === token ? proof.account : undefined;
}
