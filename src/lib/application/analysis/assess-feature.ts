import type {
	FeatureBehavior,
	FeatureDigest,
	FeatureGap,
	FeatureScore,
	ImplementationCoverage,
	ModelCheckReport,
	ScenarioReport,
	SpecGap,
	SpecProof,
	UnspaghettitAdvisorPort,
	VerificationVerdict,
	BehaviorRepositoryPort
} from '../ports';
import {
	verdictWithExploration,
	verificationEvidence,
	type VerificationEvidence
} from '../specification/verification-evidence';
import { explorationPlan, type ExplorationPlan } from './exploration-fallback';
import { DEFAULT_ENGINE_READ_BUDGETS, explorationCap } from '../specification/verify-experience';

/**
 * The full proof asks again the phases the first pass left open, each with a
 * budget of its own (three budgets at most in the engine): tens of seconds.
 */
const COMPLETE_PROOF_TIMEOUT_MS = 90_000;
import { provenFindings, type ProvenFinding } from './proven-findings';
import type { SpecLanguage } from '$domain/language';

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
	/** The language the findings and the gaps are written in, when the project is known. */
	readonly language?: SpecLanguage;
	readonly behavior: FeatureBehavior | null;
	readonly score: FeatureScore | null;
	/** Implementation gaps (spec entities with no code mapping). */
	readonly gaps: FeatureGap[];
	/** Spec-depth gaps (shallow modelling — missing scenarios, stateless surfaces…). */
	readonly specGaps: SpecGap[];
	/**
	 * The solver's answer beside the gaps: whether it ran, what it left
	 * unsettled, the path search outcome per statement, the leads. Null when the
	 * engine sent none.
	 */
	readonly proof: SpecProof | null;
	/** The solver's findings as the requirements they break, blocking ones first. */
	readonly provenFindings: readonly ProvenFinding[];
	/** Every authored scenario run through the deterministic simulator. */
	readonly scenarios: ScenarioReport | null;
	/**
	 * Bounded model check: reachability, dead actions, invariant counterexamples.
	 * Null when the exploration was not needed (see `exploration`).
	 */
	readonly modelCheck: ModelCheckReport | null;
	/** Whether the exploration ran, and why: it runs only where the solver leaves something open. */
	readonly exploration: ExplorationPlan;
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
	readonly evidence: VerificationEvidence;
}

/**
 * Deep, on-demand assessment of a single feature, fetched when its drawer opens
 * (one feature at a time — unlike the bulk `ScoreFeaturesUseCase`, which stays
 * light for the whole tree). All reads round-trip in parallel through the engine.
 */
export class AssessFeatureUseCase {
	constructor(
		private readonly advisor: UnspaghettitAdvisorPort,
		/** Where the feature's model is read to write its findings as requirements. */
		private readonly models?: Pick<BehaviorRepositoryPort, 'loadFeature'>,
		/**
		 * The spec's language, read from its declaration alone (cheap, no prose
		 * read): the findings and the generated scenarios are written in it.
		 */
		private readonly specLanguage?: { generated(projectId: string): Promise<SpecLanguage> }
	) {}

