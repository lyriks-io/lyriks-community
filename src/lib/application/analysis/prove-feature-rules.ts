import type { SpecLanguage } from '$domain/language';
import type { BehaviorRepositoryPort, SpecProof, UnspaghettitAdvisorPort } from '../ports';
import { featureRuleVerdicts, type FeatureRuleVerdicts } from './rule-verdicts';

/** The path search of a large feature takes long; past this its statements read not settled. */
const STATEMENTS_BUDGET_MS = 120_000;

export type RuleProofPart = 'rules' | 'statements';

/**
 * What the solver says about one feature, for the Rules tab, in two parts: the
 * rules from the rule checks alone (seconds), the statements from the path
 * search (up to a minute on a large feature), so the rules never wait for the
 * statements. Null when the feature is not the project's or the engine did
 * not answer.
 */
export class ProveFeatureRulesUseCase {
	constructor(
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'available' | 'getSpecGapsAndProof' | 'proveFeatureRules'>,
		private readonly models: Pick<BehaviorRepositoryPort, 'loadFeature'>,
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
	) {}

	async execute(projectId: string, featureId: string, part: RuleProofPart): Promise<FeatureRuleVerdicts | null> {
		const snapshot = await this.models.loadFeature(projectId, featureId).catch(() => null);
		if (!snapshot || !this.advisor.available) return null;
		const lang = (await this.languageOf?.(projectId).catch(() => undefined)) ?? 'en';
		const proof = await this.#prove(featureId, part, lang);
		return proof === undefined ? null : featureRuleVerdicts(featureId, snapshot, proof, lang, part);
	}

	/**
	 * Prove a feature's rules ahead of the tab, after a change to its behaviour:
	 * the engine keeps the proof by content, so the tab then reads it at once.
	 */
	async warm(projectId: string, featureId: string): Promise<void> {
		if (!this.advisor.available || !this.advisor.proveFeatureRules) return;
		const lang = (await this.languageOf?.(projectId).catch(() => undefined)) ?? 'en';
		await this.advisor.proveFeatureRules(featureId, undefined, lang);
	}

	/** The proof the part asks for; undefined when the engine offers no way to ask it. */
	async #prove(featureId: string, part: RuleProofPart, lang: SpecLanguage): Promise<SpecProof | null | undefined> {
		if (part === 'rules' && this.advisor.proveFeatureRules) {
			return this.advisor.proveFeatureRules(featureId, undefined, lang);
		}
		if (!this.advisor.getSpecGapsAndProof) return undefined;
		return (await this.advisor.getSpecGapsAndProof(featureId, { timeoutMs: STATEMENTS_BUDGET_MS }, lang)).proof;
	}
}
