import { dataRulePagePath, type DataRulesSetup } from '$domain/data';
import type { SpecLanguage } from '$domain/language';
import type { DataDraftRepositoryPort, EngineAnswer, UnspaghettitAdvisorPort } from '../ports';

export type OracleAnswer =
	| { readonly kind: 'answer'; readonly value: Readonly<Record<string, unknown>> }
	| { readonly kind: 'refused'; readonly error: string };

/**
 * The oracle's two questions about the rules that span a project, the data
 * model's among them: what each rule's verdict is, and what a change to them
 * would do. The engine answers; this adds the spec's language and, on every
 * rule, the link a person opens: the data model's own rule for a rule Lyriks
 * generated from it, the Rules tab for one a person wrote.
 */
export class ProjectRulesOracleUseCase {
	constructor(
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'proveProjectRules' | 'whatIfProject'>,
		private readonly drafts: DataDraftRepositoryPort,
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
	) {}

	async prove(projectId: string, opts: { invariantIds?: readonly string[]; maxSteps?: number; quick?: boolean } = {}): Promise<OracleAnswer | null> {
		if (!this.advisor.proveProjectRules) return null;
		const language = (await this.languageOf?.(projectId)) ?? 'en';
		const answer = await this.advisor.proveProjectRules({ projectId, ...opts, language });
		return this.#linked(projectId, answer);
	}

	async whatIf(
		projectId: string,
		operations: readonly Record<string, unknown>[],
		maxSteps?: number
	): Promise<OracleAnswer | null> {
		if (!this.advisor.whatIfProject) return null;
		const language = (await this.languageOf?.(projectId)) ?? 'en';
		const answer = await this.advisor.whatIfProject({ projectId, operations, ...(maxSteps ? { maxSteps } : {}), language });
		return this.#linked(projectId, answer);
	}

	async #linked(projectId: string, answer: EngineAnswer | null): Promise<OracleAnswer | null> {
		if (!answer) return null;
		if (answer.kind === 'refused') return answer;
		if (answer.value.ok === false) {
			const errors = Array.isArray(answer.value.errors) ? answer.value.errors.map(String) : [];
			return { kind: 'refused', error: errors.join('; ') || 'The change does not validate.' };
		}
		const generated: DataRulesSetup['generated'] = (await this.drafts.load(projectId))?.rules?.generated ?? {};
		const hrefOf = (invariantId: string) => {
			const origin = generated[invariantId];
			return origin
				? dataRulePagePath(projectId, `${origin.kind}:${origin.fieldId}`)
				: `/projects/${encodeURIComponent(projectId)}/features?tab=rules`;
		};
		const rules = Array.isArray(answer.value.rules)
			? (answer.value.rules as Record<string, unknown>[]).map((rule) => ({
					...rule,
					href: hrefOf(String(rule.invariantId)),
					fromDataModel: String(rule.invariantId) in generated
				}))
			: undefined;
		return { kind: 'answer', value: { ...answer.value, ...(rules ? { rules } : {}) } };
	}
}
