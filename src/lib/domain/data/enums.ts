/**
 * Closed vocabularies for Step 07 — Data & flows. Source of truth: Unspaghettit
 * feature `c5380392`. Codes are persisted; labels are the plain display copy.
 */

import type { Option } from '$domain/shared';

export const HOST_KINDS = [
	{ code: 'internal', label: 'Internal' },
	{ code: 'cloud', label: 'Cloud' },
	{ code: 'saas', label: 'SaaS' },
	{ code: 'external', label: 'External' },
	{ code: 'onprem', label: 'On-prem' }
] as const satisfies readonly Option[];
export type HostKind = (typeof HOST_KINDS)[number]['code'];
export const isHostKind = (v: unknown): v is HostKind =>
	typeof v === 'string' && (HOST_KINDS as readonly Option[]).some((k) => k.code === v);

/**
 * Cloud regions a host can sit in (the mockup's region select). Codes are the
 * provider-neutral region slugs; `global` means multi-region / edge. On-prem
 * hosts ignore this — they live on the customer site.
 */
export const HOST_REGIONS = [
	'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-south-1',
	'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'ap-south-1',
	'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'sa-east-1', 'me-south-1',
	'af-south-1', 'global'
] as const;
export type HostRegion = (typeof HOST_REGIONS)[number];

export const DB_ENGINES = [
	{ code: 'postgres', label: 'PostgreSQL' },
	{ code: 'mysql', label: 'MySQL' },
	{ code: 'sqlite', label: 'SQLite' },
	{ code: 'mongodb', label: 'MongoDB' },
	{ code: 'redis', label: 'Redis' },
	{ code: 'other', label: 'Other' }
] as const satisfies readonly Option[];
export type DbEngine = (typeof DB_ENGINES)[number]['code'];

export const FIELD_TYPES = [
	{ code: 'string', label: 'String' },
	{ code: 'int', label: 'Int' },
	{ code: 'decimal', label: 'Decimal' },
	{ code: 'boolean', label: 'Boolean' },
	{ code: 'datetime', label: 'DateTime' },
	{ code: 'object', label: 'Object' },
	{ code: 'json', label: 'Json' },
	{ code: 'enum', label: 'Enum' },
	{ code: 'uuid', label: 'UUID' },
	{ code: 'relation', label: 'Relation' }
] as const satisfies readonly Option[];
export type FieldType = (typeof FIELD_TYPES)[number]['code'];
export const isFieldType = (v: unknown): v is FieldType =>
	typeof v === 'string' && (FIELD_TYPES as readonly Option[]).some((t) => t.code === v);

/**
 * How two bricks talk. The first eight cross a network; the last three do not.
 *
 * `sdk` / `native` / `in-process` exist because a product with no backend still
 * has real interfaces: a repository over a device database, a native module, a
 * clock behind a port. Without them every such interface had to be miscoded as
 * `rest`, which then published it to the behavior model as an external HTTP API.
 */
export const PROTOCOLS = [
	{ code: 'rest', label: 'REST' },
	{ code: 'graphql', label: 'GraphQL' },
	{ code: 'webhook', label: 'Webhook' },
	{ code: 'grpc', label: 'gRPC' },
	{ code: 'soap', label: 'SOAP' },
	{ code: 'event', label: 'Event' },
	{ code: 'websocket', label: 'WebSocket' },
	{ code: 'queue', label: 'Queue' },
	{ code: 'sdk', label: 'SDK / library' },
	{ code: 'native', label: 'Native module' },
	{ code: 'in-process', label: 'In-process port' }
] as const satisfies readonly Option[];
export type Protocol = (typeof PROTOCOLS)[number]['code'];
export const isProtocol = (v: unknown): v is Protocol =>
	typeof v === 'string' && (PROTOCOLS as readonly Option[]).some((p) => p.code === v);

/** How an entity entered the model. */
export type EntityOrigin = 'journey' | 'feature' | 'manual';
