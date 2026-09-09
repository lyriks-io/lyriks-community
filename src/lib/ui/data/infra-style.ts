// Shared visual vocabulary for the Infrastructure view — the mockup's TYPE_COLOR /
// TYPE_ICON / ENGINE_FILL, mapped to hex for the light theme (these accent hues
// aren't in the token set). Used across the Data & Architecture board (InfraCanvas,
// HostInspector, InterfaceInspector).
import type { DbEngine, HostKind, Protocol } from '$domain/data';

/** Host-type accent (the mockup's HOST_TYPE_COLOR): internal violet · cloud blue · saas pink · external amber · onprem mint. */
export const HOST_TYPE_HEX: Record<HostKind, string> = {
	internal: '#8b5cf6',
	cloud: '#3b82f6',
	saas: '#ec4899',
	external: '#f59e0b',
	onprem: '#10b981'
};

/** Host-type glyph (the mockup's TYPE_ICON). */
export const HOST_TYPE_GLYPH: Record<HostKind, string> = {
	internal: '◇',
	cloud: '☁',
	saas: '☉',
	external: '↗',
	onprem: '🏢'
};

/**
 * Per-engine colour (the mockup's ENGINE_FILL). The map now groups tables per database
 * technology, so every engine needs its own hue — MySQL no longer shares Postgres'
 * blue, otherwise two adjacent blocks would read as the same store.
 */
export const ENGINE_HEX: Record<DbEngine, string> = {
	postgres: '#3b82f6',
	mysql: '#06b6d4',
	sqlite: '#f59e0b',
	mongodb: '#10b981',
	redis: '#ec4899',
	other: '#8b5cf6'
};

/**
 * Per-protocol connector colour for the urbanism map (the mockup's KIND_STROKE).
 * The three in-machine protocols share one slate tone: they never cross a host
 * boundary, so on a map about topology they should read as one quiet family
 * rather than compete with the network hues.
 */
export const PROTOCOL_HEX: Record<Protocol, string> = {
	rest: '#8b5cf6',
	graphql: '#ec4899',
	webhook: '#f59e0b',
	grpc: '#10b981',
	soap: '#3b82f6',
	event: '#ec4899',
	websocket: '#10b981',
	queue: '#f59e0b',
	sdk: '#64748b',
	native: '#64748b',
	'in-process': '#64748b'
};
