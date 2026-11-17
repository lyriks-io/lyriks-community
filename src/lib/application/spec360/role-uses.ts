import { sortByName } from '$domain/shared';
import { anchorDomId, anchorOf } from '$domain/discussions';
import type { ProjectExperienceDraft } from '$domain/experience';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import { featureOfActionCapability, type ProjectUsersDraft } from '$domain/users';
import { counted, text } from './labels';

/**
 * Where the rest of the specification uses a user: the rights it holds (each
 * one a permission, the actions of features it may do), the journeys it
 * performs, the symptoms of the problem it suffers from. A user used anywhere
 * cannot be deleted: deleting it would leave those places pointing at no one.
 * Pure: the sections arrive read.
 */

export interface RoleUse {
	readonly kind: 'feature' | 'permissions' | 'journey' | 'symptom';
	readonly label: string;
	/** Where it reads, under `/spec`: '' is At a glance, a hash names the block. */
	readonly path: string;
}

export interface RoleUses {
	/** "Used by 3 features, 2 permissions and 1 journey"; '' when unused. */
	readonly summary: string;
	readonly uses: readonly RoleUse[];
}

export interface RoleUseSources {
	readonly users: Pick<ProjectUsersDraft, 'permissions'>;
	readonly features: Pick<ProjectFeaturesDraft, 'features'>;
	readonly experience: Pick<ProjectExperienceDraft, 'journeys'>;
	readonly definition: Pick<FoundationDefinitionDraft, 'businessObjective'>;
}

function list(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? '';
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function roleUses(roleId: string, sources: RoleUseSources): RoleUses {
	const grants = sources.users.permissions.filter((g) => g.roleId === roleId);
	const featureName = new Map(sources.features.features.map((f) => [f.id, text(f.name) || f.id]));
	// A right on one action of a feature, or on the feature itself.
	const featureOf = (capabilityId: string) => featureOfActionCapability(capabilityId) ?? (featureName.has(capabilityId) ? capabilityId : null);
	// Inside each kind, from A to Z (criterion 4b3d2b4d).
	const featureIds = sortByName([...new Set(grants.map((g) => featureOf(g.capabilityId)).filter((id): id is string => !!id && featureName.has(id)))], (id) => featureName.get(id)!);
	const journeys = sortByName(
		sources.experience.journeys.filter((j) => j.actorRoleIds.includes(roleId)),
		(j) => text(j.name) || j.id
	);
	const symptoms = sources.definition.businessObjective.painPointLinks.filter((p) => p.roleIds.includes(roleId));

	const uses: RoleUse[] = [
		...featureIds.map((id) => ({ kind: 'feature' as const, label: featureName.get(id)!, path: `features/${encodeURIComponent(id)}` })),
		...(grants.length > 0 ? [{ kind: 'permissions' as const, label: `Permissions · ${counted(grants.length, 'right')}`, path: `users#${anchorDomId('permissions')}` }] : []),
		...journeys.map((j) => ({ kind: 'journey' as const, label: `Journey · ${text(j.name) || j.id}`, path: `experience#${anchorDomId(anchorOf('journey', j.id))}` })),
		...symptoms.map((p) => ({ kind: 'symptom' as const, label: `Symptom · ${text(p.text)}`, path: `#${anchorDomId('problem')}` }))
	];
	const parts = [
		featureIds.length ? counted(featureIds.length, 'feature') : '',
		grants.length ? counted(grants.length, 'permission') : '',
		journeys.length ? counted(journeys.length, 'journey') : '',
		symptoms.length ? counted(symptoms.length, 'symptom') : ''
	].filter(Boolean);
	return { summary: parts.length ? `Used by ${list(parts)}` : '', uses };
}
