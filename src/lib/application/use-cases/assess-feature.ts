import type {
	FeatureBehavior,
	FeatureDigest,
	FeatureGap,
	FeatureScore,
	ImplementationCoverage,
	ModelCheckReport,
	ScenarioReport,
	SpecGap,
	UnspaghettitAdvisorPort,
	VerificationVerdict
} from '../ports';

/**
 * The full Unspaghettit readout for ONE leaf feature — what the engine knows
 * about it now that Step 04/05/07 project its surfaces, actions, states,
 * transitions, scenarios, personas and entities into the workspace. This is the
 * authoritative behavior view the leaf drawer renders: named behavior, maturity,
 * executable-scenario results, model-check reachability, and the gated verdict.
 *
 * Every field degrades to null / empty when the engine is unreachable, so the
 * drawer stays usable offline (it just shows the "authored in Unspa" fallback).
 */
export interface FeatureAssessment {
	readonly featureId: string;
	readonly available: boolean;
	readonly behavior: FeatureBehavior | null;
	readonly score: FeatureScore | null;
	/** Implementation gaps (spec entities with no code mapping). */
	readonly gaps: FeatureGap[];
	/** Spec-depth gaps (shallow modelling — missing scenarios, stateless surfaces…). */
	readonly specGaps: SpecGap[];
	/** Every authored scenario run through the deterministic simulator. */
	readonly scenarios: ScenarioReport | null;
	/** Bounded model check: reachability, dead actions, invariant counterexamples. */
	readonly modelCheck: ModelCheckReport | null;
	/** The gated verify verdict (the in-chat form of `unspa check`). */
	readonly verdict: VerificationVerdict | null;
	/** Implementation coverage tally (spec entities mapped to code). */
	readonly implementation: ImplementationCoverage | null;
	/** The dashboard's plain-language behavior digest (model-derived markdown). */
	readonly digest: FeatureDigest | null;
	/**
	 * Reads the engine owed an answer for and could not give, by name. Empty
	 * when nothing was lost, which is the normal case.
	 *
	 * A read here answers null both for "this feature has no such content" and
	 * for "the call died", and those two must not be told apart by guessing. So
	 * when other reads resolved the same feature, a null among them is reported
	 * as lost rather than shown as an empty model: a reader who takes a dropped
	 * call for an unauthored feature goes looking for the wrong problem.
	 */
	readonly degraded: readonly string[];
}

/**
 * Deep, on-demand assessment of a single feature, fetched when its drawer opens
 * (one feature at a time — unlike the bulk `ScoreFeaturesUseCase`, which stays
 * light for the whole tree). All reads round-trip in parallel through the engine.
 */
export class AssessFeatureUseCase {
	constructor(private readonly advisor: UnspaghettitAdvisorPort) {}

	async execute(featureId: string): Promise<FeatureAssessment> {
		if (!featureId || !this.advisor.available) {
			return {
				featureId,
				available: false,
				behavior: null,
				score: null,
				gaps: [],
				specGaps: [],
				scenarios: null,
				modelCheck: null,
				verdict: null,
				implementation: null,
				digest: null,
				degraded: []
			};
		}
		const [behavior, score, gaps, specGaps, scenarios, modelCheck, verdict, implementation, digest] =
			await Promise.all([
				this.advisor.getFeatureBehavior(featureId),
				this.advisor.scoreFeature(featureId),
				this.advisor.findFeatureGaps(featureId),
				this.advisor.getSpecGaps(featureId),
				this.advisor.runScenarios(featureId),
				this.advisor.modelCheck(featureId),
				this.advisor.verify(featureId),
				this.advisor.getImplementationCoverage(featureId),
				this.advisor.getDigest(featureId)
			]);
		const readings: MutableReadings = {
			behavior,
			score,
			scenarios,
			modelCheck,
			verdict,
			digest
		};
		await this.#recoverLostReads(featureId, readings);
		return {
			featureId,
			available: true,
			behavior: readings.behavior,
			score: readings.score,
			gaps,
			specGaps,
			scenarios: readings.scenarios,
			modelCheck: readings.modelCheck,
			verdict: readings.verdict,
			implementation,
			digest: readings.digest,
			degraded: resolved(readings) ? lost(readings) : []
		};
	}

	/**
	 * Ask again for the readings that came back empty on a feature the engine
	 * demonstrably holds.
	 *
	 * These nine reads share one single-threaded subprocess, and a call that
	 * exceeds its budget takes that subprocess down so it stops computing: every
	 * call in flight beside it dies too and returns null. The feature is fine,
	 * its model is fine, and the drawer would still have said "no behavior,
	 * no verdict, no digest". Asking again lands on the respawned engine and
	 * gets the real answer.
	 *
	 * Deliberately sequential and once only. The first round already showed what
	 * this connection does under load, so a retry that floods it the same way
	 * would be the same accident twice; and one honest "lost" beats an infinite
	 * wait for a call that will not come back.
	 */
	async #recoverLostReads(featureId: string, readings: MutableReadings): Promise<void> {
		if (!resolved(readings)) return; // nothing resolved: an absent feature, not a lost call
		for (const key of lost(readings)) {
			readings[key] = (await this.#read(key, featureId)) as never;
		}
	}

	#read(key: ReadKey, featureId: string): Promise<unknown> {
		switch (key) {
			case 'behavior':
				return this.advisor.getFeatureBehavior(featureId);
			case 'score':
				return this.advisor.scoreFeature(featureId);
			case 'scenarios':
				return this.advisor.runScenarios(featureId);
			case 'modelCheck':
				return this.advisor.modelCheck(featureId);
			case 'verdict':
				return this.advisor.verify(featureId);
			case 'digest':
				return this.advisor.getDigest(featureId);
		}
	}
}

/**
 * The reads that answer about the model itself, so a null among them is worth
 * questioning. `gaps` and `specGaps` are left out because empty is their normal
 * answer, and `implementation` because null is what an un-adopted feature is.
 */
type ReadKey = 'behavior' | 'score' | 'scenarios' | 'modelCheck' | 'verdict' | 'digest';

interface MutableReadings {
	behavior: FeatureBehavior | null;
	score: FeatureScore | null;
	scenarios: ScenarioReport | null;
	modelCheck: ModelCheckReport | null;
	verdict: VerificationVerdict | null;
	digest: FeatureDigest | null;
}

const READ_KEYS: readonly ReadKey[] = ['behavior', 'score', 'scenarios', 'modelCheck', 'verdict', 'digest'];

/** Did the engine resolve this feature at all? One answer is enough to say yes. */
function resolved(readings: MutableReadings): boolean {
	return READ_KEYS.some((key) => readings[key] !== null);
}

function lost(readings: MutableReadings): ReadKey[] {
	return READ_KEYS.filter((key) => readings[key] === null);
}
