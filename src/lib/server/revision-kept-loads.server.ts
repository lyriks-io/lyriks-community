import { cloneData } from './clone-data.server';

/**
 * A section's load, parsed once per revision of the section. The Evolution
 * document of a project carried through several change requests weighs
 * megabytes: every act, every page and every look of a waiting AI fetched it,
 * parsed it and walked it through its anti-corruption parser again, though
 * nothing had moved since the read before. The parsed value is now kept with
 * the revision it was read at; a read asks the revision (one small query) and
 * gets a copy of what it already holds when it did not move. Each caller still
 * gets its own copy, so none can change what another reads.
 */

interface ProjectLoader<V> {
	execute(projectId: string, ...rest: never[]): Promise<V>;
}

/** Projects held at once: a parsed document can weigh tens of megabytes in memory. */
const HELD = 8;

export function keepPerRevision<V, L extends ProjectLoader<V>>(loader: L, revisionOf: (projectId: string) => Promise<number>): L {
	const held = new Map<string, { readonly revision: number; readonly value: V }>();
	const load = loader.execute.bind(loader) as (projectId: string, ...rest: unknown[]) => Promise<V>;
	loader.execute = (async (projectId: string, ...rest: unknown[]) => {
		// A read with options of its own is its own read.
		if (rest.length > 0) return load(projectId, ...rest);
		// The revision first: a write landing during the load is kept under the older revision, so the next read loads again.
		const revision = await revisionOf(projectId).catch(() => null);
		const hit = held.get(projectId);
		if (revision !== null && hit && hit.revision === revision) return cloneData(hit.value);
		const value = await load(projectId);
		if (revision === null) return value;
		held.delete(projectId);
		held.set(projectId, { revision, value });
		if (held.size > HELD) held.delete(held.keys().next().value!);
		return cloneData(value);
	}) as L['execute'];
	return loader;
}
