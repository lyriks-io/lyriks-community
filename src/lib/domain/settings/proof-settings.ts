/**
 * Whether the installation proves rules with the solver (Settings → Proofs,
 * feature 157, surface 7c01c470). Off on a new installation: the solver shares
 * the machine with the pages, so an administrator turns it on knowing what it
 * asks of the machine.
 */
export interface ProofSettings {
	readonly on: boolean;
}

export function defaultProofSettings(): ProofSettings {
	return { on: false };
}

/** Coerce a stored document: anything but an explicit true reads off. */
export function normalizeProofSettings(input: unknown): ProofSettings {
	const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	return { on: o.on === true };
}

/** A change asked by a person: `on` must say true or false. */
export function parseProofSettings(input: unknown): { ok: true; settings: ProofSettings } | { ok: false; refusal: string } {
	const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	return typeof o.on === 'boolean' ? { ok: true, settings: { on: o.on } } : { ok: false, refusal: 'Say whether proofs are on: true or false.' };
}

/**
 * What proofs ask of the machine (constants RECOMMENDED_PROCESSORS and
 * RECOMMENDED_MEMORY_GB of feature 157). Provisional: lab, 4 shared vCPU and
 * 8 GB, saturated with the solver on (2026-11-16); to be measured on an
 * 8-processor machine and written once.
 */
export const RECOMMENDED_PROCESSORS = 8;
export const RECOMMENDED_MEMORY_GB = 16;

/** The machine the installation runs on, as the platform reads it. */
export interface MachineResources {
	readonly processors: number;
	readonly memoryGb: number;
}

export interface MachineAdvice {
	/** Whether the machine meets what proofs ask. */
	readonly enough: boolean;
	/** What the panel says of the machine, always. */
	readonly reads: string;
	/** The suggestion of a larger machine, when it falls short. */
	readonly suggestion: string | null;
}

/** Reads the machine against what proofs ask (criterion 46637972, rule a52dd2f9). */
export function machineAdvice(machine: MachineResources): MachineAdvice {
	const memory = Math.round(machine.memoryGb);
	const reads = `This machine has ${machine.processors} processors and ${memory} GB of memory. Proofs ask at least ${RECOMMENDED_PROCESSORS} processors and ${RECOMMENDED_MEMORY_GB} GB.`;
	const enough = machine.processors >= RECOMMENDED_PROCESSORS && machine.memoryGb >= RECOMMENDED_MEMORY_GB;
	return {
		enough,
		reads,
		suggestion: enough
			? null
			: `Proofs share them with the pages and will slow them: a machine with at least ${RECOMMENDED_PROCESSORS} processors and ${RECOMMENDED_MEMORY_GB} GB is recommended.`
	};
}
