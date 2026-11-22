import { describe, expect, it } from 'vitest';
import { UNSPA_FEATURE_FORMAT, UNSPA_VERSION, type UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { BehaviorRepositoryPort, SpecProof, UnspaghettitAdvisorPort } from '../ports';
import { ProveFeatureRulesUseCase } from './prove-feature-rules';

type Solver = Pick<UnspaghettitAdvisorPort, 'available' | 'getSpecGapsAndProof' | 'proveFeatureRules'>;

/** The rule checks alone settle; the full proof, here, could not run its path search. */
const RULES_ONLY: SpecProof = { solver: 'ran', questions: 3, unsettled: 0, leads: [] };
const FULL: SpecProof = { solver: 'unavailable', questions: 0, unsettled: 0, reason: 'path search off', leads: [] };

const solver = (over: Partial<Solver> = {}): Solver => ({
	available: true,
	proveFeatureRules: async () => RULES_ONLY,
	getSpecGapsAndProof: async () => ({ gaps: [], proof: FULL }),
	...over
});

/** Project p1 holds feature feat-cart only. */
const models = {
	loadFeature: async (projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> =>
		projectId === 'p1' && featureId === 'feat-cart' ? { format: UNSPA_FEATURE_FORMAT, version: UNSPA_VERSION, feature: { id: 'feat-cart', surfaces: [] } } : null
} satisfies Pick<BehaviorRepositoryPort, 'loadFeature'>;

describe('proving one feature for the Rules tab', () => {
	it('reads the rules from the rule checks alone, and the statements from the full proof', async () => {
		const prove = new ProveFeatureRulesUseCase(solver(), models);
		expect(await prove.execute('p1', 'feat-cart', 'rules')).toMatchObject({ featureId: 'feat-cart', solver: 'ran' });
		expect(await prove.execute('p1', 'feat-cart', 'statements')).toMatchObject({ featureId: 'feat-cart', solver: 'unavailable' });
	});

	it('reads the rules from the full proof when the engine cannot check the rules alone', async () => {
		const prove = new ProveFeatureRulesUseCase(solver({ proveFeatureRules: undefined }), models);
		expect(await prove.execute('p1', 'feat-cart', 'rules')).toMatchObject({ solver: 'unavailable' });
	});

	it('answers nothing for a feature the project does not hold, an engine that is down, or one that offers no proof', async () => {
		expect(await new ProveFeatureRulesUseCase(solver(), models).execute('p2', 'feat-cart', 'rules')).toBeNull();
		expect(await new ProveFeatureRulesUseCase(solver({ available: false }), models).execute('p1', 'feat-cart', 'rules')).toBeNull();
		const mute = solver({ proveFeatureRules: undefined, getSpecGapsAndProof: undefined });
		expect(await new ProveFeatureRulesUseCase(mute, models).execute('p1', 'feat-cart', 'statements')).toBeNull();
	});

	it('answers nothing when the feature cannot be read', async () => {
		const unreadable = { loadFeature: async () => Promise.reject(new Error('disk')) } satisfies Pick<BehaviorRepositoryPort, 'loadFeature'>;
		expect(await new ProveFeatureRulesUseCase(solver(), unreadable).execute('p1', 'feat-cart', 'rules')).toBeNull();
	});
});
