import type { AuthorBehaviorInput, AuthorBehaviorResult } from '$application/specification/author-behavior';

/** The write path a landing goes through: the ordinary one, guards included. */
export type BehaviourAuthor = { execute(input: AuthorBehaviorInput): Promise<AuthorBehaviorResult> };

export type DraftBehaviourLanding = {
	readonly projectId: string;
	readonly featureId: string;
	readonly operations: readonly Record<string, unknown>[];
	readonly mintedIds: readonly string[];
};

export type DraftBehaviourLanded = { readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] };

const isStateDeletion = (op: Record<string, unknown>): boolean => op.kind === 'remove_state_definition';

/**
 * Writes a draft's behaviour model into its feature when the change lands.
 * The write path takes a state deletion only alone, through the checked
 * deletion, so the model's other operations go first as one batch, in their
 * order and with the ids the draft was authored and simulated with, and each
 * state deletion follows on its own once they stand: what the draft detached
 * from the state is detached by then. A deletion mints no id, so every id
 * keeps its slot.
 */
export async function landDraftBehaviour(author: BehaviourAuthor, landing: DraftBehaviourLanding): Promise<DraftBehaviourLanded> {
	const refused = (result: AuthorBehaviorResult): DraftBehaviourLanded | null =>
		result.batch?.ok === true ? null : { ok: false, errors: result.batch?.errors?.slice(0, 3) ?? ['the engine did not answer'] };
	const batch = landing.operations.filter((op) => !isStateDeletion(op));
	if (batch.length > 0) {
		const written = await author.execute({
			projectId: landing.projectId,
			featureId: landing.featureId,
			operations: batch,
			mintedIds: landing.mintedIds
		});
		const failed = refused(written);
		if (failed) return failed;
	}
	for (const deletion of landing.operations.filter(isStateDeletion)) {
		const removed = await author.execute({ projectId: landing.projectId, featureId: landing.featureId, operations: [deletion] });
		const failed = refused(removed);
		if (failed) return failed;
	}
	return { ok: true };
}
