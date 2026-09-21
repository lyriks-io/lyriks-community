import type { BehaviorBatchResult } from '$application/ports';

/**
 * The engine's `apply_batch` answer travels verbatim under `batch.raw`, where a
 * client does not look. A newer engine says things there a caller must act on:
 * that the batch lost a race (`conflict`, with the version to rebase on and what
 * changed meanwhile), which version a save moved the feature from and to, what
 * the batch touches in other features, and how the touched scenarios ran.
 *
 * This is the ONE place those fields are lifted onto `batch`, so the route, the
 * MCP gateway and the shipped apply-batch helper all read the same names. Each
 * field is copied only when the engine sent it in the expected shape: an older
 * engine sends none of them and the batch comes back unchanged, never padded
 * with a `conflict: false` or an empty list that would read as a statement.
 */
export function liftBehaviorBatchAnswer(batch: BehaviorBatchResult): BehaviorBatchResult {
	const raw = batch.raw;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return batch;
	const answer = raw as Record<string, unknown>;

	const lifted: {
		-readonly [K in keyof BehaviorBatchResult]?: BehaviorBatchResult[K];
	} = {};
	if (answer.conflict === true) lifted.conflict = true;
	for (const key of ['currentUpdatedAt', 'previousUpdatedAt', 'updatedAt'] as const) {
		const value = answer[key];
		if (typeof value === 'string' && value.length > 0) lifted[key] = value;
	}
	if (Array.isArray(answer.changedSince)) {
		lifted.changedSince = answer.changedSince.filter((v): v is string => typeof v === 'string');
	}
	if (typeof answer.changedSinceTotal === 'number' && Number.isFinite(answer.changedSinceTotal)) {
		lifted.changedSinceTotal = answer.changedSinceTotal;
	}
	// Relayed as shaped: their structure belongs to the engine and may grow.
	for (const key of ['relatedElsewhere', 'scenarios'] as const) {
		const value = answer[key];
		if (value && typeof value === 'object') lifted[key] = value;
	}

	if (Object.keys(lifted).length === 0) return batch;
	// Lifted once, not twice: what moves up to `batch` leaves `raw`. A lifted
	// name IS the contract every reader was told to use, and `relatedElsewhere`
	// or `scenarios` sent a second time under `raw` doubled the weight of the
	// answer for nothing. Everything the engine sent and nothing lifts (the
	// verbose maturity report, whatever a newer engine adds) stays in `raw`.
	const withoutLifted = Object.fromEntries(
		Object.entries(answer).filter(([key]) => !(key in lifted))
	);
	// `raw` stays last: verbose answers make it long, and a reader should meet the
	// lifted fields before it.
	const { raw: _raw, ...head } = batch;
	return { ...head, ...lifted, raw: withoutLifted };
}
