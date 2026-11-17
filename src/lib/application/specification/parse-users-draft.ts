import {
	CAPABILITY_SOURCES,
	createEmptyUsersDraft,
	createOffStructureCapability,
	createRole,
	foldGrants,
	mergeSuggestionDismissals,
	ROLE_TONES,
	suggestionKey,
	type PermissionGrant,
	type ProjectUsersDraft,
	type RoleBehaviorValue,
	type SuggestionDismissal
} from '$domain/users';
import { parseStableRecords } from './parse-stable-records';

/**
 * How the behaviour reads a role (criterion 8763ca70 of feat-access-matrix): one
 * value per state path, the last one sent winning; an entry without a path, or
 * whose value is not a plain value, is not read. Absent when none is left, so a
 * role written before the field existed reads exactly as it did.
 */
function behaviorValuesOf(input: unknown): { behaviorValues?: RoleBehaviorValue[] } {
	if (!Array.isArray(input)) return {};
	const byPath = new Map<string, RoleBehaviorValue>();
	for (const candidate of input) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
		const entry = candidate as Record<string, unknown>;
		const path = typeof entry.path === 'string' ? entry.path.trim() : '';
		const value = entry.value;
		const plain = value === null || ['string', 'number', 'boolean'].includes(typeof value);
		if (!path || !plain) continue;
		byPath.set(path, { path, value: value as RoleBehaviorValue['value'] });
	}
	return byPath.size > 0 ? { behaviorValues: [...byPath.values()] } : {};
}

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
				: [],
			...behaviorValuesOf(record.behaviorValues)
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
	// One access per role and capability: a verb a line still carries is not read,
	// and the lines it repeated fold into one (criteria 8554bd0d, 464a725a).
	const permissions: PermissionGrant[] = [];
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
			permissions.push({
				roleId: record.roleId,
				capabilityId: record.capabilityId,
				capabilitySource: record.capabilitySource as PermissionGrant['capabilitySource']
			});
		}
	}

	const dismissedSuggestions = parseSuggestionDismissals(src.dismissedSuggestions);

	return {
		...base,
		projectId,
		roles,
		offStructureCapabilities,
		permissions: foldGrants(permissions),
		dismissedSuggestions
	};
}

/** A Users write as the save receives it: the draft, and what the payload carried that is no longer read. */
export interface UsersWrite {
	readonly draft: ProjectUsersDraft;
	/** One short note naming what was ignored, or null when nothing was. */
	readonly ignored: string | null;
}

/**
 * Parse a Users write, and say what it carried that a permission no longer
 * holds (criterion 464a725a of feat-access-matrix). An older agent or a cached
 * playbook may still send a verb per grant (`permissions[].action`) or a kind
 * per row (`capabilityProfiles`): the write is accepted, those are dropped, and
 * the answer says so instead of refusing what the author cannot act on.
 */
export function parseUsersWrite(input: unknown, projectId: string): UsersWrite {
	const draft = parseUsersDraft(input, projectId);
	const src = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const rows = Array.isArray(src.permissions) ? src.permissions : [];
	const withVerb = rows.filter((row) => row !== null && typeof row === 'object' && 'action' in row).length;
	const profiles = Array.isArray(src.capabilityProfiles) && src.capabilityProfiles.length > 0;
	const notes = [
		withVerb > 0
			? `permissions[].action ignored on ${withVerb} row(s): a permission carries no verb, it only says the role has access, and rows repeating one role and one capability were folded into one.`
			: '',
		profiles ? 'capabilityProfiles ignored: a row has no kind any more.' : ''
	].filter(Boolean);
	return { draft, ignored: notes.length > 0 ? notes.join(' ') : null };
}

/**
 * The history of dismissed suggestions, as written or as stored. A bare string
 * is the older shape (a lower-cased name and nothing else): it is kept as a
 * decision with no date and no author rather than dropped.
 */
export function parseSuggestionDismissals(raw: unknown): SuggestionDismissal[] {
	if (!Array.isArray(raw)) return [];
	let out: SuggestionDismissal[] = [];
	for (const item of raw) {
		const o = (typeof item === 'string' ? { name: item } : (item ?? {})) as Record<string, unknown>;
		const name = typeof o.name === 'string' ? o.name : '';
		if (!suggestionKey(name)) continue;
		out = mergeSuggestionDismissals(out, [
			{
				key: suggestionKey(name),
				name: name.trim(),
				rationale: typeof o.rationale === 'string' ? o.rationale : '',
				dismissedAt: typeof o.dismissedAt === 'string' ? o.dismissedAt : null,
				dismissedBy: typeof o.dismissedBy === 'string' ? o.dismissedBy : null
			}
		]);
	}
	return out;
}
