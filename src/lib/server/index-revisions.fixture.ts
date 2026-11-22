import { GuardIndexWriteUseCase } from '$application/use-cases';
import type { ImplementationIndexRevisionsPort } from '$application/ports';

/**
 * The revisions of implementation indexes held in memory, for tests: the same
 * contract as the PostgreSQL store, writes of one project run one after the
 * other, and `lastWritten` answers only for the units asked.
 */
export function memoryIndexRevisions(): ImplementationIndexRevisionsPort & {
	readonly revisions: Map<string, number>;
	readonly writes: Map<string, Map<string, number>>;
} {
	const revisions = new Map<string, number>();
	const writes = new Map<string, Map<string, number>>();
	const queues = new Map<string, Promise<unknown>>();
	return {
		revisions,
		writes,
		current: async (projectId) => revisions.get(projectId) ?? 0,
		serialize(projectId, units, body) {
			const run = async () => {
				const revision = revisions.get(projectId) ?? 0;
				const held = writes.get(projectId) ?? new Map<string, number>();
				const lastWritten = new Map(units.flatMap((unit) => (held.has(unit) ? [[unit, held.get(unit)!] as const] : [])));
				const outcome = await body({ revision, lastWritten });
				if (outcome.written === null) return { revision, value: outcome.value };
				const next = revision + 1;
				revisions.set(projectId, next);
				for (const unit of outcome.written) held.set(unit, next);
				writes.set(projectId, held);
				return { revision: next, value: outcome.value };
			};
			const turn = (queues.get(projectId) ?? Promise.resolve()).then(run, run);
			queues.set(projectId, turn.catch(() => undefined));
			return turn;
		}
	};
}

/** The guard every index write takes, over revisions held in memory. */
export function memoryIndexGuard(store = memoryIndexRevisions()): GuardIndexWriteUseCase & { readonly store: ReturnType<typeof memoryIndexRevisions> } {
	return Object.assign(new GuardIndexWriteUseCase(store), { store });
}
