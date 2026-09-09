/**
 * Closed vocabularies for the Foundation definition slice. Codes are the
 * contract (persisted verbatim, sent to the back, surfaced as Unspaghettit
 * tags). Labels are human display copy only. Source of truth: Unspaghettit
 * feature `6b9ffe58`.
 */

import type { Option } from '$domain/shared';

/** The three sub-areas inside the Requirements section. */
export type RequirementsTab = 'business' | 'technical' | 'security';

/* ── Competition ──────────────────────────────────────────────────────── */

export const BUSINESS_MODELS: readonly string[] = [
	'SaaS',
	'Licence',
	'Freemium',
	'Usage-based',
	'Marketplace',
	'Services',
	'Open core',
	'Ads',
	'Hybrid'
];

/* ── Technical ────────────────────────────────────────────────────────── */

export const INTEGRATION_DIRECTIONS = [
	{ code: 'in', label: 'In', hint: 'External system pushes data into the product' },
	{ code: 'out', label: 'Out', hint: 'Product pushes data into the external system' },
	{ code: 'both', label: 'Both', hint: 'Bidirectional' }
] as const satisfies readonly Option[];
export type IntegrationDirection = (typeof INTEGRATION_DIRECTIONS)[number]['code'];

export const CRITICALITY_LEVELS = [
	{ code: 'low', label: 'Low' },
	{ code: 'medium', label: 'Medium' },
	{ code: 'high', label: 'High' },
	{ code: 'critical', label: 'Critical' }
] as const satisfies readonly Option[];
export type CriticalityLevel = (typeof CRITICALITY_LEVELS)[number]['code'];

export const API_KINDS = [
	{ code: 'REST', label: 'REST' },
	{ code: 'GraphQL', label: 'GraphQL' },
	{ code: 'gRPC', label: 'gRPC' },
	{ code: 'Webhooks', label: 'Webhooks' },
	{ code: 'MCP', label: 'MCP' }
] as const satisfies readonly Option[];
export type ApiKind = (typeof API_KINDS)[number]['code'];

export const PERFORMANCE_UNITS = [
	{ code: 'ms', label: 'ms' },
	{ code: 's', label: 's' },
	{ code: 'rps', label: 'rps', hint: 'Requests per second' },
	{ code: 'tps', label: 'tps', hint: 'Transactions per second' }
] as const satisfies readonly Option[];
export type PerformanceUnit = (typeof PERFORMANCE_UNITS)[number]['code'];

export const COMPATIBILITIES: readonly string[] = [
	'Chrome',
	'Firefox',
	'Safari',
	'Edge',
	'iOS',
	'Android',
	'Windows',
	'macOS',
	'Linux'
];

/** Required-availability target (Technical requirements). */
export const AVAILABILITY_LEVELS: readonly string[] = ['99%', '99.5%', '99.9%', '99.95%', '99.99%'];

/* ── Security ─────────────────────────────────────────────────────────── */

export const AUTH_MECHANISMS = [
	{ code: 'email_password', label: 'Email / password' },
	{ code: 'sso', label: 'SSO' },
	{ code: 'mfa', label: 'MFA' },
	{ code: 'oauth', label: 'OAuth' },
	{ code: 'passkey', label: 'Passkey' },
	{ code: 'magic_link', label: 'Magic link' }
] as const satisfies readonly Option[];
export type AuthMechanism = (typeof AUTH_MECHANISMS)[number]['code'];

export const AUTHORIZATION_MODELS = [
	{ code: 'rbac', label: 'RBAC' },
	{ code: 'abac', label: 'ABAC' },
	{ code: 'acl', label: 'ACL' },
	{ code: 'none', label: 'None' }
] as const satisfies readonly Option[];
export type AuthorizationModel = (typeof AUTHORIZATION_MODELS)[number]['code'];

export const ENCRYPTION_SCOPES = [
	{ code: 'at_rest', label: 'At rest' },
	{ code: 'in_transit', label: 'In transit' },
	{ code: 'end_to_end', label: 'End-to-end' }
] as const satisfies readonly Option[];
export type EncryptionScope = (typeof ENCRYPTION_SCOPES)[number]['code'];
export const isEncryptionScope = (v: unknown): v is EncryptionScope =>
	typeof v === 'string' && (ENCRYPTION_SCOPES as readonly Option[]).some((s) => s.code === v);

export const AUDIT_LOG_LEVELS = [
	{ code: 'none', label: 'None' },
	{ code: 'partial', label: 'Partial' },
	{ code: 'complete', label: 'Complete' }
] as const satisfies readonly Option[];
export type AuditLogLevel = (typeof AUDIT_LOG_LEVELS)[number]['code'];

export const CERTIFICATIONS = [
	{ code: 'SOC2_Type_I', label: 'SOC 2 Type I' },
	{ code: 'SOC2_Type_II', label: 'SOC 2 Type II' },
	{ code: 'ISO_27001', label: 'ISO 27001' },
	{ code: 'HIPAA', label: 'HIPAA' },
	{ code: 'PCI_DSS', label: 'PCI DSS' },
	{ code: 'FedRAMP', label: 'FedRAMP' }
] as const satisfies readonly Option[];
export type CertificationCode = (typeof CERTIFICATIONS)[number]['code'];
export const isCertificationCode = (v: unknown): v is CertificationCode =>
	typeof v === 'string' && (CERTIFICATIONS as readonly Option[]).some((c) => c.code === v);

export const RETENTION_ACTIONS = [
	{ code: 'archival', label: 'Archival' },
	{ code: 'anonymization', label: 'Anonymization' },
	{ code: 'deletion', label: 'Deletion' }
] as const satisfies readonly Option[];
export type RetentionAction = (typeof RETENTION_ACTIONS)[number]['code'];
