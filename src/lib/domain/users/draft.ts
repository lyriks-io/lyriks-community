import {
	ACTIVE_PERMISSION_ACTION_CODES,
	DEFAULT_KIND_BY_SOURCE,
	HIDDEN_PERMISSION_ACTIONS,
	SYSTEM_CAPABILITIES
} from './enums';
import type { CapabilityKind, CapabilitySource, PermissionAction, RoleTone } from './enums';

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
}

export interface OffStructureCapability {
	readonly id: string;
	readonly label: string;
	readonly note: string | null;
}

export interface PermissionGrant {
	readonly roleId: string;
	readonly capabilityId: string;
	readonly capabilitySource: CapabilitySource;
	/** The verb this grant authorises. Legacy grants may omit it (≈ all verbs). */
	readonly action?: PermissionAction;
}

/**
 * Per-capability typing of a matrix row: what it *is*, and therefore which
 * permission verbs the matrix offers on it. Sparse — a row with no profile uses
 * `DEFAULT_KIND_BY_SOURCE` for its source. Authored by the user in the matrix
 * (or by an LLM through the MCP), never derived, so it is persisted here.
 */
export interface CapabilityProfile {
	readonly capabilityId: string;
	readonly kind: CapabilityKind;
	/** Explicit verb list; absent ⇒ the kind's defaults. */
	readonly actions?: PermissionAction[];
}

export interface DerivedCapability {
	readonly id: string;
	readonly label: string;
	readonly source: 'feature' | 'journey' | 'surface';
	readonly sourceRefId: string;
	readonly sourceRefLabel: string;
	/**
	 * Kind suggested by the upstream context (a dialog is a `surface`, a leaf
	 * feature an `action`, …). An authored `CapabilityProfile` overrides it.
	 */
	readonly kind?: CapabilityKind;
	/** For surfaces: what it is in the product — page, dialog, panel, form, … */
	readonly surfaceKind?: string;
	/** For surfaces: the route the page answers on, when it has one. */
	readonly path?: string;
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
	/** Sparse per-row typing; absent ⇒ the source's default kind. */
	capabilityProfiles: CapabilityProfile[];
	lastSavedAt: string | null;
}

export function createEmptyUsersDraft(projectId: string): ProjectUsersDraft {
	return {
		projectId,
		roles: [],
		offStructureCapabilities: [],
		permissions: [],
		capabilityProfiles: [],
		lastSavedAt: null
	};
}

/** Generic stable-id factory for new in-memory rows; replaced by uuid v4 in tests if needed. */
function newId(): string {
	return crypto.randomUUID();
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

/**
 * Look up a grant by composite key; v0 is O(n) — fine for the tens-of-rows
 * scale. When `action` is omitted the check is action-agnostic ("does this role
 * have *any* access to this capability?") — that is what the coherence /
 * can-advance / experience callers want. When an `action` is passed the grant
 * must match it (a legacy action-less grant counts as authorising every action).
 */
export function hasGrant(
	grants: readonly PermissionGrant[],
	roleId: string,
	capabilityId: string,
	action?: PermissionAction
): boolean {
	return grants.some(
		(g) =>
			g.roleId === roleId &&
			g.capabilityId === capabilityId &&
			(action === undefined || g.action === undefined || g.action === action)
	);
}

/* ── Row typing: which verbs a capability actually accepts ────────────── */

/**
 * The kind of a matrix row: the authored profile wins, then the kind the
 * upstream context suggested (a dialog is a surface), then the source default.
 */
export function capabilityKindOf(
	profiles: readonly CapabilityProfile[],
	capabilityId: string,
	source: CapabilitySource,
	suggested?: CapabilityKind
): CapabilityKind {
	const profile = profiles.find((p) => p.capabilityId === capabilityId);
	return profile?.kind ?? suggested ?? DEFAULT_KIND_BY_SOURCE[source];
}

/**
 * The permission verbs a row offers.
 *
 * While the vocabulary is reduced to the five essentials (see
 * `HIDDEN_PERMISSION_ACTIONS`), the row's KIND no longer narrows the list:
 * intersecting a kind's defaults with the active verbs would leave an `action`
 * row offering nothing but "Visible". So every row offers the same five, and a
 * profile may still narrow *within* them — which is what a legacy authored
 * override means once its hidden verbs are filtered out.
 *
 * Never empty: a row with nothing grantable would read as an orphan capability
 * forever, so an override that survives no filtering falls back to the five.
 */
export function capabilityActions(
	profiles: readonly CapabilityProfile[],
	capabilityId: string,
	_source: CapabilitySource,
	_suggested?: CapabilityKind
): readonly PermissionAction[] {
	const override = profiles
		.find((p) => p.capabilityId === capabilityId)
		?.actions?.filter((a) => !HIDDEN_PERMISSION_ACTIONS.has(a));
	return override?.length ? override : ACTIVE_PERMISSION_ACTION_CODES;
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
 * any role holds any action on it.
 */
export function permissionCoverage(
	draft: ProjectUsersDraft,
	derivedCapabilityIds: readonly string[] = []
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
	const uncoveredCapabilityIds = capIds.filter(
		(capId) => !draft.roles.some((r) => hasGrant(draft.permissions, r.id, capId))
	);
	const uncoveredRoleIds = draft.roles
		.filter((r) => !capIds.some((capId) => hasGrant(draft.permissions, r.id, capId)))
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
