import {
	AUTH_MECHANISMS,
	CERTIFICATIONS,
	ENCRYPTION_SCOPES,
	canonicalConstraintTheme,
	createConstraint,
	createEmptyDefinitionDraft,
	createIntegration,
	createPainPointLink,
	createPerformanceTarget,
	createRetentionRule,
	createSla,
	DEFINITION_SOURCE_SECTIONS,
	definitionCanAdvance,
	missingDefinitionRequirements,
	computeDefinitionCoherence,
	type ApiKind,
	type AuditLogLevel,
	type AuthMechanism,
	type AuthorizationModel,
	type CertificationCode,
	type EncryptionScope,
	type DefinitionSourceSection,
	type IntegrationEntry,
	type PerformanceTarget,
	type FoundationDefinitionDraft,
	type RequirementQuestion,
	type RequirementsTab,
	type RetentionRule,
	type SlaEntry,
	withSecurityAnswer
} from '$domain/foundation';
import type { CoherenceResult, CustomerSizeCode } from '$domain/foundation';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { toggleCitation } from '$domain/documents';
import { specLanguageAccessor } from '$ui/language/spec-language-context';

export type { SaveStatus };

/**
 * Client-side orchestrator for the Business / Market / Technical / Security
 * tabs of Foundation. Each mutator goes through `#touch` so the auth guard +
 * autosave debounce of feature `6b9ffe58` is honored uniformly. Mirror of the
 * Brief tab's `IdentityStore`. Saves land on the definition slice route under
 * the one public `foundation` section.
 *
 * Tab state is local-only: not persisted, not part of the draft — the active
 * tab is a UI-only state definition in the spec, equivalent to the `$state` here.
 */
/** Human label of a catalog option, falling back to its code. */
const labelOf = (
	catalog: ReadonlyArray<{ readonly code: string; readonly label: string }>,
	code: string
): string => catalog.find((o) => o.code === code)?.label ?? code;

export class DefinitionStore {
	draft = $state<FoundationDefinitionDraft>(null as unknown as FoundationDefinitionDraft);
	requirementsTab = $state<RequirementsTab>('business');

