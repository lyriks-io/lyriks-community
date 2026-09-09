import type { UpdateFeedPort } from '$application/ports';

/**
 * Opt-in update feed backed by the OCI Distribution (Docker Registry v2) API.
 *
 * Deliberately asks the registry the install ALREADY pulls its images from
 * (`LYRIKS_REGISTRY`): the update check therefore adds no new egress destination
 * and no new trust relationship, and a customer pointing at an internal mirror
 * keeps the whole check inside their own network. It reads the image's tag list
 * (`GET /v2/<repo>/tags/list`) — no pulls, no manifests, a few hundred bytes.
 *
 * Best-effort: every failure (offline, 401, slow mirror, malformed body) is a
 * null, never a throw. Not knowing must not break a page.
 */

interface RegistryUpdateFeedOptions {
	/** `LYRIKS_REGISTRY`, e.g. `registry.lyriks.io/enterprise` or `registry.corp.local/lyriks`. */
	readonly registry: string;
	/** Image name within the registry namespace. */
	readonly image: string;
	/** Optional pull credentials — needed for a private repo, omitted for a mirror. */
	readonly username?: string;
	readonly password?: string;
}

/** A registry host is the first segment only when it looks like a host. */
function isHost(segment: string): boolean {
	return segment.includes('.') || segment.includes(':') || segment === 'localhost';
}

/** Split `ghcr.io/lyriks-io` + `lyriks-platform` into a host and a repository path. */
function splitRegistry(registry: string, image: string): { host: string; repository: string } {
	const parts = registry.split('/').filter(Boolean);
	const host = parts.length && isHost(parts[0]) ? parts[0] : 'registry-1.docker.io';
	const namespace = (parts.length && isHost(parts[0]) ? parts.slice(1) : parts).join('/');
	return { host, repository: namespace ? `${namespace}/${image}` : image };
}

/**
 * Parse the realm/service/scope out of a `WWW-Authenticate: Bearer …` challenge.
 * Returns null for Basic-only registries, which need no token exchange.
 */
function parseBearerChallenge(header: string): Record<string, string> | null {
	if (!/^Bearer\s/i.test(header)) return null;
	const params: Record<string, string> = {};
	for (const m of header.slice(7).matchAll(/([a-z_]+)="([^"]*)"/gi)) params[m[1]] = m[2];
	return params.realm ? params : null;
}

export class RegistryUpdateFeed implements UpdateFeedPort {
	readonly enabled = true;
	readonly #host: string;
	readonly #repository: string;
	readonly #basic?: string;

	constructor(options: RegistryUpdateFeedOptions) {
		const { host, repository } = splitRegistry(options.registry, options.image);
		this.#host = host;
		this.#repository = repository;
		this.#basic =
			options.username && options.password
				? Buffer.from(`${options.username}:${options.password}`).toString('base64')
				: undefined;
	}

	/** Bounded so a hanging mirror can never hold a request open. */
	#fetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
		return fetch(url, { headers, signal: AbortSignal.timeout(5000) });
	}

	/** Exchange the registry's challenge for a short-lived pull token. */
	async #bearerToken(challenge: Record<string, string>): Promise<string | null> {
		const url = new URL(challenge.realm);
		if (challenge.service) url.searchParams.set('service', challenge.service);
		url.searchParams.set('scope', challenge.scope ?? `repository:${this.#repository}:pull`);
		const res = await this.#fetch(
			url.toString(),
			this.#basic ? { authorization: `Basic ${this.#basic}` } : {}
		);
		if (!res.ok) return null;
		const body = (await res.json()) as { token?: string; access_token?: string };
		return body.token ?? body.access_token ?? null;
	}

	async listVersions(): Promise<readonly string[] | null> {
		const url = `https://${this.#host}/v2/${this.#repository}/tags/list?n=100`;
		try {
			// Anonymous first: public repos and most mirrors answer straight away.
			let res = await this.#fetch(url, this.#basic ? { authorization: `Basic ${this.#basic}` } : {});

			if (res.status === 401) {
				const challenge = parseBearerChallenge(res.headers.get('www-authenticate') ?? '');
				if (!challenge) return null;
				const token = await this.#bearerToken(challenge);
				if (!token) return null;
				res = await this.#fetch(url, { authorization: `Bearer ${token}` });
			}

			if (!res.ok) return null;
			const body = (await res.json()) as { tags?: unknown };
			if (!Array.isArray(body.tags)) return null;
			return body.tags.filter((t): t is string => typeof t === 'string');
		} catch (e) {
			// Offline, DNS-blocked, timed out: the expected state for most installs.
			console.warn('[updates] registry tag list failed (best-effort):', (e as Error).message);
			return null;
		}
	}
}
