/**
 * Closed vocabularies for Step 09 — Global coherence. Source of truth:
 * Unspaghettit feature `fde7bb20`.
 */

import type { Option } from '$domain/shared';

export const GAP_SEVERITIES = [
	{ code: 'high', label: 'High' },
	{ code: 'medium', label: 'Medium' },
	{ code: 'low', label: 'Low' }
] as const satisfies readonly Option[];
export type GapSeverity = (typeof GAP_SEVERITIES)[number]['code'];

export const ARTIFACT_KINDS = [
	{ code: 'functional_doc', label: 'Functional spec' },
	{ code: 'technical_doc', label: 'Technical spec' },
	{ code: 'requirements_doc', label: 'Requirements doc' },
	{ code: 'coherence_graph', label: 'Coherence graph' }
] as const satisfies readonly Option[];
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]['code'];

/** Default green bar — readiness must reach this (with no blocking gap) to push. */
export const DEFAULT_THRESHOLD = 80;
