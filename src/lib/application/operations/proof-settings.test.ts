import { describe, expect, it, vi } from 'vitest';
import { LoadProofSettingsUseCase, SaveProofSettingsUseCase } from './proof-settings';
import type { ContainerResourcesPort, ProofSwitchPort, SettingsRepositoryPort } from '../ports';

function repo(on = false) {
	let stored = { on };
	return {
		loadProofs: vi.fn(async () => stored),
		saveProofs: vi.fn(async (s: { on: boolean }) => void (stored = s))
	} as unknown as SettingsRepositoryPort & { saveProofs: ReturnType<typeof vi.fn> };
}
const sw = (over: Partial<ProofSwitchPort> = {}): ProofSwitchPort & { apply: ReturnType<typeof vi.fn> } =>
	({ allowed: true, operatorTurnedOff: false, apply: vi.fn(), ...over }) as never;
const machine = (cpus: number, gib: number): ContainerResourcesPort => ({
	read: async () => ({ cpus, memoryLimitGiB: null, memoryTotalGiB: gib })
});

describe('Settings, Proofs', () => {
	it('[criterion:2fa07b24] reads off on a new installation, with the machine and its advice', async () => {
		const view = await new LoadProofSettingsUseCase(repo(), sw(), machine(4, 7.6)).execute();
		expect(view.on).toBe(false);
		expect(view.machine).toEqual({ processors: 4, memoryGb: 7.6 });
		expect(view.advice?.suggestion).toMatch(/8 processors and 16 GB is recommended/);
	});

	it('[criterion:50fb0ae2] saves the choice and applies it to the engine', async () => {
		const r = repo();
		const s = sw();
		expect(await new SaveProofSettingsUseCase(r, s).execute({ on: true })).toEqual({ ok: true, on: true });
		expect(r.saveProofs).toHaveBeenCalledWith({ on: true });
		expect(s.apply).toHaveBeenCalledWith(true);
	});

	it('[criterion:58a27462] refuses to turn proofs on against UNSPA_SOLVER=off, and reads them off', async () => {
		const s = sw({ operatorTurnedOff: true });
		const r = repo(true);
		const saved = await new SaveProofSettingsUseCase(r, s).execute({ on: true });
		expect(saved.ok).toBe(false);
		expect(s.apply).not.toHaveBeenCalled();
		expect((await new LoadProofSettingsUseCase(r, s, machine(8, 16)).execute()).on).toBe(false);
	});

	it('[criterion:47fd6172] refuses on Community, naming Enterprise', async () => {
		const saved = await new SaveProofSettingsUseCase(repo(), sw({ allowed: false })).execute({ on: true });
		expect(saved).toEqual({ ok: false, refusal: 'Proving a rule for every value is part of Enterprise.' });
	});
});
