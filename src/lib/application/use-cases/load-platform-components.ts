import { hostComponents, type ComponentVersion } from '$domain/system';
import type { ClockPort } from '../ports/clock';
import type {
	BackSystemProbePort,
	ContainerResourcesPort,
	DatastoreVersionProbePort,
	EngineVersionProbePort,
	HostFactsPort
} from '../ports/system-probes';

/**
 * Identity of the running platform build. Assembled at the composition root
 * from values stamped INTO the image at build time (see the Dockerfile) — never
 * typed by hand, so the screen cannot drift from what is deployed.
 */
export interface PlatformBuildInfo {
	/** The release this build was cut from (package.json, compiled in). */
	readonly version: string;
	/** The image tag this container was deployed as, when the appliance sets it. */
	readonly imageTag: string | null;
	/** Short commit the image was built from. */
	readonly commit: string | null;
	/** ISO-8601 build timestamp. */
	readonly builtAt: string | null;
}

/** Probes are cheap but cross a network; a support screen may be reloaded a lot. */
const CACHE_TTL_MS = 30_000;

/**
 * The inventory behind Settings → Versions: every Lyriks-built component of
 * this install plus the runtime under it, each reporting its own version.
 *
 * The whole point is honesty, so the rules are: a probe that fails degrades ONE
 * row (never the screen), an optional component that is not wired reads
 * `not-configured` rather than broken, and a component that answers without a
 * version stays `unknown` instead of being handed the platform's number.
 *
 * The list closes on the machine itself: what the appliance kit read off the
 * host at install and at every update (this process cannot see it), and what
 * this container was actually granted. Same rule, so an install that never
 * recorded a host simply has no such rows.
 */
export class LoadPlatformComponentsUseCase {
	#cache: { at: number; components: ComponentVersion[] } | null = null;

	constructor(
		private readonly build: PlatformBuildInfo,
		private readonly engine: EngineVersionProbePort,
		private readonly back: BackSystemProbePort,
		private readonly datastore: DatastoreVersionProbePort,
		private readonly clock: ClockPort,
		/** Engine release this build depends on — the fallback when it is silent. */
		private readonly declaredEngineVersion: string,
		/** What the kit read off the host; absent on an install that never did. */
		private readonly hostFacts: HostFactsPort,
		/** What this container itself holds, the one figure that cannot go stale. */
		private readonly containerResources: ContainerResourcesPort
	) {}

	async execute(force = false): Promise<ComponentVersion[]> {
		const now = Date.parse(this.clock.nowIso());
		if (!force && this.#cache && now - this.#cache.at < CACHE_TTL_MS) {
			return this.#cache.components;
		}
		const [engineVersion, back, datastoreVersion, host, resources] = await Promise.all([
			this.#safe(() => this.engine.engineVersion()),
			this.#safe(() => this.back.probe()),
			this.#safe(() => this.datastore.serverVersion()),
			this.#safe(() => this.hostFacts.read()),
			this.#safe(() => this.containerResources.read())
		]);

		const components: ComponentVersion[] = [
			this.#platform(),
			this.#engineRow(engineVersion),
			...this.#backRows(back),
			this.#datastoreRow(datastoreVersion),
			{
				id: 'node',
				name: 'Node.js',
				origin: 'runtime',
				version: process.version.replace(/^v/, ''),
				status: 'running',
				detail: 'Runtime of the platform process.'
			},
			// The machine underneath, recorded by the kit because this process
			// cannot see it, plus what this process was actually granted. Both
			// degrade to nothing rather than to a guess.
			...hostComponents(host, resources)
		];
		this.#cache = { at: now, components };
		return components;
	}

