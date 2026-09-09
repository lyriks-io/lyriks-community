import { CORE_TONES, MVP_TIERS, WORK_STATUSES } from '$domain/features';
import { EDGE_OUTCOMES, ISSUE_KINDS, ISSUE_SEVERITIES, ISSUE_STATUSES } from '$domain/rules';
import { ACTIVE_PERMISSION_ACTIONS, CAPABILITY_SOURCES, ROLE_TONES } from '$domain/users';

/**
 * Machine-readable contracts for collection items authored through the MCP.
 * These schemas deliberately live at the application boundary: domain drafts
 * stay framework-free, while HTTP/MCP adapters share one validation contract.
 */
export interface AuthoringFieldSchema {
	readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	readonly required?: boolean;
	readonly nullable?: boolean;
	readonly enum?: readonly string[];
	readonly items?: 'string' | 'object';
}

export interface AuthoringItemSchema {
	readonly additionalProperties: false;
	readonly fields: Readonly<Record<string, AuthoringFieldSchema>>;
}

export type AuthoringSection = 'users' | 'features' | 'rules';

const requiredString = (values?: readonly string[]): AuthoringFieldSchema => ({
	type: 'string',
	required: true,
	...(values ? { enum: values } : {})
});
const requiredNumber = (): AuthoringFieldSchema => ({ type: 'number', required: true });
const requiredBoolean = (): AuthoringFieldSchema => ({ type: 'boolean', required: true });
const nullableString = (): AuthoringFieldSchema => ({ type: 'string', required: true, nullable: true });
const stringArray = (): AuthoringFieldSchema => ({ type: 'array', required: true, items: 'string' });
/**
 * Citations into the Documents & Sources register. Optional everywhere: a
 * payload authored before the field existed (or by a client that doesn't cite)
 * must still validate.
 */
const citations = (): AuthoringFieldSchema => ({ type: 'array', items: 'string' });
const codes = <T extends { readonly code: string }>(options: readonly T[]): readonly string[] =>
	options.map((option) => option.code);

export const SECTION_ITEM_SCHEMAS: Readonly<
	Partial<Record<AuthoringSection, Readonly<Record<string, AuthoringItemSchema>>>>
> = {
	users: {
		roles: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				name: requiredString(),
				description: requiredString(),
				userCountMin: requiredNumber(),
				userCountMax: { type: 'number', required: true, nullable: true },
				tone: requiredString(codes(ROLE_TONES)),
				sourceIds: citations()
			}
		},
		offStructureCapabilities: {
			additionalProperties: false,
			fields: { id: requiredString(), label: requiredString(), note: nullableString() }
		},
		// `capabilityProfiles` is deliberately absent: per-row typing is not offered
		// while the vocabulary is the five essentials, so it is not authorable over
		// the MCP either. Persisted profiles are still parsed and honoured.
		permissions: {
			additionalProperties: false,
			fields: {
				roleId: requiredString(),
				capabilityId: requiredString(),
				capabilitySource: requiredString(codes(CAPABILITY_SOURCES)),
				action: { type: 'string', enum: codes(ACTIVE_PERMISSION_ACTIONS) }
			}
		}
	},
	features: {
		cores: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				name: requiredString(),
				description: requiredString(),
				tone: requiredString(codes(CORE_TONES))
			}
		},
		families: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				name: requiredString(),
				coreId: requiredString(),
				parentFamilyId: nullableString(),
				description: requiredString()
			}
		},
		features: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				name: requiredString(),
				coreId: requiredString(),
				parentFamilyId: nullableString(),
				description: requiredString(),
				unspaghettitFeatureId: requiredString()
			}
		},
		mvpAssignments: {
			additionalProperties: false,
			fields: { featureId: requiredString(), tier: requiredString(codes(MVP_TIERS)) }
		},
		releases: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				name: requiredString(),
				version: requiredString(),
				weekStart: requiredNumber(),
				weekEnd: requiredNumber(),
				order: requiredNumber(),
				description: requiredString(),
				// Explicit ship/archive stamp (ISO instant). Optional: releases
				// authored before the lifecycle existed must still validate.
				archivedAt: { type: 'string' }
			}
		},
		roadmapAssignments: {
			additionalProperties: false,
			fields: { featureId: requiredString(), releaseId: requiredString() }
		},
		// Work-distribution residue. Typed here so an MCP write with a malformed
		// sprint or assignment gets a 400 naming the field, instead of the parser
		// silently dropping the row (which read as data loss to the author).
		sprints: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				name: { type: 'string' },
				startDate: { type: 'string' },
				endDate: { type: 'string' },
				order: { type: 'number' },
				archivedAt: { type: 'string' }
			}
		},
		assignments: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				kind: requiredString(['core', 'feature', 'action']),
				coreId: { type: 'string' },
				featureId: { type: 'string' },
				actionId: { type: 'string' },
				label: { type: 'string' },
				assigneeId: nullableString(),
				sprintId: { type: 'string', nullable: true },
				status: { type: 'string', enum: WORK_STATUSES },
				order: { type: 'number' }
			}
		}
	},
	rules: {
		issues: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				kind: requiredString(codes(ISSUE_KINDS)),
				title: requiredString(),
				detail: requiredString(),
				severity: requiredString(codes(ISSUE_SEVERITIES)),
				status: requiredString(codes(ISSUE_STATUSES)),
				ownerRoleId: nullableString(),
				resolutionNote: requiredString(),
				relatedRuleIds: stringArray(),
				relatedFeatureId: nullableString(),
				relatedJourneyId: nullableString(),
				autoDetected: requiredBoolean(),
				sourceIds: citations()
			}
		},
		scenarios: {
			additionalProperties: false,
			fields: {
				id: requiredString(),
				title: requiredString(),
				given: requiredString(),
				whenText: requiredString(),
				then: requiredString(),
				expectedOutcome: requiredString(codes(EDGE_OUTCOMES)),
				relatedIssueId: nullableString(),
				relatedJourneyId: nullableString(),
				covered: requiredBoolean(),
				sourceIds: citations()
			}
		}
	}
};

