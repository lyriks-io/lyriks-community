import type { Baseline } from './draft';

/**
 * What a write of the list of baselines may change. A baseline is captured,
 * never written: the list keeps every stored baseline as it was captured and
 * takes only its name and note from the write (criterion of Capture and compare
 * baselines). A baseline the write leaves out is deleted, unless a validation
 * of the specification stands on it: the version is counted from it.
 */

export const UNCAPTURED_BASELINE_REFUSAL = 'A baseline is captured, never written: capture it from Traceability.';
export const PROTECTED_BASELINE_REFUSAL = 'This baseline is the version the validated specification stands on: it cannot be deleted.';

const SNAPSHOT_FIELDS = ['createdAt', 'readiness', 'coherence', 'featureCount', 'content'] as const;

export type BaselineEditsOutcome =
	| { readonly ok: true; readonly baselines: Baseline[]; readonly snapshotIgnored: boolean }
	| { readonly ok: false; readonly reason: string };

export function applyBaselineEdits(stored: readonly Baseline[], incoming: readonly Baseline[], protectedIds: ReadonlySet<string>): BaselineEditsOutcome {
	const sent = new Map(incoming.map((b) => [b.id, b]));
	const known = new Set(stored.map((b) => b.id));
	if (incoming.some((b) => !known.has(b.id))) return { ok: false, reason: UNCAPTURED_BASELINE_REFUSAL };
	if (stored.some((b) => !sent.has(b.id) && protectedIds.has(b.id))) return { ok: false, reason: PROTECTED_BASELINE_REFUSAL };
	let snapshotIgnored = false;
	const baselines = stored.flatMap((b) => {
		const edit = sent.get(b.id);
		if (!edit) return [];
		if (SNAPSHOT_FIELDS.some((field) => edit[field] !== b[field])) snapshotIgnored = true;
		return [{ ...b, name: edit.name, note: edit.note }];
	});
	return { ok: true, baselines, snapshotIgnored };
}
