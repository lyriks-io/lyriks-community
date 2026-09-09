import {
	identityCanAdvance,
	computeIdentityCoherence,
	createDefaultRuleFamilyDefaults,
	missingIdentityRequirements,
	ALL_RULE_PATTERN_CODES,
	type CoherenceResult,
	type FeatureExpressionModeCode,
	type FormFactorCode,
	type FoundationIdentityDraft,
	type ProjectModeCode,
	type RuleFamilyCode,
	type RulePatternCode,
	type SectionId,
	type SourceModeCode
} from '$domain/foundation';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Client orchestrator for the Foundation identity slice: project identity,
 * brief, form factors and authoring method. Business, market and competition
 * mutations live exclusively in `DefinitionStore`.
 */
export class IdentityStore {
	draft = $state<FoundationIdentityDraft>(null as unknown as FoundationIdentityDraft);

	coherence = $derived.by<CoherenceResult>(() => computeIdentityCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => identityCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingIdentityRequirements(this.draft));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<FoundationIdentityDraft>;

	constructor(
		initial: FoundationIdentityDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/foundation/identity',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
	}

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	set lastError(value: string | null) {
		this.#autosave.lastError = value;
	}

	hydrate = (incoming: FoundationIdentityDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_section: SectionId, _path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	setProductName = (value: string) => {
		this.draft.productName = value;
		this.#touch('identity', 'identity.productName');
	};

	setIndustry = (value: string) => {
		this.draft.industry = value;
		this.#touch('identity', 'identity.industry');
	};

	setProductType = (value: string) => {
		this.draft.productType = value;
		this.#touch('identity', 'identity.productType');
	};

	setBrief = (value: string) => {
		this.draft.brief = value;
		this.#touch('brief', 'identity.brief');
	};

	isFormFactor = (code: FormFactorCode) => this.draft.formFactors.includes(code);

	toggleFormFactor = (code: FormFactorCode) => {
		this.#toggleIn(this.draft.formFactors, code);
		this.#touch('form_factor', 'identity.formFactors');
	};

	setFeatureExpressionMode = (value: string) => {
		this.draft.featureExpressionMode = value as FeatureExpressionModeCode;
		this.#touch('methodology', 'identity.featureExpressionMode');
	};

	setStructuredRuleFormat = (value: string) => {
		this.draft.structuredRuleFormat = value as RulePatternCode;
		this.#touch('methodology', 'identity.structuredRuleFormat');
	};

	setSourceMode = (value: string) => {
		this.draft.sourceMode = value as SourceModeCode;
		this.#touch('origin', 'identity.sourceMode');
	};

	isPatternActivated = (code: RulePatternCode) => this.draft.activatedPatterns.includes(code);

	toggleActivatedPattern = (code: RulePatternCode) => {
		this.#toggleIn(this.draft.activatedPatterns, code);
		this.#touch('workspace', 'identity.activatedPatterns');
	};

	setFamilyDefault = (family: RuleFamilyCode, pattern: RulePatternCode) => {
		this.draft.ruleFamilyDefaults[family] = pattern;
		this.#touch('workspace', 'identity.ruleFamilyDefaults');
	};

	setProjectMode = (value: string) => {
		this.draft.projectMode = value as ProjectModeCode;
		this.#touch('mode', 'identity.projectMode');
	};

	reset = () => {
		const projectId = this.draft.projectId;
		this.draft.productName = '';
		this.draft.brief = '';
		this.draft.formFactors = [];
		this.draft.industry = 'saas';
		this.draft.productType = 'production_product';
		this.draft.featureExpressionMode = 'user_story';
		this.draft.structuredRuleFormat = 'gherkin';
		this.draft.sourceMode = 'greenfield';
		this.draft.activatedPatterns = [...ALL_RULE_PATTERN_CODES];
		this.draft.ruleFamilyDefaults = createDefaultRuleFamilyDefaults();
		this.draft.projectMode = 'solo';
		this.draft.projectId = projectId;
		this.#touch('runtime', 'identity.reset');
	};

	#toggleIn<T>(list: T[], value: T) {
		const index = list.indexOf(value);
		if (index >= 0) list.splice(index, 1);
		else list.push(value);
	}
}
