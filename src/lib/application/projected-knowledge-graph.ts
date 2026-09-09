import type { KnowledgeGraph } from '$domain/graph';
import { buildKnowledgeGraph } from './build-knowledge-graph';
import type {
	ClockPort,
	GlobalCoherenceCheckerPort,
	KnowledgeGraphProviderPort,
	UpstreamCapabilityProviderPort
} from './ports';
import type {
	LoadArchitectureDraftUseCase,
	LoadDataDraftUseCase,
	LoadFoundationDraftUseCase,
	LoadExperienceDraftUseCase,
	LoadFeaturesDraftUseCase,
	LoadRulesDraftUseCase,
	LoadUsersDraftUseCase
} from './use-cases';

/**
 * The LOCAL knowledge-graph provider: loads every per-context draft and folds
 * them into one graph via `buildKnowledgeGraph`. Drafts stay authoritative —
 * this is a derived read model, rebuilt on demand. Implements
 * `KnowledgeGraphProviderPort`, so a future engine-backed provider swaps in at
 * the composition root with no change to the API route or the viewer.
 *
 * The coherence overlay (gaps) is best-effort: if the checker throws we still
 * return the structural graph.
 */
export class ProjectedKnowledgeGraphProvider implements KnowledgeGraphProviderPort {
	constructor(
		private readonly loadFoundation: LoadFoundationDraftUseCase,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly loadUsers: LoadUsersDraftUseCase,
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadData: LoadDataDraftUseCase,
		private readonly loadRules: LoadRulesDraftUseCase,
		private readonly loadArchitecture: LoadArchitectureDraftUseCase,
		private readonly clock: ClockPort,
		private readonly coherence: GlobalCoherenceCheckerPort,
		private readonly upstream: UpstreamCapabilityProviderPort
	) {}

	async build(projectId: string): Promise<KnowledgeGraph> {
		const [identity, features, users, experience, data, rules, architecture] = await Promise.all([
			this.loadFoundation.loadIdentity(projectId),
			this.loadFeatures.execute(projectId),
			this.loadUsers.execute(projectId),
			this.loadExperience.execute(projectId),
			this.loadData.execute(projectId),
			this.loadRules.execute(projectId),
			this.loadArchitecture.execute(projectId)
		]);

		const gaps = await this.coherence
			.analyze(projectId)
			.then((a) => a.gaps)
			.catch(() => []);

		// The matrix's surface rows — best-effort, like the gaps: a kernel read
		// that fails must not cost the whole structural graph.
		const surfaces = await this.upstream.listSurfaceCapabilities(projectId).catch(() => []);

		return buildKnowledgeGraph({
			projectId,
			generatedAt: this.clock.nowIso(),
			identity,
			features,
			users,
			experience,
			data,
			rules,
			architecture,
			surfaces,
			gaps
		});
	}
}
