import {
	assemblePortfolio,
	deriveProjectStage,
	type PortfolioView,
	type ProjectCard,
} from '$domain/portfolio';
import { leafFeatures } from '$domain/features';
import { countEvolutionsInProgress, type ProjectEvolutionDraft } from '$domain/evolution';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import { coverageScoreOf, maturityScoreOf } from '$domain/coherence';
import type {
	BackLinkRepositoryPort,
	GlobalCoherenceCheckerPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
} from '$application/ports';
import type { ProjectSummary } from '$domain/catalog';
import { placeInWorkspaces } from '$application/portfolio/scope-to-workspace';
import {
	isProjectVisible,
	visibilityIn,
	workspaceIdsOf,
	type CallerReach,
	type ProjectVisibility,
} from '$application/portfolio/project-visibility';
import { folderVisibleTo, foldersOfWorkspaces } from '$application/portfolio/folder-policy';
import { mapLimit } from '$lib/shared/map-limit';

/**
 * How many project cards to derive at once. Each card runs a full coherence
 * analysis (8 section loads + one kernel read per leaf feature), so an unbounded
 * fan-out over every project floods the Postgres pool and the CPU on a small
 * appliance box — the dashboard then times out. Keep this at roughly the vCPU
 * count so the home load makes steady progress instead of thundering-herding.
 */
const CARD_CONCURRENCY = 4;
import type { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';
import type { LoadTeamUseCase } from '../collaboration/load-team';
import type { LoadFoundationDraftUseCase } from '../specification/load-foundation-draft';
import type { LoadResidueDraftUseCase } from '../specification/residue-draft-use-cases';

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
		/** The project's evolution requests, so a card can count those in progress. */
		private readonly loadEvolution: Pick<LoadResidueDraftUseCase<ProjectEvolutionDraft>, 'execute'>,
	) {}

	/**
	 * @param reach what the caller reaches, workspace by workspace; null lists
	 *   everything (the single-tenant / auth-off appliance, unchanged). Under a
	 *   reach, only projects of the caller's workspaces are kept (multi-tenant
	 *   isolation), each judged by the caller's breadth in ITS workspace (domain
	 *   breadth ∪ collaborations), and only the folders of those workspaces are
	 *   listed: never another team's (issue 156).
	 */
	async execute(reach: CallerReach | null = null): Promise<PortfolioView> {
		const [domains, listed] = await Promise.all([
			this.portfolio.listDomains(),
			this.catalog.list(),
		]);
		if (reach === null) {
			const cards = await mapLimit(listed, CARD_CONCURRENCY, (s) => this.#card(s));
			return assemblePortfolio(domains, cards);
		}
		const placed = await placeInWorkspaces(listed, workspaceIdsOf(reach), this.backLinks);
		const cards = await mapLimit(placed, CARD_CONCURRENCY, ({ item }) => this.#card(item));
		const keep = await mapLimit(cards, CARD_CONCURRENCY, (c, i) =>
			this.#visible(c, visibilityIn(reach, placed[i].workspaceId)),
		);
		const visibleCards = cards.filter((_, i) => keep[i]);
		const visibleDomainIds = new Set(
			visibleCards.map((c) => c.domainId).filter((d): d is string => d !== null),
		);
		const scopedDomains = foldersOfWorkspaces(reach, domains).filter(
			(d) => visibleDomainIds.has(d.id) || folderVisibleTo(reach, d),
		);
		return assemblePortfolio(scopedDomains, visibleCards);
	}

	/** A card stays when its domain is in the breadth of its workspace or the caller collaborates on it. */
	async #visible(card: ProjectCard, visibility: ProjectVisibility): Promise<boolean> {
		return isProjectVisible(card.id, card.domainId, visibility, (id) => this.loadTeam.execute(id));
	}

	async #card(s: ProjectSummary): Promise<ProjectCard> {
		const [meta, analysis, features, identity, evolution] = await Promise.all([
			this.portfolio.getMeta(s.id),
			this.coherence.analyze(s.id),
			this.loadFeatures.execute(s.id),
			this.loadFoundation.loadIdentity(s.id).catch(() => null),
			this.loadEvolution.execute(s.id).catch(() => null),
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
			openIncoherences: analysis.gaps.length,
			featureCount,
			evolutionsInProgress: evolution ? countEvolutionsInProgress(evolution.requests) : 0,
			lastSavedAt,
			sourceMode: identity?.sourceMode ?? null,
		};
	}
}
