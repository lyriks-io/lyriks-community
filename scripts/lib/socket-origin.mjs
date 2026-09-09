/** Browser socket upgrades must originate from this install, including same-site callers. */
export function trustedSocketOrigin(req, env) {
	const origin = req.headers.origin;
	if (typeof origin !== 'string') return false;
	try {
		if (new URL(origin).origin !== origin) return false;
		const configured = (env.LYRIKS_TRUSTED_ORIGINS ?? '').split(',').map(v => v.trim().replace(/\/$/, '')).filter(Boolean);
		if (configured.length) return configured.includes(origin);
		if (env.ORIGIN) return origin === new URL(env.ORIGIN).origin;
		const protocol = req.headers['x-forwarded-proto'] ?? (req.socket?.encrypted ? 'https' : 'http');
		return origin === `${protocol}://${req.headers.host}`;
	} catch {
		return false;
	}
}
