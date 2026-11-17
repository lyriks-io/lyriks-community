import type {
	ClockPort,
	ProjectModelRevisionPort,
	SectionDraftRepositoryPort,
	SectionDraftSaveOptions,
	SessionPort
} from '../ports';
import type { ProjectApprovalsDraft } from '$domain/approvals';
import { SETTLED_APPROVAL_STATUSES } from '$domain/approvals';
import type { ProjectDataDraft } from '$domain/data';
import { unrelatedEntities } from '$domain/data';
import { sourceAccessIssues, uncitedElements, type ExtractedReading, type ProjectDocumentsDraft } from '$domain/documents';
import {
	appendScopeAudit,
	assessProjectCompletion,
	scopeContentFingerprint,
	type CompletionEvidence,
	type ProjectCompletionReport,
	type ProjectScopeDraft,
	type ScopeAuditEntry,
	type ScopeAuditKind
} from '$domain/scope';
import { coherenceHeadline, type CoherenceHeadline } from '$domain/coherence';
import type { CoherenceView } from './load-coherence-draft';
import type { FeatureMaturityRow } from './load-feature-maturity';
import type { VerifyExperienceOptions, VerifyExperienceResult } from '../specification/verify-experience';
import { NBSP, type SpecLanguage } from '$domain/language';

interface Loader<T> {
	execute(projectId: string): Promise<T>;
}

interface ScopeLoader {
	execute(projectId: string): Promise<ProjectScopeDraft>;
}

/**
 * The evidence reading the gate runs on. Named as an interface so a caching tier
 * can stand in front of `BuildCompletionEvidenceUseCase` without the gate, or
 * the audit, knowing that anything is memoized.
 */
export interface CompletionEvidenceReader {
	execute(projectId: string, scope: ProjectScopeDraft): Promise<CompletionEvidence>;
}

interface ExperienceVerifier {
	execute(projectId: string, options?: VerifyExperienceOptions): Promise<VerifyExperienceResult>;
}

/** Reads the language a project's spec is written in (English when absent). */
interface SpecLanguageReader {
	generated(projectId: string): Promise<SpecLanguage>;
}

const readLanguage = async (reader: SpecLanguageReader | undefined, projectId: string): Promise<SpecLanguage> =>
	reader ? reader.generated(projectId).catch(() => 'en' as const) : 'en';

/** What holds the coherence check, as the evidence names it (ac-leaf-ac-score-completion-coherence). */
interface CoherenceHold {
	readonly headline: CoherenceHeadline;
	readonly readiness: number;
	readonly threshold: number;
	readonly unchecked: number;
}
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const COHERENCE_WORD = {
	en: { strong: 'strong', watch: 'watch', critical: 'critical' },
	fr: { strong: 'solide', watch: 'à surveiller', critical: 'critique' }
} as const;