	#platform(): ComponentVersion {
		const build: Record<string, string> = {};
		if (this.build.imageTag) build['Image tag'] = this.build.imageTag;
		if (this.build.commit) build.Commit = this.build.commit;
		if (this.build.builtAt) build.Built = this.build.builtAt;
		return {
			id: 'platform',
			name: 'Lyriks platform',
			origin: 'lyriks',
			version: this.build.version,
			status: 'running',
			detail: 'This application, stamped at image build.',
			build: Object.keys(build).length ? build : undefined
		};
	}

	#engineRow(version: string | null): ComponentVersion {
		// The engine answers the MCP handshake with its own version, so a local
		// development build reports ITSELF — not the version package.json asked for.
		if (version) {
			const drifted = version !== this.declaredEngineVersion;
			return {
				id: 'unspaghettit',
				name: 'Unspaghettit engine',
				origin: 'lyriks',
				version,
				status: 'reachable',
				detail: drifted
					? `Reported by the running engine; this build declares ${this.declaredEngineVersion}.`
					: 'Reported by the running engine.'
			};
		}
		return {
			id: 'unspaghettit',
			name: 'Unspaghettit engine',
			origin: 'lyriks',
			version: this.declaredEngineVersion,
			status: 'unknown',
			detail: 'Engine not started yet; showing the version this build ships.'
		};
	}

	#backRows(back: Awaited<ReturnType<BackSystemProbePort['probe']>> | null): ComponentVersion[] {
		if (!back) {
			return [
				{
					id: 'back',
					name: 'Lyriks-back',
					origin: 'lyriks',
					version: null,
					status: 'not-configured',
					detail: 'No companion API on this install.'
				},
				{
					id: 'dpo',
					name: 'Lyriks DPO engine',
					origin: 'lyriks',
					version: null,
					status: 'not-configured',
					detail: 'Reached through Lyriks-back; unavailable without it.'
				}
			];
		}
		const api: ComponentVersion = back.reachable
			? {
					id: 'back',
					name: 'Lyriks-back',
					origin: 'lyriks',
					version: back.apiVersion,
					status: back.apiVersion ? 'reachable' : 'unknown',
					detail: back.apiVersion
						? 'Reported by the back API.'
						: 'Reachable, but this back does not report its version yet.'
				}
			: {
					id: 'back',
					name: 'Lyriks-back',
					origin: 'lyriks',
					version: null,
					status: 'unreachable',
					detail: 'Configured, but the API did not answer.'
				};

		const dpo: ComponentVersion = !back.reachable
			? {
					id: 'dpo',
					name: 'Lyriks DPO engine',
					origin: 'lyriks',
					version: null,
					status: 'unknown',
					detail: 'Reached through Lyriks-back, which did not answer.'
				}
			: back.dpo === 'available'
				? {
						id: 'dpo',
						name: 'Lyriks DPO engine',
						origin: 'lyriks',
						version: back.dpoVersion,
						status: back.dpoVersion ? 'reachable' : 'unknown',
						detail: back.dpoVersion
							? 'Reported by Lyriks-back.'
							: 'Wired and answering; version not reported by the back yet.'
					}
				: back.dpo === 'disabled'
					? {
							id: 'dpo',
							name: 'Lyriks DPO engine',
							origin: 'lyriks',
							version: null,
							status: 'not-configured',
							detail: 'The back reports the formal engine as disabled.'
						}
					: {
							id: 'dpo',
							name: 'Lyriks DPO engine',
							origin: 'lyriks',
							version: null,
							status: 'unknown',
							detail: 'The back did not describe the formal engine.'
						};
		return [api, dpo];
	}

	#datastoreRow(version: string | null): ComponentVersion {
		return {
			id: 'postgres',
			name: 'PostgreSQL',
			origin: 'runtime',
			version,
			status: version ? 'reachable' : 'unreachable',
			detail: version ? 'Reported by the server.' : 'The datastore did not answer.'
		};
	}

	/** A probe that throws degrades its own row, never the screen. */
	async #safe<T>(run: () => Promise<T>): Promise<T | null> {
		try {
			return await run();
		} catch {
			return null;
		}
	}
}
