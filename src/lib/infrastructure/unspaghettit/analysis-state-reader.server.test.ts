import { describe, expect, it, vi } from 'vitest';
import type { CodeAdoptionPort } from '$application/ports';
import { EngineAnalysisStateReader, analysisStateOf } from './analysis-state-reader.server';

describe('analysisStateOf', () => {
	it('reads a started, unfinalized analysis from the engine provenance', () => {
		expect(analysisStateOf({ ok: true, value: { sources: [{ id: 's1' }], spanCount: 3, untracedCount: 2, finalized: false, file: null } })).toEqual({
			started: true,
			finalized: false,
			untraced: 2
		});
	});

	it('an analysis with no source, no span and no file was never started', () => {
		expect(analysisStateOf({ ok: true, value: { sources: [], spanCount: 0, untracedCount: 9, finalized: false, file: null } })?.started).toBe(false);
	});

	it('says nothing when the engine cannot answer', () => {
		expect(analysisStateOf(null)).toBeNull();
		expect(analysisStateOf({ ok: false, error: 'down' })).toBeNull();
	});
});

describe('EngineAnalysisStateReader', () => {
	it('shares an in-flight provenance read across simultaneous page requests', async () => {
		let finish!: (value: unknown) => void;
		const getProvenance = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
		const reader = new EngineAnalysisStateReader({ getProvenance } as unknown as CodeAdoptionPort);
		const first = reader.read('f1');
		const second = reader.read('f1');
		expect(getProvenance).toHaveBeenCalledTimes(1);
		finish({ ok: true, value: { sources: [], spanCount: 1, untracedCount: 0, finalized: true } });
		expect(await first).toEqual(await second);
		await reader.read('f1');
		expect(getProvenance).toHaveBeenCalledTimes(1);
	});

	it('clears a failed read so the next request can retry', async () => {
		const getProvenance = vi.fn().mockRejectedValueOnce(new Error('disconnected')).mockResolvedValue(null);
		const reader = new EngineAnalysisStateReader({ getProvenance } as unknown as CodeAdoptionPort);
		const reads = await Promise.allSettled([reader.read('f1'), reader.read('f1')]);
		expect(reads.map((r) => r.status)).toEqual(['rejected', 'rejected']);
		expect(getProvenance).toHaveBeenCalledTimes(1);
		expect(await reader.read('f1')).toBeNull();
		expect(getProvenance).toHaveBeenCalledTimes(2);
	});

	it('asks the engine once a minute per feature', async () => {
		const getProvenance = vi.fn().mockResolvedValue({ ok: true, value: { sources: [], spanCount: 1, untracedCount: 0, finalized: true } });
		let now = 0;
		const reader = new EngineAnalysisStateReader({ getProvenance } as unknown as CodeAdoptionPort, () => now);
		await reader.read('f1');
		await reader.read('f1');
		expect(getProvenance).toHaveBeenCalledTimes(1);
		now = 61_000;
		await reader.read('f1');
		expect(getProvenance).toHaveBeenCalledTimes(2);
	});
});
