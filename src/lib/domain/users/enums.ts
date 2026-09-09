/**
 * Closed vocabularies for Step 03 — Users & Permissions. Source of truth:
 * Unspaghettit feature `33b2f79d`. Codes are persisted; labels are display only.
 */

import type { Option } from '$domain/shared';

export const ROLE_TONES = [
	{ code: 'admin', label: 'Admin' },
	{ code: 'ops', label: 'Ops' },
	{ code: 'customer', label: 'Customer' },
	{ code: 'visitor', label: 'Visitor' },
	{ code: 'partner', label: 'Partner' }
] as const satisfies readonly Option[];
export type RoleTone = (typeof ROLE_TONES)[number]['code'];

export const CAPABILITY_SOURCES = [
	{ code: 'system', label: 'System' },
	{ code: 'feature', label: 'Feature' },
	{ code: 'journey', label: 'Journey' },
	{ code: 'surface', label: 'Surface' },
	{ code: 'off_structure', label: 'Off-structure' }
] as const satisfies readonly Option[];
export type CapabilitySource = (typeof CAPABILITY_SOURCES)[number]['code'];

/**
 * The verbs a grant can carry. A permission is not a single boolean per
 * (role × capability) — it is granted per verb, so the matrix can express
 * "sees the page but cannot submit it".
 *
 * CRUD alone only fits capabilities that ARE data. Most of a product isn't: a
 * page is opened, a workflow is run, a refund is approved, a report is
 * exported, a workspace is administered. Those verbs live here too, and which
 * subset applies to a given row is decided by its `CapabilityKind` (below) —
 * the matrix renders only the applicable ones instead of four CRUD boxes on
 * every row.
 *
 * `label` names the verb and `hint` defines it — both are read by the author in
 * the matrix's permission dropdown, which is why neither is optional and why
 * there is no one-letter code: a cell states its permissions in words.
 */
export const PERMISSION_ACTIONS = [
	{
		code: 'view',
		label: 'Visible',
		family: 'access',
		hint: 'The capability is visible to the role: the page/entry point is reachable at all.'
	},
	{
		code: 'create',
		label: 'Create',
		family: 'data',
		hint: 'Add new records.'
	},
	{ code: 'read', label: 'Read', family: 'data', hint: 'Read the records behind it.' },
	{
		code: 'update',
		label: 'Update',
		family: 'data',
		hint: 'Edit existing records, or submit the inputs of a surface.'
	},
	{ code: 'delete', label: 'Delete', family: 'data', hint: 'Remove records.' },
	{
		code: 'export',
		label: 'Export',
		family: 'data',
		hint: 'Extract the data out of the product (download, report, API pull).'
	},
	{
		code: 'execute',
		label: 'Execute',
		family: 'operation',
		hint: 'Run or trigger it: the action fires, the workflow starts.'
	},
	{
		code: 'approve',
		label: 'Approve',
		family: 'operation',
		hint: 'Validate, sign off or publish what someone else produced.'
	},
	{
		code: 'share',
		label: 'Share',
		family: 'governance',
		hint: 'Give someone else access to it.'
	},
	{
		code: 'manage',
		label: 'Manage',
		family: 'governance',
		hint: 'Administer it: settings, ownership, lifecycle.'
	}
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]['code'];
export type PermissionActionFamily = (typeof PERMISSION_ACTIONS)[number]['family'];

export const PERMISSION_ACTION_CODES: readonly PermissionAction[] = PERMISSION_ACTIONS.map(
	(a) => a.code
);

/**
 * Verbs the product does not offer YET. They stay in the vocabulary above —
 * grants that already carry them keep resolving, and nothing has to be migrated
 * when they come back — but they are not shown in the matrix and not accepted
 * from the MCP. Ten verbs was more choice than the matrix needs today; five is
 * the set an author can fill in without a legend.
 *
 * To offer one again: take it out of this set. Everything else — the labels,
 * the hints, the per-kind defaults, the parsing — is already in place.
 */
export const HIDDEN_PERMISSION_ACTIONS: ReadonlySet<string> = new Set<PermissionAction>([
	'export',
	'execute',
	'approve',
	'share',
	'manage'
]);

/** The verbs actually offered — in the matrix and over the MCP. */
export const ACTIVE_PERMISSION_ACTIONS = PERMISSION_ACTIONS.filter(
	(a) => !HIDDEN_PERMISSION_ACTIONS.has(a.code)
);

export const ACTIVE_PERMISSION_ACTION_CODES: readonly PermissionAction[] =
	ACTIVE_PERMISSION_ACTIONS.map((a) => a.code);

/**
 * What a matrix row *is* — the single input that decides which verbs apply to
 * it. Kept deliberately small: authors pick a kind, not ten checkboxes, and the
 * verb list follows. An author (or an LLM through the MCP) can still override
 * the verb list per row when the defaults don't fit.
 */
export const CAPABILITY_KINDS = [
	{
		code: 'data',
		label: 'Data',
		hint: 'Records the role acts on: the only kind CRUD really fits.'
	},
	{ code: 'action', label: 'Action', hint: 'Something the role performs or triggers.' },
	{
		code: 'surface',
		label: 'Surface',
		hint: 'A page, dialog, panel or form: anything that carries user input.'
	},
	{ code: 'journey', label: 'Journey', hint: 'An end-to-end flow across several surfaces.' },
	{
		code: 'governance',
		label: 'Governance',
		hint: 'Administration of the product itself: members, permissions, settings, audit.'
	}
] as const satisfies readonly Option[];
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number]['code'];

/**
 * The verbs each kind exposes by default. Ordered as the matrix renders them:
 * `view` always first, because "can the role even see this?" is the question
 * that precedes every other one.
 */
export const DEFAULT_ACTIONS_BY_KIND: Readonly<Record<CapabilityKind, readonly PermissionAction[]>> =
	{
		data: ['view', 'create', 'read', 'update', 'delete', 'export'],
		action: ['view', 'execute', 'approve'],
		surface: ['view', 'read', 'update', 'execute'],
		journey: ['view', 'execute', 'approve'],
		governance: ['view', 'manage', 'approve', 'share']
	};

/** The kind a row gets when nothing has been authored for it. */
export const DEFAULT_KIND_BY_SOURCE: Readonly<Record<CapabilitySource, CapabilityKind>> = {
	system: 'governance',
	feature: 'action',
	journey: 'journey',
	surface: 'surface',
	off_structure: 'action'
};

/**
 * The four fixed System capabilities every project gets out of the box.
 * Verbatim from the spec's `users.systemCapabilities` default value.
 */
export const SYSTEM_CAPABILITIES: readonly { id: string; label: string }[] = [
	{ id: 'invite_revoke_member', label: 'Invite / revoke a member' },
	{ id: 'edit_permissions', label: 'Edit permissions' },
	{ id: 'view_audit_logs', label: 'View audit logs' },
	{ id: 'delete_account', label: 'Delete account' }
];

export const SYSTEM_CAPABILITY_IDS: ReadonlySet<string> = new Set(
	SYSTEM_CAPABILITIES.map((c) => c.id)
);
