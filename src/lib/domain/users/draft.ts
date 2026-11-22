import { mintUuid } from '../shared';
import { SYSTEM_CAPABILITIES } from './enums';
import type { CapabilitySource, RoleTone } from './enums';
import type { SuggestionDismissal } from './suggestion-dismissals';

/* ── Entities (mirror of Unspaghettit feature 33b2f79d entities) ──────── */

export interface Role {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly userCountMin: number;
	readonly userCountMax: number | null;
	readonly tone: RoleTone;
	/** Ids from the project Documents & Sources register that evidence this persona. */
	readonly sourceIds: string[];
	/**
	 * How the behaviour reads this role: the state values a person in it starts
	 * with (`session.workspaceRole` = `admin`). What ties the role of the matrix to
	 * the role a guard reads, so the two can be compared (criteria 8763ca70 and
	 * 26262450 of feat-access-matrix). Absent or empty: the role is not compared.
	 */
	readonly behaviorValues?: readonly RoleBehaviorValue[];
}

/** One state value a person in a role starts with in the behaviour. */
export interface RoleBehaviorValue {
	readonly path: string;
	readonly value: string | number | boolean | null;
}

export interface OffStructureCapability {
	readonly id: string;
	readonly label: string;
	readonly note: string | null;
}

/**
 * One access: the role has access to the capability. A grant carries no verb
 * (owner decision of 2026-11-02, criterion ac-leaf-ac-matrix-1 of
 * feat-access-matrix): adding, editing or deleting something are actions of the
 * model, each its own capability, so they are granted like any other. A role and
 * a capability hold one grant at most, and no grant means no access.
 */
export interface PermissionGrant {
	readonly roleId: string;
	readonly capabilityId: string;
	readonly capabilitySource: CapabilitySource;
}

export interface DerivedCapability {
	readonly id: string;
	readonly label: string;
	readonly source: 'feature' | 'journey' | 'surface';
	readonly sourceRefId: string;
	readonly sourceRefLabel: string;
	/** For surfaces: what it is in the product — page, dialog, panel, form, … */
	readonly surfaceKind?: string;
	/** For surfaces: the route the page answers on, when it has one. */
	readonly path?: string;
	/**
	 * For an action row: the leaf feature that declares it, and its name. The
	 * matrix groups action rows under their feature; `sourceRefId` stays the
	 * Core so screen access keeps grouping by Core.
	 */
	readonly featureId?: string;
	readonly featureLabel?: string;
}

/**
 * An action a feature's behavior declares, as a matrix row. The id carries the
 * feature, so a grant on an action can be read back as access to its feature
 * without the behavior kernel at hand.
 */
export const ACTION_CAPABILITY_PREFIX = 'action:';

export function actionCapabilityId(featureId: string, actionId: string): string {
	return `${ACTION_CAPABILITY_PREFIX}${featureId}:${actionId}`;
}

/** The feature an action row belongs to; null for any other capability. */
export function featureOfActionCapability(capabilityId: string): string | null {
	if (!capabilityId.startsWith(ACTION_CAPABILITY_PREFIX)) return null;
	const rest = capabilityId.slice(ACTION_CAPABILITY_PREFIX.length);
	const cut = rest.lastIndexOf(':');
	return cut > 0 ? rest.slice(0, cut) : null;
}

/** The action an action row stands for; null for any other capability. */
export function actionOfActionCapability(capabilityId: string): string | null {
	if (!capabilityId.startsWith(ACTION_CAPABILITY_PREFIX)) return null;
	const rest = capabilityId.slice(ACTION_CAPABILITY_PREFIX.length);
	const cut = rest.lastIndexOf(':');
	return cut > 0 && cut < rest.length - 1 ? rest.slice(cut + 1) : null;
}

/**
 * Step 03 draft. Persisted authored data only — derived capabilities
 * (`derivedFeatureCapabilities`, `derivedJourneyCapabilities`) live in the
 * store and are recomputed from the upstream-capability-provider port on
 * every load. Permissions are sparse: absent ⇒ "not granted".
 */
export interface ProjectUsersDraft {
	projectId: string;
	roles: Role[];
	offStructureCapabilities: OffStructureCapability[];
	permissions: PermissionGrant[];
	/**
	 * Suggested personas the author removed, as a kept history of decisions:
	 * suggestions are recomputed on every load, so a dismissal has to travel
	 * with the section or the card would come back. Append-only on save.
	 */
	dismissedSuggestions: SuggestionDismissal[];
	lastSavedAt: string | null;
}

