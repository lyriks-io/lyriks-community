import {
	CAPABILITY_KINDS,
	CAPABILITY_SOURCES,
	createEmptyUsersDraft,
	createOffStructureCapability,
	createRole,
	PERMISSION_ACTIONS,
	ROLE_TONES,
	type CapabilityProfile,
	type PermissionAction,
	type PermissionGrant,
	type ProjectUsersDraft
} from '$domain/users';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 03 payloads (HTTP body). Merges
 * over fresh defaults so every key exists with the right shape and pins the
 * projectId from the trusted source. Mirror of parseIdentityDraft / parseDefinitionDraft.
 */
export function parseUsersDraft(input: unknown, projectId: string): ProjectUsersDraft {
	const base = createEmptyUsersDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const str = (value: unknown): string => (typeof value === 'string' ? value : '');
	const roles = parseStableRecords(src.roles, 'role', (record, id) =>
		createRole({
			id,
			name: str(record.name),
			description: str(record.description),
			userCountMin:
				typeof record.userCountMin === 'number' && Number.isFinite(record.userCountMin)
					? Math.max(0, record.userCountMin)
					: 1,
			userCountMax:
				record.userCountMax === null
					? null
					: typeof record.userCountMax === 'number' && Number.isFinite(record.userCountMax)
						? Math.max(0, record.userCountMax)
						: null,
			tone: ROLE_TONES.some((tone) => tone.code === record.tone)
				? (record.tone as ProjectUsersDraft['roles'][number]['tone'])
				: 'admin',
			sourceIds: Array.isArray(record.sourceIds)
				? record.sourceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
				: []
		})
	);
	const roleIds = new Set(roles.map((role) => role.id));
	const offStructureCapabilities = parseStableRecords(
		src.offStructureCapabilities,
		'capability',
		(record, id) =>
			createOffStructureCapability({
				id,
				label: str(record.label),
				note: typeof record.note === 'string' ? record.note : null
			})
	);
	const permissions: PermissionGrant[] = [];
	const seenPermissions = new Set<string>();
	if (Array.isArray(src.permissions)) {
		for (const candidate of src.permissions) {
			if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
			const record = candidate as Record<string, unknown>;
			if (
				typeof record.roleId !== 'string' ||
				!roleIds.has(record.roleId) ||
				typeof record.capabilityId !== 'string' ||
				!CAPABILITY_SOURCES.some((source) => source.code === record.capabilitySource)
			) continue;
			const action = PERMISSION_ACTIONS.some((item) => item.code === record.action)
				? (record.action as PermissionGrant['action'])
				: undefined;
			const key = `${record.roleId}\u0000${record.capabilityId}\u0000${record.capabilitySource}\u0000${action ?? '*'}`;
			if (seenPermissions.has(key)) continue;
			seenPermissions.add(key);
			permissions.push({
				roleId: record.roleId,
				capabilityId: record.capabilityId,
				capabilitySource: record.capabilitySource as PermissionGrant['capabilitySource'],
				...(action ? { action } : {})
			});
		}
	}
	// Row typing: what each capability IS, and therefore which verbs the matrix
	// offers on it. One profile per capability — a later duplicate is dropped, so
	// a sloppy payload can't make a row's verb list ambiguous.
	const capabilityProfiles: CapabilityProfile[] = [];
	const seenProfiles = new Set<string>();
	if (Array.isArray(src.capabilityProfiles)) {
		for (const candidate of src.capabilityProfiles) {
			if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
			const record = candidate as Record<string, unknown>;
			if (typeof record.capabilityId !== 'string' || !record.capabilityId) continue;
			if (!CAPABILITY_KINDS.some((kind) => kind.code === record.kind)) continue;
			if (seenProfiles.has(record.capabilityId)) continue;
			seenProfiles.add(record.capabilityId);
			const actions = Array.isArray(record.actions)
				? (record.actions.filter(
						(action) => PERMISSION_ACTIONS.some((item) => item.code === action)
					) as PermissionAction[])
				: undefined;
			capabilityProfiles.push({
				capabilityId: record.capabilityId,
				kind: record.kind as CapabilityProfile['kind'],
				...(actions?.length ? { actions: [...new Set(actions)] } : {})
			});
		}
	}

	return {
		...base,
		projectId,
		roles,
		offStructureCapabilities,
		permissions,
		capabilityProfiles
	};
}
