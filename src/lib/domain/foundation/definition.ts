import type { CustomizableCode } from '$domain/shared';
import { createKpi, createCompetitor } from './identity';
import type { CompetitorEntry, KpiEntry } from './identity';
import type { CustomerSizeCode, MarketTypeCode } from './identity-enums';
import type {
	ApiKind,
	AuditLogLevel,
	AuthMechanism,
	AuthorizationModel,
	CertificationCode,
	CriticalityLevel,
	EncryptionScope,
	IntegrationDirection,
	PerformanceUnit,
	RetentionAction
} from './definition-enums';

export type { CompetitorEntry, KpiEntry } from './identity';

/* ── Entities (mirror of Unspaghettit feature 6b9ffe58 entities) ──────── */

export interface SlaEntry {
	readonly metric: string;
	readonly commitment: string;
	readonly penalty: string;
}

/** D · Documents & custom — a free-form supporting business requirement. */
export interface BusinessCustomReq {
	readonly label: string;
	readonly value: string;
}

export interface IntegrationEntry {
	readonly system: string;
	readonly direction: IntegrationDirection;
	readonly criticality: CriticalityLevel;
}

export interface PerformanceTarget {
	readonly action: string;
	readonly target: number;
	readonly unit: PerformanceUnit;
}

export interface RetentionRule {
	readonly dataType: string;
	readonly duration: string;
	readonly actionAfter: RetentionAction;
}

/* ── Section slices ───────────────────────────────────────────────────── */

/**
 * One pain point, linked to the users (Users & Permissions roles) who suffer
 * from it. `roleIds` reference `ProjectUsersDraft.roles[].id`; the link is
 * one-way (Foundation reads Users), so a stale id (role later deleted) simply
 * drops from the rendered chips — never a dangling write.
 */
export interface PainPointLink {
	readonly id: string;
	text: string;
	roleIds: string[];
}

