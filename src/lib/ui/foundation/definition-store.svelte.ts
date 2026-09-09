import {
	AUTH_MECHANISMS,
	CERTIFICATIONS,
	ENCRYPTION_SCOPES,
	createBusinessCustom,
	createEmptyDefinitionDraft,
	createCompetitor,
	createIntegration,
	createKpi,
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
	type BusinessCustomReq,
	type CertificationCode,
	type EncryptionScope,
	type DefinitionSourceSection,
	type IntegrationEntry,
	type KpiEntry,
	type PerformanceTarget,
	type FoundationDefinitionDraft,
	type RequirementsTab,
	type RetentionRule,
	type SlaEntry
} from '$domain/foundation';
import type { CoherenceResult, CustomerSizeCode } from '$domain/foundation';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { toggleCitation } from '$domain/documents';

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

	coherence = $derived.by<CoherenceResult>(() => computeDefinitionCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => definitionCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingDefinitionRequirements(this.draft));

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
	addKpi = () => {
		this.draft.businessObjective.kpis.push(createKpi());
		this.#touch('definition.businessObjective.kpis');
	};
	updateKpi = <K extends keyof KpiEntry>(i: number, field: K, value: KpiEntry[K]) => {
		const row = this.draft.businessObjective.kpis[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.businessObjective.kpis');
	};
	removeKpi = (i: number) => {
		this.draft.businessObjective.kpis.splice(i, 1);
		this.#touch('definition.businessObjective.kpis');
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
	setCustomerSizes = (codes: string[]) => {
		this.draft.market.customerSize = codes as CustomerSizeCode[];
		this.#touch('definition.market.customerSize');
	};
	setSectors = (sectors: string[]) => {
		this.draft.market.industrySectors = sectors;
		this.#touch('definition.market.industrySectors');
	};
	setLanguages = (codes: string[]) => {
		this.draft.market.languages = codes;
		this.#touch('definition.market.languages');
	};
	setRegulations = (codes: string[]) => {
		this.draft.market.regulations = codes;
		this.#touch('definition.market.regulations');
	};

	/* ──────────────────────── SECTION 3 · COMPETITION ────────────────────── */
	addCompetitor = (name: string) => {
		this.draft.competition.directCompetitors.push(createCompetitor(name));
		this.#touch('definition.competition.directCompetitors');
	};
	removeCompetitor = (i: number) => {
		this.draft.competition.directCompetitors.splice(i, 1);
		this.#touch('definition.competition.directCompetitors');
	};
	setCompetitorName = (ci: number, name: string) => {
		const competitor = this.draft.competition.directCompetitors[ci];
		if (!competitor) return;
		competitor.name = name;
		this.#touch('definition.competition.directCompetitors');
	};
	addCompetitorStrength = (ci: number, t: string) => {
		this.draft.competition.directCompetitors[ci]?.strengths.push(t);
		this.#touch('definition.competition.directCompetitors');
	};
	removeCompetitorStrength = (ci: number, si: number) => {
		this.draft.competition.directCompetitors[ci]?.strengths.splice(si, 1);
		this.#touch('definition.competition.directCompetitors');
	};
	addCompetitorWeakness = (ci: number, t: string) => {
		this.draft.competition.directCompetitors[ci]?.weaknesses.push(t);
		this.#touch('definition.competition.directCompetitors');
	};
	removeCompetitorWeakness = (ci: number, wi: number) => {
		this.draft.competition.directCompetitors[ci]?.weaknesses.splice(wi, 1);
		this.#touch('definition.competition.directCompetitors');
	};
	addIndirectCompetitor = (t: string) => {
		this.draft.competition.indirectCompetitors.push(t);
		this.#touch('definition.competition.indirectCompetitors');
	};
	removeIndirectCompetitor = (i: number) => {
		this.draft.competition.indirectCompetitors.splice(i, 1);
		this.#touch('definition.competition.indirectCompetitors');
	};
	setBusinessModels = (models: string[]) => {
		this.draft.competition.businessModels = models;
		this.#touch('definition.competition.businessModels');
	};
	addDifferentiator = (t: string) => {
		this.draft.competition.differentiators.push(t);
		this.#touch('definition.competition.differentiators');
	};
	removeDifferentiator = (i: number) => {
		this.draft.competition.differentiators.splice(i, 1);
		this.#touch('definition.competition.differentiators');
	};
	moveDifferentiator = (i: number, dir: -1 | 1) => {
		const list = this.draft.competition.differentiators;
		const j = i + dir;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j], list[i]];
		this.#touch('definition.competition.differentiators');
	};
	setClaimedCategory = (v: string) => {
		this.draft.competition.claimedCategory = v;
		this.#touch('definition.competition.claimedCategory');
	};
	setPositioning = (v: string) => {
		this.draft.competition.positioning = v;
		this.#touch('definition.competition.positioning');
	};
	setCompetitiveMoat = (v: string) => {
		this.draft.competition.competitiveMoat = v;
		this.#touch('definition.competition.competitiveMoat');
	};

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

	addContractualConstraint = (text: string) => {
		this.draft.business.contractualConstraints.push(text);
		this.#touch('definition.business.contractualConstraints');
	};
	removeContractualConstraint = (i: number) => {
		this.draft.business.contractualConstraints.splice(i, 1);
		this.#touch('definition.business.contractualConstraints');
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

	/* D · Documents & custom */
	addCustom = () => {
		this.draft.business.custom.push(createBusinessCustom());
		this.#touch('definition.business.custom');
	};
	updateCustom = <K extends keyof BusinessCustomReq>(
		i: number,
		field: K,
		value: BusinessCustomReq[K]
	) => {
		const row = this.draft.business.custom[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.business.custom');
	};
	removeCustom = (i: number) => {
		this.draft.business.custom.splice(i, 1);
		this.#touch('definition.business.custom');
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
	/* Custom technical requirements (mockup parity) */
	addTechCustom = () => {
		this.draft.technical.custom.push(createBusinessCustom());
		this.#touch('definition.technical.custom');
	};
	updateTechCustom = <K extends keyof BusinessCustomReq>(
		i: number,
		field: K,
		value: BusinessCustomReq[K]
	) => {
		const row = this.draft.technical.custom[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.technical.custom');
	};
	removeTechCustom = (i: number) => {
		this.draft.technical.custom.splice(i, 1);
		this.#touch('definition.technical.custom');
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
		this.draft.security.authorization = value;
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
		this.draft.security.auditLogs = level;
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
	/* Custom security requirements (mockup parity) */
	addSecCustom = () => {
		this.draft.security.custom.push(createBusinessCustom());
		this.#touch('definition.security.custom');
	};
	updateSecCustom = <K extends keyof BusinessCustomReq>(
		i: number,
		field: K,
		value: BusinessCustomReq[K]
	) => {
		const row = this.draft.security.custom[i];
		if (!row) return;
		row[field] = value;
		this.#touch('definition.security.custom');
	};
	removeSecCustom = (i: number) => {
		this.draft.security.custom.splice(i, 1);
		this.#touch('definition.security.custom');
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
