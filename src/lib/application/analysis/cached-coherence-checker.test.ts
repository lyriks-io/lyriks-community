import { describe, expect, it } from 'vitest';
import type { CoherenceAnalysisOptions, GlobalCoherenceCheckerPort, ProjectModelRevisionPort } from '../ports';
import { CachedCoherenceChecker } from './cached-coherence-checker';

/**
 * The keep-or-compute rules themselves (per project, per revision and kernel,
 * shared in flight, failures not kept) are proven on ProjectStateCache; these
 * cases prove the checker reads through it and lets a forced run past it.
 */
function setup() {
	const state = { revision: 'r1', runs: 0, lastOptions: undefined as CoherenceAnalysisOptions | undefined };
	const inner = {
		analyze: async (_projectId: string, opts?: CoherenceAnalysisOptions) => {
			state.runs += 1;
			state.lastOptions = opts;
			return { readinessScore: state.runs, gaps: [], dimensions: [] };
		}
	} satisfies GlobalCoherenceCheckerPort;
	const revision = { fingerprint: async () => state.revision } satisfies ProjectModelRevisionPort;
	return { state, checker: new CachedCoherenceChecker(inner, revision, () => 'k1') };
}

describe('the coherence analysis is computed once per state of the spec', () => {
	it('serves the same analysis while nothing it reads has moved, and computes again once a section moves', async () => {
		const { state, checker } = setup();
		const first = await checker.analyze('p');
		expect(await checker.analyze('p')).toBe(first);
		state.revision = 'r2';
		expect((await checker.analyze('p')).readinessScore).toBe(2);
	});

	it('computes on a forced run, whatever the state, and passes the option on', async () => {
		const { state, checker } = setup();
		await checker.analyze('p');
		expect((await checker.analyze('p', { force: true })).readinessScore).toBe(2);
		expect(state.lastOptions).toEqual({ force: true });
	});
});