/** Section 1 — why this product exists. Seeded from the identity slice, editable here. */
export interface BusinessObjectiveDefinition {
	mainProblem: string;
	/** Pain points paired with the roles they hurt. Replaces the flat
	    `painPoints`/`affectedPersonas` string lists (kept below only so old
	    drafts migrate without data loss — no longer authored directly). */
	painPointLinks: PainPointLink[];
	/** @deprecated Legacy flat list — migrated into `painPointLinks`. */
	painPoints: string[];
	/** @deprecated Legacy free-text personas — surfaced once as "to re-attach". */
	affectedPersonas: string[];
	expectedOutcome: string;
	kpis: KpiEntry[];
	successCriteria: string[];
	failureCriteria: string[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/** Section 2 — where it plays. Seeded from the identity slice, editable here. */
export interface MarketDefinition {
	marketType: CustomizableCode<MarketTypeCode>;
	customerSize: CustomerSizeCode[];
	industrySectors: string[];
	languages: string[];
	regulations: string[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/** Section 3 — competitive landscape. Seeded from the identity slice, plus definition-only fields. */
export interface CompetitionDefinition {
	directCompetitors: CompetitorEntry[];
	indirectCompetitors: string[];
	businessModels: string[];
	differentiators: string[];
	claimedCategory: string;
	positioning: string;
	competitiveMoat: string;
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/**
 * Requirements · Business sub-area — HIGH-LEVEL only: what the business
 * commits to and must respect. Detailed, executable rules live in the Rules
 * capability (Functional), never here.
 */
export interface BusinessDefinition {
	/** A · Commitments — what the business commits to. */
	objectives: string[];
	slas: SlaEntry[];
	contractualConstraints: string[];
	contractAttachment: string | null;
	/** C · What could sink the bet — known risks and load-bearing assumptions. */
	risks: string[];
	/** D · Documents & custom — supporting material. */
	custom: BusinessCustomReq[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/**
 * Product-level technical expectations — what the product must work with,
 * talk to, and feel like. The stack itself lives in Data & Architecture.
 */
export interface TechnicalDefinition {
	compatibilities: string[];
	integrations: IntegrationEntry[];
	apisExpose: ApiKind[];
	apisConsume: ApiKind[];
	performance: PerformanceTarget[];
	availability: string;
	custom: BusinessCustomReq[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/** Trust & compliance the product must earn — product/market-level security choices. */
export interface SecurityDefinition {
	authentication: AuthMechanism[];
	authorization: AuthorizationModel;
	encryption: EncryptionScope[];
	auditLogs: AuditLogLevel;
	expectedCertifications: CertificationCode[];
	dataRetention: RetentionRule[];
	custom: BusinessCustomReq[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/**
 * The persisted content of the Foundation definition slice — one draft per
 * project.
 *
 * Mirrors the persisted state definitions of feature `6b9ffe58`, minus
 * purely derived fields (localCoherenceScore + canAdvance — see coherence.ts /
 * can-advance.ts) and purely transient UI fields (activeTab + autoSaveStatus —
 * those live in the store, not in the draft).
 */
export interface FoundationDefinitionDraft {
	projectId: string;
	/* Section 1-3 — seeded from the identity slice, editable. */
	businessObjective: BusinessObjectiveDefinition;
	market: MarketDefinition;
	competition: CompetitionDefinition;
	/* Section 4 — Requirements: three sub-areas. */
	business: BusinessDefinition;
	technical: TechnicalDefinition;
	security: SecurityDefinition;
	lastSavedAt: string | null;
}

/**
 * The definition sections that carry their own evidence citations — every slice
 * of the draft except the bookkeeping fields. Named here so the store, the UI
 * and any consumer iterate the same list.
 */
export const DEFINITION_SOURCE_SECTIONS = [
	'businessObjective',
	'market',
	'competition',
	'business',
	'technical',
	'security'
] as const;
export type DefinitionSourceSection = (typeof DEFINITION_SOURCE_SECTIONS)[number];

/** Default values, transcribed from each state def's `defaultValue`. */
export function createEmptyDefinitionDraft(projectId: string): FoundationDefinitionDraft {
	return {
		projectId,
		businessObjective: {
			mainProblem: '',
			painPointLinks: [],
			painPoints: [],
			affectedPersonas: [],
			expectedOutcome: '',
			kpis: [],
			successCriteria: [],
			failureCriteria: [],
			sourceIds: []
		},
		market: {
			marketType: 'b2b',
			customerSize: [],
			industrySectors: [],
			languages: [],
			regulations: [],
			sourceIds: []
		},
		competition: {
			directCompetitors: [],
			indirectCompetitors: [],
			businessModels: [],
			differentiators: [],
			claimedCategory: '',
			positioning: '',
			competitiveMoat: '',
			sourceIds: []
		},
		business: {
			objectives: [],
			slas: [],
			contractualConstraints: [],
			contractAttachment: null,
			risks: [],
			custom: [],
			sourceIds: []
		},
		technical: {
			compatibilities: [],
			integrations: [],
			apisExpose: [],
			apisConsume: [],
			performance: [],
			availability: '',
			custom: [],
			sourceIds: []
		},
		security: {
			authentication: [],
			authorization: 'rbac',
			encryption: [],
			auditLogs: 'partial',
			expectedCertifications: [],
			dataRetention: [],
			custom: [],
			sourceIds: []
		},
		lastSavedAt: null
	};
}

/* ── Factories for collection rows (UI uses these for "Add" buttons) ──── */

export const createSla = (): SlaEntry => ({ metric: '', commitment: '', penalty: '' });
export const createBusinessCustom = (): BusinessCustomReq => ({ label: '', value: '' });

/** A fresh pain point with no users linked yet. */
export const createPainPointLink = (text = ''): PainPointLink => ({
	id: crypto.randomUUID(),
	text,
	roleIds: []
});

export const createIntegration = (): IntegrationEntry => ({
	system: '',
	direction: 'both',
	criticality: 'medium'
});

export const createPerformanceTarget = (): PerformanceTarget => ({
	action: '',
	target: 0,
	unit: 'ms'
});

export const createRetentionRule = (): RetentionRule => ({
	dataType: '',
	duration: '',
	actionAfter: 'archival'
});

/* Re-export identity row factories so Business objective / Competition can reuse them. */
export { createKpi, createCompetitor };
