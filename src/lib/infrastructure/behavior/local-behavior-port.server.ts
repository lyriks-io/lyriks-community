import type {
	BehaviorApplyReport,
	BehaviorOp,
	BehaviorPort,
	BehaviorRepositoryPort,
	ClockPort
} from '$application/ports';
import {
	mergeFeatureInvariants,
	mergeMirroredEntities,
	mergeMirroredEvents,
	mergeMirroredPersonas,
	mergeMirroredResources,
	mergeMirroredSurfaces,
	mergePersonas,
	mergeSurfaces,
	pruneOrphanedReachabilityGoals
} from '$application/projection/merge-unspa-behavior';
import {
	UNSPA_FEATURE_FORMAT,
	UNSPA_PROJECT_FORMAT,
	UNSPA_VERSION,
	type UnspaFeatureSnapshot,
	type UnspaProject,
	type UnspaProjectSnapshot,
	type UnspaTag
} from '$lib/unspa-schema';

/**
 * Behavior features carry per-element spec stamps (`elementVersions`), written
 * by the engine so drift can name the exact element that moved. Lyriks projects
 * INTO those features from its own sections, and it cannot recompute the stamps:
 * the digest that decides which element changed lives in the engine, which runs
 * as an optional subprocess and is not importable here.
 *
 * So a projection that rewrites element collections drops the map instead of
 * leaving it to describe content it no longer matches. Readers then fall back to
 * the feature-wide `updatedAt`, which is the coarse, noisy, SAFE answer, and the
 * next engine write recalibrates every element. Silently keeping stale stamps
 * would be the one unacceptable outcome: a changed element reading as clean.
 */
const withoutElementStamps = (feature: Record<string, unknown>): Record<string, unknown> => {
	if (!('elementVersions' in feature)) return feature;
	const { elementVersions: _dropped, ...rest } = feature;
	return rest;
};

/**
 * Platform-native `BehaviorPort` — the MAP write path. Reads and writes the
 * canonical Unspaghettit-format store through a pure-`node:fs`
 * `BehaviorRepositoryPort`, folding `BehaviorOp`s in memory then persisting. No
 * unspa engine, no DPO, no HTTP: an edit lands with both engines OFF, which is
 * exactly what the Minimal Autonomous Product requires.
 *
 * `apply` loads the current project + touched features, mutates copies, and saves
 * once — so a batch is one coherent transition of the kernel.
 */
export class LocalBehaviorPort implements BehaviorPort {
	constructor(
		private readonly repo: BehaviorRepositoryPort,
		private readonly clock: ClockPort
	) {}

	readProject(projectId: string): Promise<UnspaProjectSnapshot | null> {
		return this.repo.loadProject(projectId);
	}