/** The sentences the evidence carries, in the spec's language. */
const TEXTS = {
	en: {
		coherenceReady: ({ headline, readiness }: CoherenceHold) =>
			`Coherence ${headline.score}/100 (${COHERENCE_WORD.en[headline.verdict]}), readiness ${Math.round(readiness)}%, no blocking gap, every feature checked by the behaviour engine`,
		coherenceNotReady: ({ headline, readiness, threshold, unchecked }: CoherenceHold) =>
			`Coherence ${headline.score}/100 (${COHERENCE_WORD.en[headline.verdict]}): ${[
				headline.blocking > 0 ? `${headline.blocking} blocking gap${plural(headline.blocking, '', 's')}` : '',
				headline.verdict === 'critical' && headline.highSeverity > 0
					? `${headline.highSeverity} of high severity`
					: '',
				readiness < threshold ? `readiness ${Math.round(readiness)}% under the ${threshold}% required` : '',
				unchecked > 0
					? `${unchecked} feature${plural(unchecked, '', 's')} not checked by the behaviour engine yet, which is going through ${plural(unchecked, 'it', 'them')} now`
					: ''
			]
				.filter(Boolean)
				.join(', ') || 'it reads critical'}.`,
		experienceReady: 'Every authored journey passes the end-to-end verification gate',
		experienceUnknown: 'The end-to-end experience verification could not establish readiness.',
		coherenceBeforeScope: 'Project health is evaluated after the external scope is declared.',
		experienceBeforeScope: 'End-to-end verification starts after the external scope is declared.'
	},
	fr: {
		coherenceReady: ({ headline, readiness }: CoherenceHold) =>
			`Cohérence ${headline.score}/100 (${COHERENCE_WORD.fr[headline.verdict]}), préparation à ${Math.round(readiness)}${NBSP}%, aucune lacune bloquante, chaque fonctionnalité vérifiée par le moteur de comportement`,
		coherenceNotReady: ({ headline, readiness, threshold, unchecked }: CoherenceHold) =>
			`Cohérence ${headline.score}/100 (${COHERENCE_WORD.fr[headline.verdict]})${NBSP}: ${[
				headline.blocking > 0
					? `${headline.blocking} ${plural(headline.blocking, 'lacune bloquante', 'lacunes bloquantes')}`
					: '',
				headline.verdict === 'critical' && headline.highSeverity > 0
					? `${headline.highSeverity} de haute sévérité`
					: '',
				readiness < threshold ? `préparation à ${Math.round(readiness)}${NBSP}% sous les ${threshold}${NBSP}% exigés` : '',
				unchecked > 0
					? `${unchecked} ${plural(unchecked, 'fonctionnalité pas encore vérifiée', 'fonctionnalités pas encore vérifiées')} par le moteur de comportement, qui s'en charge maintenant`
					: ''
			]
				.filter(Boolean)
				.join(', ') || 'elle se lit critique'}.`,
		experienceReady: 'Chaque parcours écrit passe la vérification de bout en bout',
		experienceUnknown: "La vérification de bout en bout de l'expérience n'a pas pu établir qu'elle est prête.",
		coherenceBeforeScope: 'La santé du projet est évaluée une fois le périmètre externe déclaré.',
		experienceBeforeScope: 'La vérification de bout en bout commence une fois le périmètre externe déclaré.'
	}
} as const;

/**
 * Records what a gate run concluded, so a reviewer can read the sequence of
 * attempts rather than only the latest verdict. The evidence fingerprints make
 * each row answer "against which version of the project?".
 */
/** 'local' is the honest name for the dev session, which carries no identity. */
function actorOf(session: SessionPort): string {
	const current = session.current();
	return current.isAuthenticated ? (current.email ?? 'authenticated user') : 'local';
}

function auditEntry(
	kind: ScopeAuditKind,
	performedAt: string,
	actor: string,
	report: ProjectCompletionReport,
	evidence: CompletionEvidence
): ScopeAuditEntry {
	return {
		performedAt,
		scopeFingerprint: evidence.currentScopeFingerprint,
		modelFingerprint: evidence.currentModelFingerprint,
		kind,
		actor,
		score: report.score,
		verdict: report.status,
		blockingIssues: report.issues.filter((issue) => issue.severity === 'blocking').length,
		failedChecks: report.checks.filter((check) => !check.passed).map((check) => check.key)
	};
}

/**
 * Gathers current evidence behind the pure domain gate. This is the only place
 * that knows which application readings establish project-level completion.
 */
export class BuildCompletionEvidenceUseCase {
	constructor(
		private readonly documents: Loader<ProjectDocumentsDraft>,
		private readonly approvals: Loader<ProjectApprovalsDraft>,
		private readonly coherence: Loader<CoherenceView>,
		private readonly maturity: Loader<FeatureMaturityRow[]>,
		private readonly data: Loader<ProjectDataDraft>,
		private readonly experience: ExperienceVerifier,
		private readonly modelRevision: ProjectModelRevisionPort,
		private readonly language?: SpecLanguageReader,
		/** Per table, the checkable fields no behaviour state carries (null: nothing to say). */
		private readonly unlinkedFields?: (projectId: string) => Promise<{ table: string; count: number }[] | null>,
		/** What a project read from its code, documents or design extracted, with the sources each cites (null: started from scratch). */
		private readonly extracted?: (projectId: string) => Promise<ExtractedReading | null>
	) {}

	async execute(projectId: string, scope: ProjectScopeDraft): Promise<CompletionEvidence> {
		// The language is part of the model (Foundation), so the evidence read in
		// it stays exact under the model fingerprint that keys its cache.
		const lang = await readLanguage(this.language, projectId);
		const t = TEXTS[lang];
		const [documents, approvals, coherence, maturity, data, experience, modelFingerprint, unlinked, extracted] =
			await Promise.all([
				this.documents.execute(projectId),
				this.approvals.execute(projectId),
				this.coherence.execute(projectId),
				this.maturity.execute(projectId).catch(() => []),
				this.data.execute(projectId).catch(() => null),
				this.experience.execute(projectId, lang === 'en' ? undefined : { language: lang }).catch(() => null),
				this.modelRevision.fingerprint(projectId),
				this.unlinkedFields?.(projectId).catch(() => null) ?? Promise.resolve(null),
				this.extracted?.(projectId).catch(() => null) ?? Promise.resolve(null)
			]);
		const uncited = extracted ? uncitedElements(extracted.elements, documents.sources.map((source) => source.id)) : [];
		// The check reads the headline the Control Center shows, never the readiness alone, and
		// concludes on nothing the behaviour engine has not checked (ac-leaf-ac-score-completion-*).
		const hold: CoherenceHold = {
			headline: coherenceHeadline(coherence.analysis.gaps),
			readiness: coherence.analysis.readinessScore,
			threshold: coherence.draft.threshold,
			unchecked: coherence.analysis.behaviorUnchecked ?? 0
		};
		const coherenceReady =
			hold.readiness >= hold.threshold &&
			hold.headline.blocking === 0 &&
			hold.unchecked === 0 &&
			hold.headline.verdict !== 'critical';

		return {
			sourceIds: documents.sources.map((source) => source.id),
			// The register is read here, so the reachability of every row is read here
			// too: the gate reports what the documents write already answered with.
			unreachableSources: sourceAccessIssues(documents.sources),
			featureMaturity: Object.fromEntries(
				maturity.map((row) => [row.featureId, row.maturity])
			),
			behaviorEntities: maturity.flatMap((row) =>
				row.entities.map((name) => ({ name, featureName: row.name }))
			),
			dataEntityNames: (data?.entities ?? []).map((entity) => entity.name),
			unrelatedDataEntityNames: data ? unrelatedEntities(data).map((entity) => entity.name) : [],
			...(unlinked && unlinked.length > 0 ? { unlinkedDataFields: unlinked } : {}),
			...(uncited.length > 0 && extracted ? { uncitedExtracted: uncited, extractedFrom: extracted.from } : {}),
			settledApprovalIds: approvals.items
				.filter((item) => SETTLED_APPROVAL_STATUSES.includes(item.status))
				.map((item) => item.id),
			// Filed and waiting for a person. The gate counts the decision as taken
			// and reports the missing signature as debt, instead of pushing whoever
			// authors the scope to claim a risk was accepted.
			pendingApprovalIds: approvals.items
				.filter((item) => item.status === 'in_review')
				.map((item) => item.id),
			coherenceReady,
			coherenceDetail: coherenceReady ? t.coherenceReady(hold) : t.coherenceNotReady(hold),
			coherenceScore: hold.headline.score,
			// A reading taken while the engine was over budget is honest evidence, it
			// is simply thinner: flagged so it is not cached as if it were final.
			provisional: experience?.engine?.degraded === true,
			experienceReady: experience?.ready ?? false,
			experienceDetail: experience?.ready
				? t.experienceReady
				: (experience?.blockers[0] ?? t.experienceUnknown),
			currentScopeFingerprint: scopeContentFingerprint(scope, documents.sources),
			currentModelFingerprint: modelFingerprint,
			...(lang === 'en' ? {} : { language: lang })
		};
	}
}

/**
 * Reads the current completion verdict. It is safe to call from UI, JSON API,
 * portfolio summaries and MCP because it never mutates the ledger.
 */
export class AssessProjectCompletenessUseCase {
	constructor(
		private readonly scopes: ScopeLoader,
		private readonly evidence: CompletionEvidenceReader,
		private readonly language?: SpecLanguageReader
	) {}

	async execute(projectId: string): Promise<ProjectCompletionReport> {
		const scope = await this.scopes.execute(projectId);
		// The scope gate is an AND: a legacy project with no declared reference
		// set is already deterministically incomplete. Avoid running coherence,
		// behavior and Experience engines for every such portfolio row; those
		// readings cannot turn an unclassified empty scope into a passing report.
		if (
			scope.mode === 'unclassified' &&
			scope.capabilities.length === 0 &&
			scope.audit === null
		) {
			const lang = await readLanguage(this.language, projectId);
			const t = TEXTS[lang];
			return assessProjectCompletion(scope, {
				sourceIds: [],
				featureMaturity: {},
				behaviorEntities: [],
				dataEntityNames: [],
				settledApprovalIds: [],
				coherenceReady: false,
				coherenceDetail: t.coherenceBeforeScope,
				experienceReady: false,
				experienceDetail: t.experienceBeforeScope,
				currentScopeFingerprint: scopeContentFingerprint(scope),
				currentModelFingerprint: 'not-evaluated',
				...(lang === 'en' ? {} : { language: lang })
			});
		}
		return assessProjectCompletion(scope, await this.evidence.execute(projectId, scope));
	}
}

/**
 * Ordinary edits may not manufacture or retain a completion verdict. The audit
 * survives only when the user-authored scope content is byte-equivalent after
 * canonical parsing; any material change reopens the project.
 */
export class SaveScopeDraftUseCase {
	constructor(
		private readonly scopes: SectionDraftRepositoryPort<ProjectScopeDraft>,
		private readonly clock: ClockPort
	) {}

	async execute(
		incoming: ProjectScopeDraft,
		opts?: SectionDraftSaveOptions
	): Promise<{ savedAt: string; revision: number } | null> {
		const existing = await this.scopes.load(incoming.projectId);
		const changed =
			!existing ||
			scopeContentFingerprint(existing) !== scopeContentFingerprint(incoming);
		const savedAt = this.clock.nowIso();
		const draft: ProjectScopeDraft = {
			...incoming,
			// History is server-owned: an ordinary save may neither forge nor erase it,
			// and unlike `audit` it is NOT invalidated when the scope content changes.
			auditLog: existing?.auditLog ?? [],
			audit: changed ? null : existing?.audit ?? null,
			completionStatus: changed
				? 'in_progress'
				: existing?.completionStatus ?? 'unverified',
			completedAt: changed ? null : existing?.completedAt ?? null,
			lastSavedAt: savedAt
		};
		const revision = await this.scopes.save(draft, opts);
		return revision === null ? null : { savedAt, revision };
	}
}

export class AuditProjectScopeUseCase {
	constructor(
		private readonly scopes: SectionDraftRepositoryPort<ProjectScopeDraft>,
		private readonly loadScope: ScopeLoader,
		private readonly evidence: CompletionEvidenceReader,
		private readonly clock: ClockPort,
		private readonly session: SessionPort
	) {}

	async execute(
		projectId: string,
		opts?: SectionDraftSaveOptions
	): Promise<{ report: ProjectCompletionReport; savedAt: string; revision: number } | null> {
		const scope = await this.loadScope.execute(projectId);
		const evidence = await this.evidence.execute(projectId, scope);
		const currentReport = assessProjectCompletion(scope, evidence);
		if (currentReport.status === 'completed') {
			return {
				report: currentReport,
				savedAt: scope.lastSavedAt ?? scope.completedAt ?? this.clock.nowIso(),
				revision: await this.scopes.currentRevision(projectId)
			};
		}
		const performedAt = this.clock.nowIso();
		const audited: ProjectScopeDraft = {
			...scope,
			audit: {
				performedAt,
				scopeFingerprint: evidence.currentScopeFingerprint,
				modelFingerprint: evidence.currentModelFingerprint
			},
			completionStatus: 'in_progress',
			completedAt: null,
			lastSavedAt: performedAt
		};
		const report = assessProjectCompletion(audited, evidence);
		const persisted: ProjectScopeDraft = {
			...audited,
			completionStatus: report.canFinish ? 'ready' : 'in_progress',
			auditLog: appendScopeAudit(
				scope.auditLog,
				auditEntry('audit', performedAt, actorOf(this.session), report, evidence)
			)
		};
		const revision = await this.scopes.save(persisted, opts);
		if (revision === null) return null;
		return { report, savedAt: performedAt, revision };
	}
}

export class FinishProjectUseCase {
	constructor(
		private readonly scopes: SectionDraftRepositoryPort<ProjectScopeDraft>,
		private readonly loadScope: ScopeLoader,
		private readonly evidence: CompletionEvidenceReader,
		private readonly clock: ClockPort,
		private readonly session: SessionPort
	) {}

	async execute(
		projectId: string,
		opts?: SectionDraftSaveOptions
	): Promise<
		| { completed: false; report: ProjectCompletionReport }
		| {
				completed: true;
				report: ProjectCompletionReport;
				savedAt: string;
				revision: number;
		  }
		| null
	> {
		const scope = await this.loadScope.execute(projectId);
		const evidence = await this.evidence.execute(projectId, scope);
		const report = assessProjectCompletion(scope, evidence);
		if (!report.canFinish) return { completed: false, report };
		if (report.status === 'completed') {
			return {
				completed: true,
				report,
				savedAt: scope.completedAt ?? scope.lastSavedAt ?? this.clock.nowIso(),
				revision: await this.scopes.currentRevision(projectId)
			};
		}
		const savedAt = this.clock.nowIso();
		const completedScope: ProjectScopeDraft = {
			...scope,
			completionStatus: 'completed',
			completedAt: savedAt,
			lastSavedAt: savedAt
		};
		const finalReport = assessProjectCompletion(completedScope, evidence);
		const revision = await this.scopes.save(
			{
				...completedScope,
				auditLog: appendScopeAudit(
					scope.auditLog,
					auditEntry('completion', savedAt, actorOf(this.session), finalReport, evidence)
				)
			},
			opts
		);
		if (revision === null) return null;
		return { completed: true, report: finalReport, savedAt, revision };
	}
}
