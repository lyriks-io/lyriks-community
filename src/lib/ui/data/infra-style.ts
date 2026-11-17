// Shared visual vocabulary for the Infrastructure view: the mockup's TYPE_COLOR /
// TYPE_ICON / ENGINE_FILL, as hex of the design system's palette (an SVG fill
// takes a hex, not a utility class). Used across the Tech & Data board (InfraCanvas,
// HostInspector, InterfaceInspector).
import type { DbEngine, HostKind, Protocol } from '$domain/data';

/** Host-type accent (the mockup's HOST_TYPE_COLOR): internal violet · cloud blue · saas pink · external amber · onprem mint. */
export const HOST_TYPE_HEX: Record<HostKind, string> = {
	internal: '#bb46f5',
	cloud: '#0066ff',
	saas: '#fa5fb2',
	external: '#ffa101',
	onprem: '#1fa98a'
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
	postgres: '#0066ff',
	mysql: '#0047b3',
	sqlite: '#ffa101',
	mongodb: '#1fa98a',
	redis: '#fa5fb2',
	other: '#bb46f5'
};

/**
 * Per-protocol connector colour for the urbanism map (the mockup's KIND_STROKE).
 * The three in-machine protocols share one slate tone: they never cross a host
 * boundary, so on a map about topology they should read as one quiet family
 * rather than compete with the network hues.
 */
export const PROTOCOL_HEX: Record<Protocol, string> = {
	rest: '#bb46f5',
	graphql: '#fa5fb2',
	webhook: '#ffa101',
	grpc: '#1fa98a',
	soap: '#0066ff',
	event: '#fa5fb2',
	websocket: '#1fa98a',
	queue: '#ffa101',
	sdk: '#8a8a92',
	native: '#8a8a92',
	'in-process': '#8a8a92'
};