	/** `projectId` lets the solver's findings be written as the requirements they break. */
	/**
	 * The solver's first pass by default, at once; its proof says `moreToCome`
	 * when the full assessment (`complete`), asked next, may settle more.
	 */
	async execute(
		featureId: string,
		projectId?: string,
		options?: { readonly complete?: boolean }
	): Promise<FeatureAssessment> {
		if (!featureId || !this.advisor.available) {
			return {
				featureId,
				available: false,
				behavior: null,
				score: null,
				gaps: [],
				specGaps: [],
				proof: null,
				provenFindings: [],
				scenarios: null,
				modelCheck: null,
				exploration: { run: false, reasons: ['the behavior engine is unavailable'] },
				verdict: null,
				implementation: null,
				digest: null,
				degraded: [],
				evidence: verificationEvidence(null, null)
			};
		}
		// The language is read beside the engine calls, and the gaps wait for it
		// alone: the engine writes them in it.
		const language =
			projectId && this.specLanguage
				? this.specLanguage.generated(projectId).catch(() => undefined)
				: Promise.resolve(undefined);
		const [lang, behavior, score, gaps, spec, scenarios, verdict, implementation, digest] =
			await Promise.all([
				language,
				this.advisor.getFeatureBehavior(featureId),
				this.advisor.scoreFeature(featureId),
				this.advisor.findFeatureGaps(featureId),
				language.then((l) => this.#specGapsAndProof(featureId, l, options?.complete === true)),
				this.advisor.runScenarios(featureId),
				this.advisor.verify(featureId),
				this.advisor.getImplementationCoverage(featureId),
				this.advisor.getDigest(featureId)
			]);
		const model =
			projectId && this.models && spec.proof?.findings?.length
				? await this.models.loadFeature(projectId, featureId).catch(() => null)
				: null;
		// The exploration keeps only what the solver leaves open, and never on a
		// first pass the full proof is about to complete: those questions are the
		// solver's to settle, and exploring them first holds up the whole reading.
		const exploration = spec.proof?.moreToCome
			? { run: false, reasons: ['the solver is still settling what its first pass left open'] }
			: explorationPlan(spec.proof);
		// Bounded like the Control Center's: an exploration past its budget drops
		// the engine subprocess and every read beside it.
		const cap = explorationCap(behavior?.actions?.length ?? 0, DEFAULT_ENGINE_READ_BUDGETS.explorationWork);
		const modelCheck = exploration.run
			? await this.advisor.modelCheck(featureId, {
					...(cap === null ? {} : { maxStates: cap }),
					timeoutMs: DEFAULT_ENGINE_READ_BUDGETS.explorationMs
				})
			: null;
		const readings: MutableReadings = {
			behavior,
			score,
			scenarios,
			modelCheck,
			verdict,
			digest
		};
		// The exploration is never asked again: skipped, it is a decision; run, it
		// ran alone after the other reads, so it was lost to its own budget and
		// asking again only spends that budget a second time.
		await this.#recoverLostReads(featureId, readings, ['modelCheck']);
		return {
			featureId,
			available: true,
			...(lang ? { language: lang } : {}),
			behavior: readings.behavior,
			score: readings.score,
			gaps,
			specGaps: spec.gaps,
			proof: spec.proof,
			provenFindings: provenFindings(model?.feature ?? null, spec.proof, lang),
			scenarios: readings.scenarios,
			modelCheck: readings.modelCheck,
			exploration,
			verdict: verdictWithExploration(readings.verdict, readings.modelCheck, spec.proof),
			implementation,
			digest: readings.digest,
			degraded: resolved(readings)
				? lost(readings).filter((key) => exploration.run || key !== 'modelCheck')
				: [],
			evidence: verificationEvidence(
				readings.scenarios,
				readings.modelCheck,
				exploration.run ? null : spec.proof
			)
		};
	}

	/** One engine read for the gaps and the proof, or the gaps alone from an adapter without it. */
	async #specGapsAndProof(
		featureId: string,
		language?: SpecLanguage,
		complete = false
	): Promise<{ readonly gaps: SpecGap[]; readonly proof: SpecProof | null }> {
		if (this.advisor.getSpecGapsAndProof) {
			return complete
				? this.advisor.getSpecGapsAndProof(featureId, { timeoutMs: COMPLETE_PROOF_TIMEOUT_MS }, language, { complete })
				: this.advisor.getSpecGapsAndProof(featureId, undefined, language);
		}
		return { gaps: await this.advisor.getSpecGaps(featureId), proof: null };
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
	async #recoverLostReads(
		featureId: string,
		readings: MutableReadings,
		skipped: readonly ReadKey[]
	): Promise<void> {
		if (!resolved(readings)) return; // nothing resolved: an absent feature, not a lost call
		for (const key of lost(readings).filter((key) => !skipped.includes(key))) {
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
