/**
 * Closed vocabularies for Step 08 — Architecture & stack. Source of truth:
 * Unspaghettit feature `8c799e4a`. Codes are persisted; labels are display copy.
 */

import type { Option } from '$domain/shared';

export const ARCH_LAYERS = [
	{ code: 'frontend', label: 'Frontend' },
	{ code: 'backend', label: 'Backend' },
	{ code: 'data', label: 'Data' },
	{ code: 'integrations', label: 'Integrations' },
	{ code: 'infra', label: 'Infra' }
] as const satisfies readonly Option[];
export type ArchLayer = (typeof ARCH_LAYERS)[number]['code'];
export const isArchLayer = (v: unknown): v is ArchLayer =>
	typeof v === 'string' && (ARCH_LAYERS as readonly Option[]).some((l) => l.code === v);

export const DOC_KINDS = [
	{ code: 'docs', label: 'Docs' },
	{ code: 'api', label: 'API' },
	{ code: 'guide', label: 'Guide' },
	{ code: 'legal', label: 'Legal' },
	{ code: 'other', label: 'Other' }
] as const satisfies readonly Option[];
export type DocKind = (typeof DOC_KINDS)[number]['code'];

export const CONSTRAINT_CATEGORIES = [
	{ code: 'data_residency', label: 'Data residency' },
	{ code: 'encryption', label: 'Encryption' },
	{ code: 'audit', label: 'Audit' },
	{ code: 'access', label: 'Access control' },
	{ code: 'performance', label: 'Performance' },
	{ code: 'compliance', label: 'Compliance' },
	{ code: 'other', label: 'Other' }
] as const satisfies readonly Option[];
export type ConstraintCategory = (typeof CONSTRAINT_CATEGORIES)[number]['code'];