export function createEmptyUsersDraft(projectId: string): ProjectUsersDraft {
	return {
		projectId,
		roles: [],
		offStructureCapabilities: [],
		permissions: [],
		dismissedSuggestions: [],
		lastSavedAt: null
	};
}

/** Generic stable-id factory for new in-memory rows; replaced by uuid v4 in tests if needed. */
function newId(): string {
	return mintUuid();
}

export function createRole(overrides: Partial<Role> = {}): Role {
	return {
		id: newId(),
		name: '',
		description: '',
		userCountMin: 1,
		userCountMax: null,
		tone: 'admin',
		sourceIds: [],
		...overrides
	};
}

export function createOffStructureCapability(
	overrides: Partial<OffStructureCapability> = {}
): OffStructureCapability {
	return { id: newId(), label: '', note: null, ...overrides };
}

/** Whether a role has access to a capability. */
export function hasGrant(
	grants: readonly PermissionGrant[],
	roleId: string,
	capabilityId: string
): boolean {
	return grants.some((g) => g.roleId === roleId && g.capabilityId === capabilityId);
}

export interface PermissionCoverage {
	/** Capabilities granted to ≥1 role. */
	readonly coveredCapabilities: number;
	/** All capabilities in scope (explicit System + off-structure + derived product capabilities). */
	readonly totalCapabilities: number;
	/** Roles holding ≥1 grant. */
	readonly coveredRoles: number;
	readonly totalRoles: number;
	/** Capabilities no role can perform — the orphans to fix. */
	readonly uncoveredCapabilityIds: readonly string[];
	/** Roles with no grant at all. */
	readonly uncoveredRoleIds: readonly string[];
	/** coveredCapabilities / totalCapabilities, 0–100. */
	readonly pct: number;
}

/**
 * Whether the permission matrix is meaningfully *wired*, measured as coverage,
 * not cell density: every capability should be granted to at least one role,
 * and every role should hold at least one capability. This matches what the
 * matrix is for (no orphan capability, no powerless role) without rewarding the
 * least-privilege-violating "everyone holds everything" that raw density does.
 *
 * System capabilities are optional product facilities: they enter scope only
 * when the author grants one. Off-structure and derived product capabilities
 * are explicit scope and remain mandatory. A capability counts as covered when
 * any role has access to it (for a feature, to it or to one of its actions).
 *
 * `reach` names, for a granted capability, the features it opens beyond its
 * own row (a surface of a feature, a page of the Core a feature belongs to):
 * a feature reached through a granted page is not one the matrix forgot
 * (criterion 02a56f3c). The Users domain cannot read pages and surfaces on
 * its own, so the caller that holds them passes the map.
 */
export function permissionCoverage(
	draft: ProjectUsersDraft,
	derivedCapabilityIds: readonly string[] = [],
	reach: Readonly<Record<string, readonly string[]>> = {}
): PermissionCoverage {
	const grantedSystemIds = new Set(
		draft.permissions
			.filter((permission) =>
				SYSTEM_CAPABILITIES.some((capability) => capability.id === permission.capabilityId)
			)
			.map((permission) => permission.capabilityId)
	);
	const capIds = [...new Set([
		...grantedSystemIds,
		...draft.offStructureCapabilities.map((c) => c.id),
		...derivedCapabilityIds
	])];
	// A feature is scored at feature level: any of its actions granted means
	// somebody can do something in it (the matrix itself grants per action).
	const holds = (roleId: string, capId: string): boolean =>
		draft.permissions.some(
			(g) =>
				g.roleId === roleId &&
				(g.capabilityId === capId ||
					featureOfActionCapability(g.capabilityId) === capId ||
					(reach[g.capabilityId]?.includes(capId) ?? false))
		);
	const uncoveredCapabilityIds = capIds.filter(
		(capId) => !draft.roles.some((r) => holds(r.id, capId))
	);
	const uncoveredRoleIds = draft.roles
		.filter((r) => !capIds.some((capId) => holds(r.id, capId)))
		.map((r) => r.id);
	const totalCapabilities = capIds.length;
	const coveredCapabilities = totalCapabilities - uncoveredCapabilityIds.length;
	return {
		coveredCapabilities,
		totalCapabilities,
		coveredRoles: draft.roles.length - uncoveredRoleIds.length,
		totalRoles: draft.roles.length,
		uncoveredCapabilityIds,
		uncoveredRoleIds,
		pct: totalCapabilities === 0 ? 0 : Math.round((coveredCapabilities / totalCapabilities) * 100)
	};
}
