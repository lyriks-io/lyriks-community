import { SYSTEM_CAPABILITIES, capabilityActions, type CapabilitySource, type PermissionAction, type PermissionGrant, type ProjectUsersDraft } from '$domain/users';
import type { DerivedCapabilitiesSnapshot } from './use-cases/refresh-derived-capabilities';
import type { SectionValidationIssue } from './section-authoring-schema';

/** The same live capability universe as the permission matrix, with copyable wire values. */
export function capabilityRegistry(draft: ProjectUsersDraft, derived: DerivedCapabilitiesSnapshot) {
	const rows = [
		...SYSTEM_CAPABILITIES.map(c => ({ ...c, source: 'system' as CapabilitySource })),
		...draft.offStructureCapabilities.map(c => ({ id: c.id, label: c.label, source: 'off_structure' as CapabilitySource })),
		...derived.features, ...derived.journeys, ...derived.surfaces
	];
	return rows.map(row => ({ capabilityId: row.id, label: row.label, capabilitySource: row.source,
		actions: capabilityActions(draft.capabilityProfiles, row.id, row.source) }));
}

const grantKey = (grant: PermissionGrant): string =>
	`${grant.roleId}|${grant.capabilitySource}|${grant.capabilityId}|${grant.action ?? ''}`;

const resolves = (grant: PermissionGrant, known: ReadonlySet<string>): boolean =>
	known.has(`${grant.capabilitySource}:${grant.capabilityId}`);

function issueFor(
	grant: PermissionGrant,
	index: number,
	registry: ReturnType<typeof capabilityRegistry>
): SectionValidationIssue {
	const suggestion = registry.find(row => row.capabilitySource === grant.capabilitySource && row.capabilityId === `screen:${grant.capabilityId}`);
	return { path: `permissions[${index}].capabilityId`, message: `"${grant.capabilityId}" does not resolve as capabilitySource "${grant.capabilitySource}".${suggestion ? ` Use "${suggestion.capabilityId}".` : ''} Read get_capabilities for canonical ids and sources; author the referenced capability before granting it.` };
}

export function validateCapabilityReferences(draft: ProjectUsersDraft, registry: ReturnType<typeof capabilityRegistry>): SectionValidationIssue[] {
	const known = new Set(registry.map(row => `${row.capabilitySource}:${row.capabilityId}`));
	return draft.permissions.flatMap((grant, index) => resolves(grant, known) ? [] : [issueFor(grant, index, registry)]);
}

/** One stored grant the matrix dropped because what it granted no longer exists. */
export interface DroppedGrant {
	readonly roleId: string;
	readonly capabilityId: string;
	readonly capabilitySource: CapabilitySource;
	readonly action?: PermissionAction;
	readonly reason: string;
}

export interface MatrixReferenceReview {
	/** What the caller is introducing on a capability that does not exist: refuse these. */
	readonly issues: SectionValidationIssue[];
	/** Grants already stored whose capability is gone: dead data, dropped and named. */
	readonly dropped: DroppedGrant[];
	/** The matrix to persist, with the dead grants removed. */
	readonly permissions: PermissionGrant[];
}

/**
 * What to refuse and what to clean, read against what was already stored
 * (ac-matrix-3, -4, -5).
 *
 * A grant whose capability does not exist grants nothing to nobody, so it is
 * dead data, not a decision. Where it was ALREADY stored (a feature renamed or
 * removed months ago left it behind) it is dropped and named in the answer:
 * refusing it instead would make the section unwritable forever, because
 * removing the row is itself a write, and a section whose own repair is refused
 * has no way back. Where the caller is INTRODUCING it, the refusal stands and
 * teaches the canonical id, because that is a mistake being made now.
 */
export function reviewCapabilityReferences(
	incoming: ProjectUsersDraft,
	stored: ProjectUsersDraft | null,
	registry: ReturnType<typeof capabilityRegistry>
): MatrixReferenceReview {
	const known = new Set(registry.map(row => `${row.capabilitySource}:${row.capabilityId}`));
	const inherited = new Set((stored?.permissions ?? []).map(grantKey));
	const issues: SectionValidationIssue[] = [];
	const dropped: DroppedGrant[] = [];
	const permissions: PermissionGrant[] = [];

	incoming.permissions.forEach((grant, index) => {
		if (resolves(grant, known)) {
			permissions.push(grant);
			return;
		}
		if (!inherited.has(grantKey(grant))) {
			issues.push(issueFor(grant, index, registry));
			return;
		}
		dropped.push({
			roleId: grant.roleId,
			capabilityId: grant.capabilityId,
			capabilitySource: grant.capabilitySource,
			action: grant.action,
			reason: `"${grant.capabilityId}" no longer exists as a ${grant.capabilitySource} capability, so this grant gave nobody anything. It was dropped.`
		});
	});

	return { issues, dropped, permissions };
}
