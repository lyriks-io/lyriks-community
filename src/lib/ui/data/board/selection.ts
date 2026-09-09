import type { DataStore } from '../draft-store.svelte';

/**
 * What the board's inspector is currently focused on. Ephemeral UI state (never
 * persisted) — the single source of truth that ties the map to the inspector so
 * clicking a brick on the canvas opens exactly its editor on the right.
 */
export type Selection =
	| { kind: 'none' }
	| { kind: 'host'; id: string }
	| { kind: 'table'; id: string }
	| { kind: 'interface'; id: string };

/** The names the urbanism map resolves interface endpoints against (host + table names). */
export function endpointNames(store: DataStore): string[] {
	const hosts = store.draft.hosts.map((h) => h.name.trim()).filter(Boolean);
	const tables = store.draft.entities.map((e) => e.name.trim()).filter(Boolean);
	return [...new Set([...hosts, ...tables])];
}

/** True when both ends of an interface resolve to a real host or table on the map. */
export function interfaceResolves(store: DataStore, fromBrick: string, toBrick: string): boolean {
	const names = new Set(endpointNames(store));
	return names.has(fromBrick.trim()) && names.has(toBrick.trim());
}
