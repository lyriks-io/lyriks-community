import { machineAdvice, parseProofSettings, type MachineAdvice, type MachineResources } from '$domain/settings';
import type { ContainerResourcesPort, ProofSwitchPort, SettingsRepositoryPort } from '../ports';

/** What Settings → Proofs reads (feature 157, surface 7c01c470). */
export interface ProofSettingsView {
	/** Whether this installation may prove at all (Enterprise); Community reads the section locked. */
	readonly allowed: boolean;
	/** Whether the operator turned the solver off in the environment, which comes first. */
	readonly operatorTurnedOff: boolean;
	/** Whether proofs are on, as an administrator set them; off on a new installation. */
	readonly on: boolean;
	/** The machine and what proofs ask of it, when it can be read. */
	readonly machine: MachineResources | null;
	readonly advice: MachineAdvice | null;
}

/** Reads the proofs switch, the machine and the advice the panel shows (criteria 2fa07b24, 46637972). */
export class LoadProofSettingsUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly proofSwitch: ProofSwitchPort,
		private readonly resources: ContainerResourcesPort
	) {}

	async execute(): Promise<ProofSettingsView> {
		const [stored, container] = await Promise.all([this.repo.loadProofs(), this.resources.read().catch(() => null)]);
		const memoryGb = container?.memoryLimitGiB ?? container?.memoryTotalGiB ?? null;
		const machine = container?.cpus && memoryGb ? { processors: container.cpus, memoryGb } : null;
		return {
			allowed: this.proofSwitch.allowed,
			operatorTurnedOff: this.proofSwitch.operatorTurnedOff,
			on: this.proofSwitch.allowed && !this.proofSwitch.operatorTurnedOff && stored.on,
			machine,
			advice: machine ? machineAdvice(machine) : null
		};
	}
}

export type SaveProofSettingsResult = { ok: true; on: boolean } | { ok: false; refusal: string };

/**
 * Turns proofs on or off for the installation (action 0d29aee8): Enterprise
 * only, and never against the environment's UNSPA_SOLVER=off; the engine then
 * follows the switch without a restart.
 */
export class SaveProofSettingsUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly proofSwitch: ProofSwitchPort
	) {}

	async execute(input: unknown): Promise<SaveProofSettingsResult> {
		const parsed = parseProofSettings(input);
		if (!parsed.ok) return parsed;
		if (!this.proofSwitch.allowed) return { ok: false, refusal: 'Proving a rule for every value is part of Enterprise.' };
		if (parsed.settings.on && this.proofSwitch.operatorTurnedOff) {
			return { ok: false, refusal: "The solver is turned off in this installation's environment (UNSPA_SOLVER=off): remove it there first." };
		}
		await this.repo.saveProofs(parsed.settings);
		this.proofSwitch.apply(parsed.settings.on);
		return { ok: true, on: parsed.settings.on };
	}
}
