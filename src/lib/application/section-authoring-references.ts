import { SYSTEM_CAPABILITIES } from '$domain/users';
import type { SectionValidationIssue } from './section-authoring-schema';

/**
 * Referential integrity INSIDE one authored section payload.
 *
 * The parsers silently prune a row whose parent id does not exist — the right
 * call for a UI that cascades its own deletes, but the wrong signal for a
 * programmatic author: an invented `coreId` or `featureId` made half the write
 * disappear with a 200 and no explanation. Every check here is deterministic
 * (ids, not prose), and the wizard stores clean up their own references before
 * saving, so only an invented id can trip it.
 */

interface ReferenceCheck {
	/** Collection holding the reference, e.g. `mvpAssignments`. */
	readonly from: string;
	/** Field on each item that carries the id. */
	readonly field: string;
	/** Collection the id must exist in. */
	readonly to: string;
	/** What the target is called in the error message. */
	readonly label: string;
	/** `null` / `''` is a legitimate value (an unplaced or root-level row). */
	readonly optional?: boolean;
}

const SECTION_REFERENCES: Readonly<Record<string, readonly ReferenceCheck[]>> = {
	features: [
		{ from: 'families', field: 'coreId', to: 'cores', label: 'core' },
		{ from: 'families', field: 'parentFamilyId', to: 'families', label: 'family', optional: true },
		{ from: 'features', field: 'coreId', to: 'cores', label: 'core' },
		{ from: 'features', field: 'parentFamilyId', to: 'families', label: 'family', optional: true },
		{ from: 'mvpAssignments', field: 'featureId', to: 'features', label: 'leaf feature' },
		{ from: 'roadmapAssignments', field: 'featureId', to: 'features', label: 'leaf feature' },
		{ from: 'roadmapAssignments', field: 'releaseId', to: 'releases', label: 'release' }
	],
	data: [
		{ from: 'databases', field: 'hostId', to: 'hosts', label: 'host' },
		{ from: 'entities', field: 'databaseId', to: 'databases', label: 'database', optional: true },
		{ from: 'fields', field: 'entityId', to: 'entities', label: 'entity' },
		{ from: 'fields', field: 'parentFieldId', to: 'fields', label: 'parent field', optional: true },
		{
			from: 'fields',
			field: 'relationTargetEntityId',
			to: 'entities',
			label: 'relation target entity',
			optional: true
		}
	],
	users: [{ from: 'permissions', field: 'roleId', to: 'roles', label: 'role' }]
};

const list = (source: Record<string, unknown>, key: string): unknown[] =>
	Array.isArray(source[key]) ? (source[key] as unknown[]) : [];

const idsOf = (source: Record<string, unknown>, key: string): Set<string> =>
	new Set(
		list(source, key)
			.map((item) =>
				item && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined
			)
			.filter((id): id is string => typeof id === 'string')
	);

/** Ids of the built-in system capability catalog — the only valid `system` grants. */
const SYSTEM_CAPABILITY_IDS = new Set(SYSTEM_CAPABILITIES.map((capability) => capability.id));

export function validateSectionReferences(
	section: string,
	input: unknown
): SectionValidationIssue[] {
	const checks = SECTION_REFERENCES[section];
	if (!checks || !input || typeof input !== 'object' || Array.isArray(input)) return [];
	const source = input as Record<string, unknown>;
	const issues: SectionValidationIssue[] = [];
	const known = new Map<string, Set<string>>();

	for (const check of checks) {
		if (!Array.isArray(source[check.from])) continue;
		if (!known.has(check.to)) known.set(check.to, idsOf(source, check.to));
		const targets = known.get(check.to)!;

		list(source, check.from).forEach((item, index) => {
			if (!item || typeof item !== 'object') return;
			const value = (item as Record<string, unknown>)[check.field];
			if (value === undefined || value === null || value === '') {
				if (!check.optional) {
					issues.push({
						path: `${check.from}[${index}].${check.field}`,
						message: `is required — it must name an existing ${check.label} from this payload`
					});
				}
				return;
			}
			if (typeof value !== 'string' || targets.has(value)) return;
			issues.push({
				path: `${check.from}[${index}].${check.field}`,
				message: `references a ${check.label} that is not in this payload: "${value}". Author the ${check.label} in \`${check.to}[]\` first and reuse its exact id — an unknown reference is dropped on save`
			});
		});
	}

	if (section === 'users') {
		list(source, 'permissions').forEach((item, index) => {
			if (!item || typeof item !== 'object') return;
			const grant = item as Record<string, unknown>;
			if (grant.capabilitySource !== 'system') return;
			if (typeof grant.capabilityId !== 'string' || SYSTEM_CAPABILITY_IDS.has(grant.capabilityId))
				return;
			issues.push({
				path: `permissions[${index}].capabilityId`,
				message: `"${grant.capabilityId}" is not a system capability. Use an id from the built-in catalog (see describe_section enums), or declare your own row in offStructureCapabilities[] and grant it with capabilitySource "off_structure"`
			});
		});
	}

	return issues;
}
