/**
 * The kernel's closed vocabulary for a Resource, and the Lyriks display labels
 * for it.
 *
 * ONE place, because the two directions have to agree: `data-projection` WRITES
 * these codes onto the Data Model feature, and `index-feature-resources` READS
 * every resource the kernel holds back out. A code invented on the write side
 * that the kernel's enum does not contain renders as a blank chip in the
 * behavior editor and as "Unknown" here, so the mapping tables below are the
 * contract, not a convenience.
 *
 * Source of truth: unspaghettit `behavior-model/domain/value-objects/Resource.ts`.
 * Pure and framework-free.
 */

import type { DbEngine, HostKind, Protocol } from '$domain/data';

/** Every `kind` the kernel accepts. */
export const RESOURCE_KINDS = [
	'relational_db',
	'document_db',
	'key_value_store',
	'object_storage',
	'file_system',
	'cache',
	'message_queue',
	'event_stream',
	'http_api',
	'graphql_api',
	'browser_storage',
	'in_memory',
	'other'
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
	relational_db: 'Relational DB',
	document_db: 'Document DB',
	key_value_store: 'Key/Value store',
	object_storage: 'Object storage',
	file_system: 'File system',
	cache: 'Cache',
	message_queue: 'Message queue',
	event_stream: 'Event stream',
	http_api: 'HTTP API',
	graphql_api: 'GraphQL API',
	browser_storage: 'Browser storage',
	in_memory: 'In-memory',
	other: 'Other'
};

/** Every `scope` the kernel accepts. */
export const RESOURCE_SCOPES = ['local', 'external', 'cloud', 'on_prem'] as const;
export type ResourceScope = (typeof RESOURCE_SCOPES)[number];

const RESOURCE_SCOPE_LABELS: Record<ResourceScope, string> = {
	local: 'Local (browser/device)',
	external: 'External third-party',
	cloud: 'Cloud',
	on_prem: 'On-premise'
};

/** Every `sensitivity` the kernel accepts, least to most restricted. */
export const RESOURCE_SENSITIVITIES = ['public', 'internal', 'confidential', 'restricted'] as const;
export type ResourceSensitivity = (typeof RESOURCE_SENSITIVITIES)[number];

const RESOURCE_SENSITIVITY_LABELS: Record<ResourceSensitivity, string> = {
	public: 'Public',
	internal: 'Internal',
	confidential: 'Confidential',
	restricted: 'Restricted'
};

/** Every `accessMode` the kernel accepts. */
export type ResourceAccessMode = 'read' | 'write' | 'read_write';

const ACCESS_MODE_LABELS: Record<ResourceAccessMode, string> = {
	read: 'Read-only',
	write: 'Write-only',
	read_write: 'Read & write'
};

/** Every `authentication` method the kernel accepts. */
export type ResourceAuthMethod =
	| 'none'
	| 'api_key'
	| 'oauth2'
	| 'jwt'
	| 'basic_auth'
	| 'iam_role'
	| 'mtls'
	| 'session_cookie'
	| 'service_account';

const AUTH_METHOD_LABELS: Record<ResourceAuthMethod, string> = {
	none: 'None',
	api_key: 'API key',
	oauth2: 'OAuth 2.0',
	jwt: 'JWT',
	basic_auth: 'Basic auth',
	iam_role: 'IAM role',
	mtls: 'Mutual TLS',
	session_cookie: 'Session cookie',
	service_account: 'Service account'
};

/* ── labels (tolerant: an unknown code is shown, never swallowed) ──────── */

const labelOf = <T extends string>(table: Record<T, string>, code: string): string =>
	(table as Record<string, string>)[code] ?? (code ? code.replace(/_/g, ' ') : '');

export const resourceKindLabel = (code: string): string => labelOf(RESOURCE_KIND_LABELS, code);
export const resourceScopeLabel = (code: string): string => labelOf(RESOURCE_SCOPE_LABELS, code);
export const resourceSensitivityLabel = (code: string): string =>
	labelOf(RESOURCE_SENSITIVITY_LABELS, code);
export const resourceAccessModeLabel = (code: string): string => labelOf(ACCESS_MODE_LABELS, code);
export const resourceAuthLabel = (code: string): string => labelOf(AUTH_METHOD_LABELS, code);

export const isResourceKind = (v: unknown): v is ResourceKind =>
	typeof v === 'string' && (RESOURCE_KINDS as readonly string[]).includes(v);
export const isResourceScope = (v: unknown): v is ResourceScope =>
	typeof v === 'string' && (RESOURCE_SCOPES as readonly string[]).includes(v);

/* ── Lyriks vocabulary → kernel vocabulary (the write side) ────────────── */

/**
 * Database engine → resource kind. `other` is a real engine choice in Lyriks and
 * maps to the kernel's own catch-all; it must NOT invent a `datastore` code,
 * which the kernel's enum does not contain.
 */
export const engineResourceKind: Record<DbEngine, ResourceKind> = {
	postgres: 'relational_db',
	mysql: 'relational_db',
	sqlite: 'relational_db',
	mongodb: 'document_db',
	redis: 'key_value_store',
	other: 'other'
};

export const engineProviderLabel: Record<DbEngine, string> = {
	postgres: 'PostgreSQL',
	mysql: 'MySQL',
	sqlite: 'SQLite',
	mongodb: 'MongoDB',
	redis: 'Redis',
	other: 'Custom'
};

/**
 * Host kind → resource scope. `internal` means "runs on our own machine" (an
 * on-premise SERVER is the separate `onprem` code), which the kernel calls
 * `local`. Passing `internal` straight through produced a code outside the
 * kernel's enum and a blank scope in the editor.
 */
export const hostResourceScope: Record<HostKind, ResourceScope> = {
	internal: 'local',
	cloud: 'cloud',
	saas: 'external',
	external: 'external',
	onprem: 'on_prem'
};

/**
 * Interface protocol → resource kind. gRPC has no kernel code of its own and is
 * carried over HTTP/2, so it folds into `http_api`; a websocket subscription is
 * a stream, so it folds into `event_stream`. Both previously wrote codes
 * (`rpc_api`, `websocket`) the kernel does not define.
 *
 * The three non-network protocols are the reason this table must be total: an
 * SDK call, a native module and an in-process port are not APIs, and the old
 * `?? 'http_api'` fallback published every one of them as an external HTTP API.
 */
export const protocolResourceKind: Record<Protocol, ResourceKind> = {
	rest: 'http_api',
	graphql: 'graphql_api',
	webhook: 'http_api',
	grpc: 'http_api',
	soap: 'http_api',
	event: 'event_stream',
	websocket: 'event_stream',
	queue: 'message_queue',
	sdk: 'in_memory',
	native: 'in_memory',
	'in-process': 'in_memory'
};

/**
 * Interface protocol → resource scope. An interface names two bricks, not two
 * hosts, so the protocol is the only honest signal for whether it leaves the
 * machine. The eight network protocols do; an SDK call, a native module and an
 * in-process port never do. This replaces a hardcoded `external`, which labelled
 * every interface "External third-party" even in a product with no backend.
 */
export const protocolResourceScope: Record<Protocol, ResourceScope> = {
	rest: 'external',
	graphql: 'external',
	webhook: 'external',
	grpc: 'external',
	soap: 'external',
	event: 'external',
	websocket: 'external',
	queue: 'external',
	sdk: 'local',
	native: 'local',
	'in-process': 'local'
};

/** True when this protocol leaves the machine, so it needs auth and transport encryption. */
export const protocolCrossesNetwork = (protocol: Protocol): boolean =>
	protocolResourceScope[protocol] === 'external';