	readFeature(projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> {
		return this.repo.loadFeature(projectId, featureId);
	}

	workspaceRoot(): string {
		return this.repo.workspaceRoot();
	}

	async apply(projectId: string, ops: BehaviorOp[]): Promise<BehaviorApplyReport> {
		const warnings: string[] = [];
		if (ops.length === 0) return { warnings };
		const now = this.clock.nowIso();

		const existingProject = await this.repo.loadProject(projectId);
		let project: UnspaProject = existingProject?.project ?? {
			id: projectId,
			name: projectId,
			description: `Lyriks project ${projectId}.`,
			tags: [],
			featureIds: [],
			createdAt: now,
			updatedAt: now
		};
		let projectTouched = existingProject === null;

		for (const op of ops) {
			switch (op.kind) {
				case 'upsertFeatureShell': {
					const existing = await this.repo.loadFeature(projectId, op.featureId);
					await this.repo.saveFeature(
						projectId,
						this.#featureShell(existing, op.featureId, op.name, op.description, op.tags, now)
					);
					break;
				}
				case 'setFeatureTags': {
					await this.#patchFeature(projectId, op.featureId, now, { tags: op.tags });
					break;
				}
				case 'renameFeature': {
					const patch: Record<string, unknown> = { name: op.name };
					if (op.description !== undefined) patch.description = op.description;
					await this.#patchFeature(projectId, op.featureId, now, patch);
					break;
				}
				case 'removeFeature': {
					// The store has no per-feature delete (mirrors today's behavior); delist
					// it from the project so it stops surfacing. The file is left in place.
					project = { ...project, featureIds: project.featureIds.filter((id) => id !== op.featureId) };
					projectTouched = true;
					break;
				}
				case 'setProjectFeatureIds': {
					project = { ...project, featureIds: [...op.featureIds] };
					projectTouched = true;
					break;
				}
				case 'ensureProjectFeatureId': {
					if (!project.featureIds.includes(op.featureId)) {
						project = { ...project, featureIds: [...project.featureIds, op.featureId] };
						projectTouched = true;
					}
					break;
				}
				case 'upsertDataModelFeature': {
					const existing = await this.repo.loadFeature(projectId, op.featureId);
					await this.repo.saveFeature(
						projectId,
						this.#dataModelShell(existing, op, now)
					);
					break;
				}
				case 'mirrorFeatureData': {
					const existing = await this.repo.loadFeature(projectId, op.featureId);
					if (!existing) break; // enrich only what a leaf already authored
					const feat = existing.feature as Record<string, unknown>;
					// Additive for the same reason as `mirrorFeatureBehavior`: the leaf is
					// unspa's, so an entity authored there outlives a Data section save.
					// Lyriks-owned copies the projection no longer produces ARE pruned —
					// the op fires for every leaf so stale mirrors cannot linger.
					const entities = mergeMirroredEntities(op.entities, feat.entities);
					const resources = mergeMirroredResources(op.resources, feat.resources);
					const unchanged =
						JSON.stringify(entities) === JSON.stringify(feat.entities ?? []) &&
						JSON.stringify(resources) === JSON.stringify(feat.resources ?? []);
					if (unchanged) break; // a save must not touch every leaf file for nothing
					await this.repo.saveFeature(projectId, {
						...existing,
						feature: withoutElementStamps({
							...feat,
							id: op.featureId,
							entities,
							resources,
							updatedAt: now
						})
					});
					break;
				}
				case 'upsertExperienceFeature': {
					const existing = await this.repo.loadFeature(projectId, op.featureId);
					await this.repo.saveFeature(projectId, this.#experienceShell(existing, op, now));
					break;
				}
				case 'mirrorFeatureBehavior': {
					const existing = await this.repo.loadFeature(projectId, op.featureId);
					if (!existing) break; // enrich only what a leaf already authored
					const feat = existing.feature as Record<string, unknown>;
					// A leaf belongs to unspa; this op only lifts its Core's journeys onto
					// it. So the merge is ADDITIVE — surfaces/personas/events authored in
					// the engine survive an Experience save that never mentioned them.
					const mirroredSurfaces = mergeMirroredSurfaces(op.surfaces, feat.surfaces);
					await this.repo.saveFeature(projectId, {
						...existing,
						feature: withoutElementStamps({
							...feat,
							id: op.featureId,
							surfaces: mirroredSurfaces,
							personas: mergeMirroredPersonas(op.personas, feat.personas),
							events: mergeMirroredEvents(op.events, feat.events),
							// Even the additive mirror can drop a Lyriks-owned surface the
							// user deleted; goals whose paths left with it must not dangle.
							...(feat.reachabilityGoals !== undefined
								? {
										reachabilityGoals: pruneOrphanedReachabilityGoals(
											feat.reachabilityGoals,
											mirroredSurfaces
										)
									}
								: {}),
							updatedAt: now
						})
					});
					break;
				}
				case 'mirrorFeatureAcceptance': {
					const existing = await this.repo.loadFeature(projectId, op.featureId);
					if (!existing) break; // enrich only what a feature already authored
					const feat = existing.feature as Record<string, unknown>;
					await this.repo.saveFeature(projectId, {
						...existing,
						feature: {
							...feat,
							id: op.featureId,
							acceptanceCriteria: mergeAcceptanceById(
								(feat.acceptanceCriteria as Record<string, unknown>[] | undefined) ?? [],
								op.acceptanceCriteria
							),
							updatedAt: now
						}
					});
					break;
				}
				case 'setProjectTags': {
					project = { ...project, tags: [...op.tags] };
					projectTouched = true;
					break;
				}
				case 'setProjectMeta': {
					project = {
						...project,
						...(op.name !== undefined ? { name: op.name } : {}),
						...(op.description !== undefined ? { description: op.description } : {})
					};
					projectTouched = true;
					break;
				}
			}
		}

		if (projectTouched) {
			const snapshot: UnspaProjectSnapshot = {
				format: UNSPA_PROJECT_FORMAT,
				version: UNSPA_VERSION,
				project: { ...project, id: projectId, updatedAt: now }
			};
			await this.repo.saveProject(snapshot);
		}
		return { warnings };
	}

	/** Merge a partial patch onto an existing feature; no-op if it doesn't exist. */
	async #patchFeature(
		projectId: string,
		featureId: string,
		now: string,
		patch: Record<string, unknown>
	): Promise<void> {
		const existing = await this.repo.loadFeature(projectId, featureId);
		if (!existing) return;
		await this.repo.saveFeature(projectId, {
			...existing,
			feature: { ...(existing.feature as Record<string, unknown>), ...patch, id: featureId, updatedAt: now }
		});
	}

	/**
	 * Build the central "Data Model" aux feature. Preserves whatever else lives on it
	 * (surfaces, personas, featureInvariants, createdAt), refreshes Lyriks-owned data
	 * nodes and preserves engine-owned entities/resources. Lyriks deletions still
	 * propagate by id ownership. New shells get the arrays the OSS engine indexes on.
	 */
	#dataModelShell(
		existing: UnspaFeatureSnapshot | null,
		op: {
			featureId: string;
			name: string;
			description: string;
			tags: UnspaTag[];
			entities: Record<string, unknown>[];
			resources: Record<string, unknown>[];
		},
		now: string
	): UnspaFeatureSnapshot {
		const prev = (existing?.feature as Record<string, unknown> | undefined) ?? {};
		return {
			format: UNSPA_FEATURE_FORMAT,
			version: UNSPA_VERSION,
			feature: withoutElementStamps({
				surfaces: [],
				personas: [],
				events: [],
				featureInvariants: [],
				...prev,
				id: op.featureId,
				name: op.name,
				description: op.description,
				resources: mergeMirroredResources(op.resources, prev.resources),
				entities: mergeMirroredEntities(op.entities, prev.entities),
				tags: op.tags,
				createdAt: (prev.createdAt as string | undefined) ?? now,
				updatedAt: now
			})
		};
	}

