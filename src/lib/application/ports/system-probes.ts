/**
 * Narrow probes behind the components screen. Each is its own role interface so
 * a component can be asked for its version without dragging in the port that
 * does the real work (the advisor, the back client): the screen depends on
 * "tell me your version", nothing else.
 *
 * Every probe answers instead of throwing — an install where one component is
 * down must still render the others.
 */
import type { ContainerResources, HostFacts } from '$domain/system';

/** The engine subprocess, as it identifies itself in the MCP handshake. */
export interface EngineVersionProbePort {
	/** `null` when the engine is unreachable or does not advertise a version. */
	engineVersion(): Promise<string | null>;
	/**
	 * Which solver the engine proves with, on an installation that proves;
	 * `null` where it does not prove or the engine did not say.
	 */
	solverStatus?(): Promise<SolverStatus | null>;
}

/** The proof module the engine loaded (or tried to): its name, and its version once loaded. */
export type ProofModule = { readonly name: string; readonly version: string | null };

/** The engine's solver: the native one and its version, or none and why; and the proof module behind it. */
export type SolverStatus = (
	| { readonly kind: 'native'; readonly version: string }
	| { readonly kind: 'wasm' | 'none'; readonly reason: string }
) & { readonly prover?: ProofModule };

/** What Lyriks-back reports about itself and the formal engine behind it. */
export interface BackSystemInfo {
	readonly reachable: boolean;
	/** `null` until the back reports its own version (see the back master prompt). */
	readonly apiVersion: string | null;
	/** The DPO formal engine, as the back's readiness snapshot describes it. */
	readonly dpo: 'available' | 'disabled' | 'unknown';
	readonly dpoVersion: string | null;
}

export interface BackSystemProbePort {
	/** `null` when no back is configured — the standalone MAP, not a failure. */
	probe(): Promise<BackSystemInfo | null>;
}

/** The datastore's own server version (support context, not a Lyriks component). */
export interface DatastoreVersionProbePort {
	serverVersion(): Promise<string | null>;
}

/**
 * What the appliance kit read off the host when it installed or last updated
 * this appliance. Not a probe: a container cannot see its own machine, so this
 * is a file the installer left behind, and `null` is the ordinary answer on an
 * install whose kit never wrote one.
 */
export interface HostFactsPort {
	read(): Promise<HostFacts | null>;
}

/**
 * What this very process is granted right now (cgroup limits, visible CPUs).
 * The live counterpart to the recorded facts above, and the only one that
 * cannot go stale.
 */
export interface ContainerResourcesPort {
	read(): Promise<ContainerResources | null>;
}
