import { describe, expect, it } from 'vitest';
import { defaultProofSettings, machineAdvice, normalizeProofSettings, parseProofSettings } from './proof-settings';

describe('proof settings', () => {
	it('[criterion:2fa07b24] reads off on a new installation and for anything but an explicit true', () => {
		expect(defaultProofSettings()).toEqual({ on: false });
		for (const doc of [null, undefined, {}, { on: 'yes' }, { on: 1 }]) expect(normalizeProofSettings(doc).on).toBe(false);
		expect(normalizeProofSettings({ on: true }).on).toBe(true);
	});

	it('refuses a change that does not say true or false', () => {
		expect(parseProofSettings({ on: true })).toEqual({ ok: true, settings: { on: true } });
		expect(parseProofSettings({ on: 'on' }).ok).toBe(false);
	});
});

describe('machineAdvice [criterion:46637972]', () => {
	it('reads the machine and suggests a larger one below 8 processors or 16 GB', () => {
		const small = machineAdvice({ processors: 4, memoryGb: 7.6 });
		expect(small.reads).toBe('This machine has 4 processors and 8 GB of memory. Proofs ask at least 8 processors and 16 GB.');
		expect(small.enough).toBe(false);
		expect(small.suggestion).toMatch(/at least 8 processors and 16 GB is recommended/);
		expect(machineAdvice({ processors: 16, memoryGb: 8 }).enough).toBe(false);
	});

	it('suggests nothing on a machine that meets both', () => {
		const big = machineAdvice({ processors: 8, memoryGb: 16 });
		expect(big.enough).toBe(true);
		expect(big.suggestion).toBeNull();
	});
});
