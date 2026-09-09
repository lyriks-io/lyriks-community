import {
	assemblePortfolio,
	deriveProjectStage,
	type PortfolioView,
	type ProjectCard,
} from '$domain/portfolio';
import { leafFeatures } from '$domain/features';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import { coverageScoreOf, maturityScoreOf } from '$domain/coherence/draft';
import type {
	BackLinkRepositoryPort,
	GlobalCoherenceCheckerPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
} from '$application/ports';
import type { ProjectSummary } from '$domain/catalog';
import { scopeToWorkspace } from '$application/scope-to-workspace';
import { canSeeProjectAsCollaborator } from '$domain/team/team';
import { mapLimit } from '$lib/shared/map-limit';

/**
 * How many project cards to derive at once. Each card runs a full coherence
 * analysis (8 section loads + one kernel read per leaf feature), so an unbounded
 * fan-out over every project floods the Postgres pool and the CPU on a small
 * appliance box — the dashboard then times out. Keep this at roughly the vCPU
 * count so the home load makes steady progress instead of thundering-herding.
 */
const CARD_CONCURRENCY = 4;
import type { LoadFeaturesDraftUseCase } from './load-features-draft';
import type { LoadTeamUseCase } from './load-team';
import type { LoadFoundationDraftUseCase } from './load-foundation-draft';

/**
 * Assemble the whole portfolio for the dashboard: list domains + projects, then
 * derive each project's card metrics from the wizard steps — coverage, maturity,
 * readiness + coherence from the LOCAL global checker (no network on the dashboard;
 * coverage is structural presence, maturity the behavior dimension, readiness
 * breadth, coherence correctness = 100 − open gaps), production from Step 11,
 * components from Step 04 leaf features, delivery stage read
 * off those same live signals (plus the human shipping declaration) — and group +
 * roll up under domains.
 */
export class BuildPortfolioUseCase {
	constructor(
		private readonly catalog: ProjectCatalogPort,
		private readonly portfolio: PortfolioRepositoryPort,
		private readonly coherence: GlobalCoherenceCheckerPort,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly backLinks: BackLinkRepositoryPort,
		private readonly loadTeam: LoadTeamUseCase,
		/** Where each project started, so a card can say it was created from a codebase. */
		private readonly loadFoundation: Pick<LoadFoundationDraftUseCase, 'loadIdentity'>,
	) {}

	/**
	 * @param allowedWorkspaceIds when non-null, restrict the portfolio to projects
	 *   mirrored to a workspace the caller belongs to (multi-tenant isolation). Pass
	 *   null in the single-tenant / auth-off appliance to list everything (unchanged).
	 * @param allowedDomainIds the domain-scope breadth. Null = blanket (owner/admin,
	 *   "all projects", or auth-off) — every project. A Set restricts to those domains.
	 * @param collaboratorEmail when the caller is restricted, projects whose team
	 *   carries this email are ALSO shown (per-project grants) — visibility is the
	 *   union of domain breadth and collaborations. Ignored when blanket.
	 */
	async execute(
		allowedWorkspaceIds: ReadonlySet<string> | null = null,
		allowedDomainIds: ReadonlySet<string> | null = null,
		collaboratorEmail: string | null = null,
	): Promise<PortfolioView> {
		const [domains, listed] = await Promise.all([
			this.portfolio.listDomains(),
			this.catalog.list(),
		]);
		const summaries = await scopeToWorkspace(listed, allowedWorkspaceIds, this.backLinks);
		const cards = await mapLimit(summaries, CARD_CONCURRENCY, (s) => this.#card(s));

		// Blanket: every workspace project. Restricted: domain breadth ∪ collaborations.
		if (allowedDomainIds === null) return assemblePortfolio(domains, cards);
		const keep = await mapLimit(cards, CARD_CONCURRENCY, (c) =>
			this.#visibleWhenRestricted(c, allowedDomainIds, collaboratorEmail),
		);
		const visibleCards = cards.filter((_, i) => keep[i]);
		const visibleDomainIds = new Set(
			visibleCards.map((c) => c.domainId).filter((d): d is string => d !== null),
		);
		const scopedDomains = domains.filter(
			(d) => visibleDomainIds.has(d.id) || allowedDomainIds.has(d.id),
		);
		return assemblePortfolio(scopedDomains, visibleCards);
	}

	/** A restricted caller keeps a card when its domain is in breadth or they collaborate on it. */
	async #visibleWhenRestricted(
		card: ProjectCard,
		allowedDomainIds: ReadonlySet<string>,
		collaboratorEmail: string | null,
	): Promise<boolean> {
		if (card.domainId !== null && allowedDomainIds.has(card.domainId)) return true;
		if (!collaboratorEmail) return false;
		const team = await this.loadTeam.execute(card.id).catch(() => null);
		return team ? canSeeProjectAsCollaborator(team, collaboratorEmail) : false;
	}

	async #card(s: ProjectSummary): Promise<ProjectCard> {
		const [meta, analysis, features, identity] = await Promise.all([
			this.portfolio.getMeta(s.id),
			this.coherence.analyze(s.id),
			this.loadFeatures.execute(s.id),
			this.loadFoundation.loadIdentity(s.id).catch(() => null),
		]);
		const coverageScore = coverageScoreOf(analysis.dimensions, analysis.readinessScore);
		const maturityScore = maturityScoreOf(analysis.dimensions);
		const featureCount = leafFeatures(features).length;
		// True last activity across the whole wizard, not just Step 01 — the analysis
		// already folded in every section draft.
		const lastSavedAt =
			[s.lastSavedAt, analysis.lastActivityAt]
				.filter((t): t is string => typeof t === 'string' && t.length > 0)
				.sort()
				.pop() ?? s.lastSavedAt;
		return {
			id: s.id,
			name: s.name,
			description: s.description,
			domainId: meta?.domainId ?? null,
			// The spec decides how far the work got; only a human decides it shipped.
			stage: deriveProjectStage({
				coverageScore,
				maturityScore,
				featureCount,
				shippedAt: meta?.shippedAt ?? null,
				lastActivityAt: lastSavedAt,
			}),
			coverageScore,
			maturityScore,
			readinessScore: analysis.readinessScore,
			coherenceScore: coherenceScoreOf(analysis.gaps),
			featureCount,
			lastSavedAt,
			sourceMode: identity?.sourceMode ?? null,
		};
	}
}
