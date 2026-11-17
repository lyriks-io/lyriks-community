import { describe, expect, it, vi } from 'vitest';
import type { CoherenceAnalysis } from '$domain/coherence';
import { CachedCoherenceChecker } from './cached-coherence-checker';

const analysisOf = (n: number) => ({ readinessScore: n, gaps: [], dimensions: [] }) as unknown as CoherenceAnalysis;

function setup() {
	const state = { revision: 'r1', kernel: 'k1', runs: 0 };
	const inner = {
		analyze: vi.fn(async () => {
			state.runs += 1;
			return analysisOf(state.runs);
		})
	};
	const checker = new CachedCoherenceChecker(
		inner,
		{ fingerprint: async () => state.revision },
		() => state.kernel
	);
	return { state, inner, checker };
}

describe('the coherence analysis is computed once per state of the spec', () => {
	it('serves the same analysis while nothing it reads has moved', async () => {
		const { inner, checker } = setup();
		const first = await checker.analyze('p');
		expect(await checker.analyze('p')).toBe(first);
		expect(inner.analyze).toHaveBeenCalledOnce();
	});

	it('computes again when a section moves', async () => {
		const { state, inner, checker } = setup();
		await checker.analyze('p');
		state.revision = 'r2';
		expect((await checker.analyze('p')).readinessScore).toBe(2);
		expect(inner.analyze).toHaveBeenCalledTimes(2);
	});

	it('computes again when the behaviour folder moves, which leaves no section revision', async () => {
		const { state, inner, checker } = setup();
		await checker.analyze('p');
		state.kernel = 'k2';
		await checker.analyze('p');
		expect(inner.analyze).toHaveBeenCalledTimes(2);
	});

	it('keeps one analysis per project', async () => {
		const { inner, checker } = setup();
		await checker.analyze('a');
		await checker.analyze('b');
		await checker.analyze('a');
		expect(inner.analyze).toHaveBeenCalledTimes(2);
	});

	it('shares one computation between readers arriving together', async () => {
		const { inner, checker } = setup();
		const [a, b] = await Promise.all([checker.analyze('p'), checker.analyze('p')]);
		expect(a).toBe(b);
		expect(inner.analyze).toHaveBeenCalledOnce();
	});

	it('computes on a forced run, whatever the state, and passes the option on', async () => {
		const { inner, checker } = setup();
		await checker.analyze('p');
		await checker.analyze('p', { force: true });
		expect(inner.analyze).toHaveBeenCalledTimes(2);
		expect(inner.analyze).toHaveBeenLastCalledWith('p', { force: true });
	});

	it('does not keep a failure', async () => {
		const { inner, checker } = setup();
		inner.analyze.mockRejectedValueOnce(new Error('unreadable'));
		await expect(checker.analyze('p')).rejects.toThrow('unreadable');
		expect((await checker.analyze('p')).readinessScore).toBe(1);
	});
});