	/** The spec's language, from the project it is opened in: its checks read in it. */
	readonly #lang = specLanguageAccessor();
	coherence = $derived.by<CoherenceResult>(() => computeDefinitionCoherence(this.draft, this.#lang()));
	canAdvance = $derived.by<boolean>(() => definitionCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingDefinitionRequirements(this.draft, this.#lang()));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<FoundationDefinitionDraft>;

	constructor(
		initial: FoundationDefinitionDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/foundation/definition',
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

	hydrate = (incoming: FoundationDefinitionDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	switchRequirementsTab = (tab: RequirementsTab) => {
		this.requirementsTab = tab;
	};

	/* ───────────────────── SECTION 1 · BUSINESS OBJECTIVE ────────────────── */
	setMainProblem = (v: string) => {
		this.draft.businessObjective.mainProblem = v;
		this.#touch('definition.businessObjective.mainProblem');
	};
	addPainPoint = (t: string) => {
		this.draft.businessObjective.painPoints.push(t);
		this.#touch('definition.businessObjective.painPoints');
	};
	removePainPoint = (i: number) => {
		this.draft.businessObjective.painPoints.splice(i, 1);
		this.#touch('definition.businessObjective.painPoints');
	};
	addPersona = (t: string) => {
		this.draft.businessObjective.affectedPersonas.push(t);
		this.#touch('definition.businessObjective.affectedPersonas');
	};
	removePersona = (i: number) => {
		this.draft.businessObjective.affectedPersonas.splice(i, 1);
		this.#touch('definition.businessObjective.affectedPersonas');
	};

	/* Pain points, each linked to the Users & Permissions roles they hurt. */
	addPainPointLink = (text = '') => {
		this.draft.businessObjective.painPointLinks.push(createPainPointLink(text));
		this.#touch('definition.businessObjective.painPointLinks');
	};
	removePainPointLink = (id: string) => {
		const links = this.draft.businessObjective.painPointLinks;
		const i = links.findIndex((l) => l.id === id);
		if (i < 0) return;
		links.splice(i, 1);
		this.#touch('definition.businessObjective.painPointLinks');
	};
	setPainPointText = (id: string, text: string) => {
		const link = this.draft.businessObjective.painPointLinks.find((l) => l.id === id);
		if (!link) return;
		link.text = text;
		this.#touch('definition.businessObjective.painPointLinks');
	};
	/** Attach or detach a role from a pain point (no-op if the pain point is gone). */
	togglePainPointRole = (id: string, roleId: string) => {
		const link = this.draft.businessObjective.painPointLinks.find((l) => l.id === id);
		if (!link) return;
		const i = link.roleIds.indexOf(roleId);
		if (i >= 0) link.roleIds.splice(i, 1);
		else link.roleIds.push(roleId);
		this.#touch('definition.businessObjective.painPointLinks');
	};
	/** Ensure a role id is attached (used right after creating a shared role). */
	attachPainPointRole = (id: string, roleId: string) => {
		const link = this.draft.businessObjective.painPointLinks.find((l) => l.id === id);
		if (!link || link.roleIds.includes(roleId)) return;
		link.roleIds.push(roleId);
		this.#touch('definition.businessObjective.painPointLinks');
	};
	setExpectedOutcome = (v: string) => {
		this.draft.businessObjective.expectedOutcome = v;
		this.#touch('definition.businessObjective.expectedOutcome');
	};
	addSuccessCriterion = (t: string) => {
		this.draft.businessObjective.successCriteria.push(t);
		this.#touch('definition.businessObjective.successCriteria');
	};
	removeSuccessCriterion = (i: number) => {
		this.draft.businessObjective.successCriteria.splice(i, 1);
		this.#touch('definition.businessObjective.successCriteria');
	};
	addFailureCriterion = (t: string) => {
		this.draft.businessObjective.failureCriteria.push(t);
		this.#touch('definition.businessObjective.failureCriteria');
	};
	removeFailureCriterion = (i: number) => {
		this.draft.businessObjective.failureCriteria.splice(i, 1);
		this.#touch('definition.businessObjective.failureCriteria');
	};

	/* ───────────────────────── SECTION 2 · MARKET ───────────────────────── */
	setMarketType = (code: string) => {
		this.draft.market.marketType = code;
		this.#touch('definition.market.marketType');
	};
	toggleCustomerSize = (code: CustomerSizeCode) => {
		this.#toggleIn(this.draft.market.customerSize, code);
		this.#touch('definition.market.customerSize');
	};
	toggleSector = (sector: string) => {
		this.#toggleIn(this.draft.market.industrySectors, sector);
		this.#touch('definition.market.industrySectors');
	};
	toggleLanguage = (code: string) => {
		this.#toggleIn(this.draft.market.languages, code);
		this.#touch('definition.market.languages');
	};
	toggleRegulation = (code: string) => {
		this.#toggleIn(this.draft.market.regulations, code);
		this.#touch('definition.market.regulations');
	};
	/* MultiSelect set-variants (mockup parity) */
	setLanguages = (codes: string[]) => {
		this.draft.market.languages = codes;
		this.#touch('definition.market.languages');
	};
	setRegulations = (codes: string[]) => {
		this.draft.market.regulations = codes;
		this.#touch('definition.market.regulations');
	};

	/* ──────────────────────── SECTION 3 · COMPETITION ────────────────────── */

	#toggleIn<T>(list: T[], value: T) {
		const i = list.indexOf(value);
		if (i >= 0) list.splice(i, 1);
		else list.push(value);
	}

	/* ─────────────────── SECTION 4 · REQUIREMENTS · BUSINESS RULES ───────── */
	/* A · Commitments */
	addObjective = (text: string) => {
		this.draft.business.objectives.push(text);
		this.#touch('definition.business.objectives');
	};
	removeObjective = (i: number) => {
		this.draft.business.objectives.splice(i, 1);
		this.#touch('definition.business.objectives');
	};

	addRisk = (text: string) => {
		this.draft.business.risks.push(text);
		this.#touch('definition.business.risks');
	};
	removeRisk = (i: number) => {
		this.draft.business.risks.splice(i, 1);
		this.#touch('definition.business.risks');
	};

	setContractAttachment = (ref: string) => {
		this.draft.business.contractAttachment = ref;
		this.#touch('definition.business.contractAttachment');
	};
	clearContractAttachment = () => {
		this.draft.business.contractAttachment = null;
		this.#touch('definition.business.contractAttachment');
	};

	addSla = () => {
		this.draft.business.slas.push(createSla());
		this.#touch('definition.business.slas');
	};
	updateSla = <K extends keyof SlaEntry>(i: number, field: K, value: SlaEntry[K]) => {
		const row = this.draft.business.slas[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.business.slas');
	};
	removeSla = (i: number) => {
		this.draft.business.slas.splice(i, 1);
		this.#touch('definition.business.slas');
	};

	/** One sentence per chip toggle, naming the option and the direction. */
	#notifyToggle = (label: string, added: boolean, list: string) => {
		this.notifier.notify('info', `${label} ${added ? 'added to' : 'removed from'} the ${list}.`);
	};

	/* ─────────────────────────── TECHNICAL TAB ──────────────────────────── */
	toggleCompatibility = (code: string) => {
		const arr = this.draft.technical.compatibilities;
		const i = arr.indexOf(code);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(code);
		this.#touch('definition.technical.compatibilities');
		this.#notifyToggle(code, i < 0, 'compatibilities');
	};
	/* MultiSelect set-variants (mockup parity) */
	setCompatibilities = (codes: string[]) => {
		this.draft.technical.compatibilities = codes;
		this.#touch('definition.technical.compatibilities');
	};
	setApisExpose = (kinds: string[]) => {
		this.draft.technical.apisExpose = kinds as ApiKind[];
		this.#touch('definition.technical.apisExpose');
	};
	setApisConsume = (kinds: string[]) => {
		this.draft.technical.apisConsume = kinds as ApiKind[];
		this.#touch('definition.technical.apisConsume');
	};

	addIntegration = () => {
		this.draft.technical.integrations.push(createIntegration());
		this.#touch('definition.technical.integrations');
	};
	updateIntegration = <K extends keyof IntegrationEntry>(
		i: number,
		field: K,
		value: IntegrationEntry[K]
	) => {
		const row = this.draft.technical.integrations[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.technical.integrations');
	};
	removeIntegration = (i: number) => {
		this.draft.technical.integrations.splice(i, 1);
		this.#touch('definition.technical.integrations');
	};

	toggleApiExpose = (kind: ApiKind) => {
		const arr = this.draft.technical.apisExpose;
		const i = arr.indexOf(kind);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(kind);
		this.#touch('definition.technical.apisExpose');
	};
	toggleApiConsume = (kind: ApiKind) => {
		const arr = this.draft.technical.apisConsume;
		const i = arr.indexOf(kind);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(kind);
		this.#touch('definition.technical.apisConsume');
	};

	addPerformanceTarget = () => {
		this.draft.technical.performance.push(createPerformanceTarget());
		this.#touch('definition.technical.performance');
	};
	updatePerformanceTarget = <K extends keyof PerformanceTarget>(
		i: number,
		field: K,
		value: PerformanceTarget[K]
	) => {
		const row = this.draft.technical.performance[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.technical.performance');
	};
	removePerformanceTarget = (i: number) => {
		this.draft.technical.performance.splice(i, 1);
		this.#touch('definition.technical.performance');
	};

	setAvailability = (value: string) => {
		this.draft.technical.availability = value;
		this.#touch('definition.technical.availability');
	};

	/* ──────────────────────────── SECURITY TAB ──────────────────────────── */
	toggleAuthentication = (code: AuthMechanism) => {
		const arr = this.draft.security.authentication;
		const i = arr.indexOf(code);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(code);
		this.#touch('definition.security.authentication');
		this.#notifyToggle(labelOf(AUTH_MECHANISMS, code), i < 0, 'authentication mechanisms');
	};
	setAuthentication = (codes: string[]) => {
		this.draft.security.authentication = codes as AuthMechanism[];
		this.#touch('definition.security.authentication');
	};
	setAuthorization = (value: AuthorizationModel) => {
		this.draft.security = withSecurityAnswer({ ...this.draft.security, authorization: value }, 'authorization');
		this.#touch('definition.security.authorization');
	};
	toggleEncryption = (scope: EncryptionScope) => {
		const arr = this.draft.security.encryption;
		const i = arr.indexOf(scope);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(scope);
		this.#touch('definition.security.encryption');
		this.#notifyToggle(labelOf(ENCRYPTION_SCOPES, scope), i < 0, 'encryption scopes');
	};
	setEncryption = (scopes: string[]) => {
		this.draft.security.encryption = scopes as EncryptionScope[];
		this.#touch('definition.security.encryption');
	};
	setAuditLogs = (level: AuditLogLevel) => {
		this.draft.security = withSecurityAnswer({ ...this.draft.security, auditLogs: level }, 'auditLogs');
		this.#touch('definition.security.auditLogs');
	};
	toggleCertification = (code: CertificationCode) => {
		const arr = this.draft.security.expectedCertifications;
		const i = arr.indexOf(code);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(code);
		this.#touch('definition.security.expectedCertifications');
		this.#notifyToggle(labelOf(CERTIFICATIONS, code), i < 0, 'expected certifications');
	};
	setCertifications = (codes: string[]) => {
		this.draft.security.expectedCertifications = codes as CertificationCode[];
		this.#touch('definition.security.expectedCertifications');
	};

	addRetentionRule = () => {
		this.draft.security.dataRetention.push(createRetentionRule());
		this.#touch('definition.security.dataRetention');
	};
	updateRetentionRule = <K extends keyof RetentionRule>(
		i: number,
		field: K,
		value: RetentionRule[K]
	) => {
		const row = this.draft.security.dataRetention[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.security.dataRetention');
	};
	removeRetentionRule = (i: number) => {
		this.draft.security.dataRetention.splice(i, 1);
		this.#touch('definition.security.dataRetention');
	};

	/* ──────────────────────────── CONSTRAINTS ─────────────────────────── */
	/** A typed theme reuses the offered theme it matches (case aside), or becomes a new one. */
	addConstraint = (theme: string, description: string) => {
		const items = this.draft.constraints.items;
		items.push(createConstraint(canonicalConstraintTheme(theme, items), description.trim()));
		this.#touch('definition.constraints.items');
	};
	updateConstraint = (id: string, patch: { theme?: string; description?: string }) => {
		const items = this.draft.constraints.items;
		const i = items.findIndex((c) => c.id === id);
		if (i < 0) return;
		const others = items.filter((c) => c.id !== id);
		items[i] = {
			...items[i],
			...(patch.theme !== undefined ? { theme: canonicalConstraintTheme(patch.theme, others) } : {}),
			...(patch.description !== undefined ? { description: patch.description } : {})
		};
		this.#touch('definition.constraints.items');
	};
	toggleQuestionSource = (question: RequirementQuestion, sourceId: string) => {
		const sources = this.draft.constraints.questionSources;
		sources[question] = toggleCitation(sources[question], sourceId);
		this.#touch(`definition.constraints.questionSources.${question}`);
	};
	removeConstraint = (id: string) => {
		const items = this.draft.constraints.items;
		const i = items.findIndex((c) => c.id === id);
		if (i < 0) return;
		items.splice(i, 1);
		this.#touch('definition.constraints.items');
	};

	/* ────────────────────────────── SOURCES ─────────────────────────────── */
	/**
	 * Cite (or un-cite) a row of the project Documents & Sources register on one
	 * definition section. The definition slice is where market size, regulations
	 * and SLA claims are asserted — each section carries the evidence behind its
	 * own claims.
	 */
	toggleSectionSource = (section: DefinitionSourceSection, sourceId: string) => {
		const slice = this.draft[section];
		slice.sourceIds = toggleCitation(slice.sourceIds, sourceId);
		this.#touch(`definition.${section}.sourceIds`);
	};

	/* ─────────────────────────────── RESET ──────────────────────────────── */
	reset = () => {
		// Straight from the domain factory: one shape of "empty definition", so a
		// new section slice can never be reset to a stale shape.
		const empty = createEmptyDefinitionDraft(this.draft.projectId);
		for (const section of DEFINITION_SOURCE_SECTIONS) {
			(this.draft[section] as FoundationDefinitionDraft[DefinitionSourceSection]) = empty[section];
		}
		this.#touch('definition.reset');
	};
}
