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

/**
 * One free constraint of Requirements › Constraints: a theme and what it says.
 * The single home of every requirement the structured fields do not hold.
 */
export interface ConstraintEntry {
	readonly id: string;
	readonly theme: string;
	readonly description: string;
}

/**
 * The themes the theme field always offers; a project adds its own by typing them.
 * Technical and Security are not among them: a technical constraint (security
 * ones included) has one home, the architecture's own list (Technical
 * constraints); every other kind lives here.
 */
export const BUILT_IN_CONSTRAINT_THEMES = ['Business', 'Compliance', 'Legal', 'Ops'] as const;

/** A row filed under Technical or Security before the split: Tech & Data offers to bring it into its own list. */
export const isTechnicalConstraintTheme = (theme: string): boolean =>
	/^(technical|security)$/i.test(theme.trim());

/**
 * The themes offered for a constraint: the built-in ones, then every other theme
 * the project already uses, in first-use order. Themes are matched case aside, so
 * "compliance" never offers itself next to "Compliance".
 */
export function constraintThemeOptions(items: readonly ConstraintEntry[]): string[] {
	const options: string[] = [...BUILT_IN_CONSTRAINT_THEMES];
	for (const { theme } of items) {
		const clean = theme.trim();
		if (clean && !options.some((o) => o.toLowerCase() === clean.toLowerCase())) options.push(clean);
	}
	return options;
}

/** A typed theme, spelled as the offered theme it matches (case aside) or kept as typed. */
export function canonicalConstraintTheme(theme: string, items: readonly ConstraintEntry[]): string {
	const clean = theme.trim();
	return constraintThemeOptions(items).find((o) => o.toLowerCase() === clean.toLowerCase()) ?? clean;
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
	contractAttachment: string | null;
	/** C · What could sink the bet — known risks and load-bearing assumptions. */
	risks: string[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/**
 * Product-level technical expectations — what the product must work with,
 * talk to, and feel like. The stack itself lives in Tech & Data.
 */
export interface TechnicalDefinition {
	compatibilities: string[];
	integrations: IntegrationEntry[];
	apisExpose: ApiKind[];
	apisConsume: ApiKind[];
	performance: PerformanceTarget[];
	availability: string;
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
}

/**
 * The precise questions of the Requirements page that cite their own sources,
 * in the order they are asked. Each answer lives in its own slice; only the
 * evidence is held here, question by question.
 */
export const REQUIREMENT_QUESTIONS = ['runtime', 'languages', 'security', 'compliance', 'accessibility'] as const;
export type RequirementQuestion = (typeof REQUIREMENT_QUESTIONS)[number];

/** Requirements: every free constraint, whatever its theme, and the sources of each question. */
export interface ConstraintsDefinition {
	items: ConstraintEntry[];
	/** Ids from the project Documents & Sources register that evidence the free constraints. */
	sourceIds: string[];
	/** The sources cited under each precise question, shown right under it. */
	questionSources: Record<RequirementQuestion, string[]>;
}

export const emptyQuestionSources = (): Record<RequirementQuestion, string[]> =>
	Object.fromEntries(REQUIREMENT_QUESTIONS.map((q) => [q, [] as string[]])) as Record<RequirementQuestion, string[]>;

/** The security questions the form opens on a default for: the default is not an answer. */
export type SecurityQuestion = 'auditLogs' | 'authorization';

/** Trust & compliance the product must earn — product/market-level security choices. */
export interface SecurityDefinition {
	authentication: AuthMechanism[];
	authorization: AuthorizationModel;
	encryption: EncryptionScope[];
	auditLogs: AuditLogLevel;
	expectedCertifications: CertificationCode[];
	dataRetention: RetentionRule[];
	/** Ids from the project Documents & Sources register that evidence this section. */
	sourceIds: string[];
	/**
	 * The questions someone answered, each on its own: the definition also keeps
	 * the response times and the availability notes, so its save stamp says
	 * nothing about them. Absent on a definition saved before it was kept (see
	 * `answeredSecurityQuestions`).
	 */
	answered?: SecurityQuestion[];
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
	constraints: ConstraintsDefinition;
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
	'security',
	'constraints'
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
			contractAttachment: null,
			risks: [],
			sourceIds: []
		},
		technical: {
			compatibilities: [],
			integrations: [],
			apisExpose: [],
			apisConsume: [],
			performance: [],
			availability: '',
			sourceIds: []
		},
		security: {
			authentication: [],
			authorization: 'rbac',
			encryption: [],
			auditLogs: 'partial',
			expectedCertifications: [],
			dataRetention: [],
			sourceIds: []
		},
		constraints: { items: [], sourceIds: [], questionSources: emptyQuestionSources() },
		lastSavedAt: null
	};
}

/* ── Factories for collection rows (UI uses these for "Add" buttons) ──── */

export const createSla = (): SlaEntry => ({ metric: '', commitment: '', penalty: '' });
export const createConstraint = (theme = '', description = ''): ConstraintEntry => ({
	id: crypto.randomUUID(),
	theme,
	description
});

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
