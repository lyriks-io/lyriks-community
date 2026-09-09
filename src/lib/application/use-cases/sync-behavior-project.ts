import type { FoundationIdentityDraft } from '$domain/foundation';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import {
	UNSPA_PROJECT_FORMAT,
	UNSPA_VERSION,
	type UnspaProjectSnapshot,
	type UnspaTag
} from '$lib/unspa-schema';

import type {
	BehaviorRepositoryPort,
	ClockPort,
	FoundationDefinitionRepositoryPort,
	ProjectMirrorPort
} from '../ports';

/**
 * Mirrors the Lyriks wizard envelope into the project's Unspaghettit workspace.
 * Idempotent — safe to call on every load and every save. The behavior model
 * itself (features, surfaces, actions…) is authored by later wizard steps; this
 * use case only keeps the project's metadata + tags in sync so the OSS
 * dashboard shows a meaningful project header.
 *
 * Persistence is delegated to `ProjectMirrorPort` — the back is the single
 * writer to `data/unspa/<projectId>/` and the only process that pings the
 * dashboard. When the back is disabled (no LYRIKS_BACK_URL), propagation is
 * a strict no-op; v3 still computes the snapshot for callers but nothing
 * lands on disk.
 */
export class SyncBehaviorProjectUseCase {
	constructor(
		private readonly behavior: BehaviorRepositoryPort,
		private readonly back: ProjectMirrorPort,
		private readonly clock: ClockPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort
	) {}

	async execute(draft: FoundationIdentityDraft): Promise<UnspaProjectSnapshot> {
		const [existing, definition] = await Promise.all([
			this.behavior.loadProject(draft.projectId),
			this.definitionDrafts.load(draft.projectId)
		]);
		const now = this.clock.nowIso();

		const snapshot: UnspaProjectSnapshot = {
			format: UNSPA_PROJECT_FORMAT,
			version: UNSPA_VERSION,
			project: {
				id: draft.projectId,
				name: (draft.productName || '').trim() || draft.projectId,
				description: describeDraft(draft, definition),
				tags: tagsFromDrafts(draft, definition),
				featureIds: existing?.project.featureIds ?? [],
				createdAt: existing?.project.createdAt ?? now,
				updatedAt: now
			}
		};

		await this.back.propagateProject(draft.projectId, snapshot);
		return snapshot;
	}
}

function describeDraft(draft: FoundationIdentityDraft, definition: FoundationDefinitionDraft | null): string {
	const trimmedBrief = draft.brief.trim();
	if (trimmedBrief) return trimmedBrief.length > 280 ? `${trimmedBrief.slice(0, 277)}…` : trimmedBrief;
	const mainProblem = definition?.businessObjective.mainProblem.trim() ?? '';
	if (mainProblem) return mainProblem;
	return `Lyriks wizard project ${draft.projectId}.`;
}

/**
 * Project tags = identity facets + the Step 02 definition facets that are
 * stable enough to filter projects by in the dashboard (integrations,
 * auth, certifications, regulations, claimed category). Deduped; empty values
 * skipped. The detailed definition model still rides in the back envelope — these
 * tags are just the coarse, filterable surface.
 */
function tagsFromDrafts(
	draft: FoundationIdentityDraft,
	definition: FoundationDefinitionDraft | null
): UnspaTag[] {
	const tags: UnspaTag[] = [{ type: 'origin', value: 'lyriks-wizard' }];
	if (draft.industry) tags.push({ type: 'industry', value: draft.industry });
	if (draft.productType) tags.push({ type: 'product-type', value: draft.productType });
	for (const ff of draft.formFactors) tags.push({ type: 'form-factor', value: ff });

	if (definition) {
		push(tags, 'market-type', definition.market.marketType);
		for (const integ of definition.technical.integrations) push(tags, 'integration', integ.system);
		for (const auth of definition.security.authentication) push(tags, 'auth', auth);
		for (const cert of definition.security.expectedCertifications) push(tags, 'certification', cert);
		for (const reg of definition.market.regulations) push(tags, 'regulation', reg);
		push(tags, 'category', definition.competition.claimedCategory);
	}

	return dedupe(tags);
}

/** Append a tag if the value is a non-empty string (trimmed). */
function push(tags: UnspaTag[], type: string, value: string): void {
	const v = (value ?? '').trim();
	if (v.length > 0) tags.push({ type, value: v });
}

function dedupe(tags: UnspaTag[]): UnspaTag[] {
	const seen = new Set<string>();
	return tags.filter((t) => {
		const key = `${t.type}:${t.value}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