	/**
	 * Build the central "Experience" aux feature. MERGES the projected surfaces/
	 * personas with what's on disk so behavioral depth authored in unspa (rules,
	 * invariants, action parameters, scenarios, state definitions — the "detail a
	 * feature in unspa" facet) survives a Lyriks re-projection; Lyriks owns identity/
	 * structure so surfaces/personas the projection no longer produces are dropped.
	 * Events are Lyriks-owned and replaced wholesale. New shells get the empty arrays
	 * the OSS engine indexes on.
	 */
	#experienceShell(
		existing: UnspaFeatureSnapshot | null,
		op: {
			featureId: string;
			name: string;
			description: string;
			tags: UnspaTag[];
			surfaces: Record<string, unknown>[];
			personas: Record<string, unknown>[];
			events: Record<string, unknown>[];
		},
		now: string
	): UnspaFeatureSnapshot {
		const prev = (existing?.feature as Record<string, unknown> | undefined) ?? {};
		const surfaces = mergeSurfaces(op.surfaces, prev.surfaces);
		return {
			format: UNSPA_FEATURE_FORMAT,
			version: UNSPA_VERSION,
			feature: withoutElementStamps({
				resources: [],
				entities: [],
				...prev,
				id: op.featureId,
				name: op.name,
				description: op.description,
				surfaces,
				personas: mergePersonas(op.personas, prev.personas),
				events: op.events,
				featureInvariants: mergeFeatureInvariants([], prev.featureInvariants),
				// This path never runs the engine validator, so a goal whose state
				// paths left with a dropped surface must be pruned here or it
				// dangles forever (see pruneOrphanedReachabilityGoals).
				...(prev.reachabilityGoals !== undefined
					? {
							reachabilityGoals: pruneOrphanedReachabilityGoals(
								prev.reachabilityGoals,
								surfaces
							)
						}
					: {}),
				tags: op.tags,
				createdAt: (prev.createdAt as string | undefined) ?? now,
				updatedAt: now
			})
		};
	}

	/**
	 * Build a leaf feature shell. When one already exists we preserve its content
	 * (surfaces, createdAt, and anything later wizard steps wrote) and only refresh
	 * the identity/tag fields. New shells get the empty arrays the OSS engine indexes
	 * on — notably `featureInvariants`, whose absence crashes `get_feature` /
	 * `score_feature` with a `localeCompare` on undefined.
	 */
	#featureShell(
		existing: UnspaFeatureSnapshot | null,
		id: string,
		name: string,
		description: string,
		tags: UnspaTag[],
		now: string
	): UnspaFeatureSnapshot {
		return {
			format: UNSPA_FEATURE_FORMAT,
			version: UNSPA_VERSION,
			feature: existing
				? {
						...(existing.feature as Record<string, unknown>),
						id,
						name: name || '<unnamed feature>',
						description: description || `Lyriks Feature ${id}`,
						tags,
						updatedAt: now
					}
				: {
						id,
						name: name || '<unnamed feature>',
						description: description || `Lyriks Feature ${id}`,
						surfaces: [],
						personas: [],
						resources: [],
						entities: [],
						events: [],
						featureInvariants: [],
						createdAt: now,
						updatedAt: now,
						tags
					}
		};
	}
}

/**
 * Merge acceptance-criteria lists. Lyriks owns the `ac-edge-*` rows (projected from
 * Step-06 edge cases): they are replaced wholesale by the incoming set, so a deleted
 * edge case drops its criterion. Criteria authored elsewhere (e.g. the unspa
 * dashboard) are preserved, unless the incoming set reuses their id.
 */
function mergeAcceptanceById(
	existing: Record<string, unknown>[],
	incoming: Record<string, unknown>[]
): Record<string, unknown>[] {
	const incomingIds = new Set(incoming.map((c) => String(c.id ?? '')));
	const preserved = existing.filter((c) => {
		const id = String(c.id ?? '');
		return !id.startsWith('ac-edge-') && !incomingIds.has(id);
	});
	return [...preserved, ...incoming];
}
