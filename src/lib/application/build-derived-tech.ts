import type { DerivedTech } from '$domain/architecture';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import { DB_ENGINES, type ProjectDataDraft } from '$domain/data';

/**
 * Seeds the architecture's tech set from what's already declared upstream, so
 * nothing is re-typed:
 *  - the Definition slice — the external integrations (→ integrations layer).
 *  - Step 07 Data — databases (→ data layer) and hosts (→ infra layer).
 *
 * Read-only suggestions; the Derive action turns the missing ones into real
 * TechChoice cards (the author then fixes layer/role/version as needed).
 */
export function buildDerivedTech(
	definition: FoundationDefinitionDraft | null,
	data: ProjectDataDraft | null
): DerivedTech[] {
	const out: DerivedTech[] = [];
	const seen = new Set<string>();
	// Tolerant of undefined / non-string names (loosely-authored upstream data,
	// e.g. via the MCP) — the load path must never crash the whole analysis.
	const push = (name: unknown, layer: DerivedTech['layer']) => {
		const n = typeof name === 'string' ? name.trim() : '';
		if (!n) return;
		const key = `${layer}:${n.toLowerCase()}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ name: n, layer });
	};
	// An upstream item may be a string OR an object with a named field.
	const nameOf = (v: unknown, key: string): unknown =>
		typeof v === 'string' ? v : v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;

	for (const integ of definition?.technical?.integrations ?? []) push(nameOf(integ, 'system'), 'integrations');

	for (const db of data?.databases ?? []) {
		const engine = DB_ENGINES.find((e) => e.code === db.engine)?.label ?? db.engine;
		push(db.name ? `${db.name} (${engine})` : engine, 'data');
	}
	for (const host of data?.hosts ?? []) push(host.name, 'infra');

	return out;
}
