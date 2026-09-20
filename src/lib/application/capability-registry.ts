import { SYSTEM_CAPABILITIES, capabilityActions, type CapabilitySource, type ProjectUsersDraft } from '$domain/users';
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

export function validateCapabilityReferences(draft: ProjectUsersDraft, registry: ReturnType<typeof capabilityRegistry>): SectionValidationIssue[] {
	const known = new Set(registry.map(row => `${row.capabilitySource}:${row.capabilityId}`));
	return draft.permissions.flatMap((grant, index) => {
		if (known.has(`${grant.capabilitySource}:${grant.capabilityId}`)) return [];
		const suggestion = registry.find(row => row.capabilitySource === grant.capabilitySource && row.capabilityId === `screen:${grant.capabilityId}`);
		return [{ path: `permissions[${index}].capabilityId`, message: `"${grant.capabilityId}" does not resolve as capabilitySource "${grant.capabilitySource}".${suggestion ? ` Use "${suggestion.capabilityId}".` : ''} Read get_capabilities for canonical ids and sources; author the referenced capability before granting it.` }];
	});
}
