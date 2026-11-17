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
