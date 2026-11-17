import { computeUsersCoherence, mergeSuggestionDismissals, type ProjectUsersDraft } from '$domain/users';
import type {
	ClockPort,
	TelemetryPort,
	UpstreamCapabilityProviderPort,
	UsersDraftRepositoryPort
} from '../ports';
import type { SpecLanguage } from '$domain/language';

export interface SaveUsersDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
}

/**
 * Persists the Step 03 draft (debounced auto-save). Stamps `lastSavedAt`,
 * recomputes local coherence for telemetry, and emits the matching
 * `users.autosaved` + `users.local_coherence.computed` events declared on
 * feature `33b2f79d`. Same shape as Step 02's save use case.
 */
export class SaveUsersDraftUseCase {
	constructor(
		private readonly drafts: UsersDraftRepositoryPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort,
		private readonly upstream: UpstreamCapabilityProviderPort,
		/** The spec's language: the messages a save returns are written in it. */
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
	) {}

	async execute(draft: ProjectUsersDraft): Promise<SaveUsersDraftResult> {
		const savedAt = this.clock.nowIso();
		// Dismissed suggestions are a history of decisions: a write that does not
		// carry them (a stale tab, an MCP client replacing the section) never
		// erases them (criterion `b1242208`).
		const stored = await this.drafts.load(draft.projectId);
		const stamped: ProjectUsersDraft = {
			...draft,
			dismissedSuggestions: mergeSuggestionDismissals(
				stored?.dismissedSuggestions ?? [],
				draft.dismissedSuggestions
			),
			lastSavedAt: savedAt
		};
		await this.drafts.save(stamped);

		// Score against the SAME capability universe the dashboard's coherence
		// dimension uses — the feature/journey/surface capabilities the matrix shows
		// but the Users domain can't read on its own. Omitting them (as this
		// use-case used to) made the section score report far more "ungranted"
		// capabilities than the coherence dimension for identical data.
		const [capabilityIds, lang] = await Promise.all([
			this.upstream.listCapabilityIds(draft.projectId),
			this.languageOf?.(draft.projectId)
		]);
		const coherence = computeUsersCoherence(stamped, capabilityIds, lang ?? 'en');
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'users.autosaved', savedAt });
		telemetry.emit({
			type: 'users.local_coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message)
		};
	}
}