export interface SectionValidationIssue {
	readonly path: string;
	readonly message: string;
}

/** Validate known authored collections without mutating or coercing their data. */
export function validateSectionItems(section: string, input: unknown): SectionValidationIssue[] {
	const schemas = SECTION_ITEM_SCHEMAS[section as AuthoringSection];
	if (!schemas || !input || typeof input !== 'object' || Array.isArray(input)) return [];
	const source = input as Record<string, unknown>;
	const issues: SectionValidationIssue[] = [];

	for (const [collection, schema] of Object.entries(schemas)) {
		const value = source[collection];
		if (value === undefined) continue;
		if (!Array.isArray(value)) {
			issues.push({ path: collection, message: 'must be an array' });
			continue;
		}
		value.forEach((item, index) => validateItem(item, schema, `${collection}[${index}]`, issues));
	}
	return issues;
}

function validateItem(
	item: unknown,
	schema: AuthoringItemSchema,
	path: string,
	issues: SectionValidationIssue[]
): void {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		issues.push({ path, message: 'must be an object' });
		return;
	}
	const record = item as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (!(key in schema.fields)) issues.push({ path: `${path}.${key}`, message: 'is not a supported field' });
	}
	for (const [key, field] of Object.entries(schema.fields)) {
		const value = record[key];
		const fieldPath = `${path}.${key}`;
		if (value === undefined) {
			if (field.required) issues.push({ path: fieldPath, message: 'is required' });
			continue;
		}
		if (value === null) {
			if (!field.nullable) issues.push({ path: fieldPath, message: 'must not be null' });
			continue;
		}
		if (field.type === 'array') {
			if (!Array.isArray(value)) issues.push({ path: fieldPath, message: 'must be an array' });
			else if (field.items === 'string' && value.some((entry) => typeof entry !== 'string')) {
				issues.push({ path: fieldPath, message: 'must contain only strings' });
			} else if (field.enum && value.some((entry) => !field.enum!.includes(entry as string))) {
				// A closed vocabulary inside a list — an unknown verb is silently
				// dropped by the parser, so say so here rather than leaving the author
				// wondering why the row kept its old permissions.
				issues.push({ path: fieldPath, message: `must contain only: ${field.enum.join(', ')}` });
			}
			continue;
		}
		if (typeof value !== field.type) {
			issues.push({ path: fieldPath, message: `must be a ${field.type}` });
			continue;
		}
		if (field.enum && !field.enum.includes(value as string)) {
			issues.push({ path: fieldPath, message: `must be one of: ${field.enum.join(', ')}` });
		}
	}
}

