import { unitsWrittenSince, type IndexRevisionConflict } from '$domain/implementation';
import type { ImplementationIndexRevisionsPort } from '../ports';

/** What a guarded write came to: refused where it overlaps, or written at a revision. */
export type GuardedIndexWrite<T> =
	| { readonly kind: 'conflict'; readonly conflict: IndexRevisionConflict }
	| { readonly kind: 'done'; readonly revision: number; readonly value: T };

/** What a write did: the units it wrote (null when nothing landed) and its answer. */
export interface IndexWriteOutcome<T> {
	readonly written: readonly string[] | null;
	readonly value: T;
}

/**
 * Every write of a project's implementation index goes through here (feat-100,
 * rules bedac77e, 1eb2ecf1 and fc406a24): writes of one project run one at a
 * time, each that lands raises the revision by one, and a write naming an
 * older revision is refused only where a write since then touched a unit it
 * sends. Without an expected revision a write lands as it always did.
 */
export class GuardIndexWriteUseCase {
	constructor(private readonly revisions: ImplementationIndexRevisionsPort) {}

	current(projectId: string): Promise<number> {
		return this.revisions.current(projectId);
	}

	async write<T>(
		projectId: string,
		units: readonly string[],
		expected: number | null,
		write: () => Promise<IndexWriteOutcome<T>>
	): Promise<GuardedIndexWrite<T>> {
		type Step = { readonly kind: 'conflict'; readonly conflict: IndexRevisionConflict } | { readonly kind: 'done'; readonly value: T };
		const { revision, value } = await this.revisions.serialize<Step>(projectId, units, async (now) => {
			if (expected !== null && expected < now.revision) {
				const overlap = unitsWrittenSince(units, now.lastWritten, expected);
				if (overlap.length > 0) {
					return { written: null, value: { kind: 'conflict', conflict: { expected, current: now.revision, units: overlap } } };
				}
			}
			const outcome = await write();
			return { written: outcome.written, value: { kind: 'done', value: outcome.value } };
		});
		return value.kind === 'conflict' ? value : { kind: 'done', revision, value: value.value };
	}
}
