import type { DraftBehaviourModel } from './draft';

type Operation = Readonly<Record<string, unknown>>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The editable fields of an update op, sent flat or under `patch`, as the engine takes both. */
const fieldsOf = (op: Operation): Operation => ({ ...op, ...(op.patch && typeof op.patch === 'object' ? (op.patch as Operation) : {}) });

/** A Given/When/Then criterion said in one line: its title, then what it gives, does and expects. */
function sentenceOf(fields: Operation): string {
	const parts = [
		text(fields.given) && `given ${text(fields.given)}`,
		text(fields.when) && `when ${text(fields.when)}`,
		text(fields.then) && `then ${text(fields.then)}`,
		text(fields.description)
	].filter((p) => p !== '');
	const title = text(fields.title);
	return [title ? `"${title}"` : '', parts.join('; ')].filter((p) => p !== '').join(': ');
}

/**
 * One line per change a draft's behaviour model makes to the Given/When/Then
 * criteria of the feature it amends (criterion 52c53f0c): a criterion added,
 * reworded or retired is an acceptance change of the request as much as a text
 * criterion is, so the Acceptance criteria answer counts it as filled, and its
 * value, which a validation stands behind, changes when one of them changes.
 * What an earlier freeze already wrote comes first, then what is still to write.
 */
export function behaviourCriterionLines(model: DraftBehaviourModel | undefined): string[] {
	const operations: readonly Operation[] = [...(model?.landed?.operations ?? []), ...(model?.operations ?? [])];
	return operations.flatMap((op) => {
		const kind = text(op.kind) || text(op.op);
		const fields = fieldsOf(op);
		const id = text(op.criterionId) || text(op.criterionRef);
		if (kind === 'add_acceptance_criterion') return [`Adds the criterion ${sentenceOf(fields)}`];
		if (kind === 'update_acceptance_criterion') return [`Rewords the criterion ${id}${sentenceOf(fields) ? ` as ${sentenceOf(fields)}` : ''}`];
		if (kind === 'remove_acceptance_criterion') return [`Retires the criterion ${id}`];
		return [];
	});
}

/** What a Given/When/Then criterion is reworded with, as update_acceptance_criterion takes it. */
const CRITERION_FIELDS = ['title', 'given', 'when', 'then', 'description'] as const;

/** The criteria an amendment rewords or retires, as add_draft_leaf and update_draft_leaf send them. */
export interface CriteriaDelta {
	readonly changeCriteria?: readonly Readonly<Record<string, unknown>>[];
	readonly retireCriteria?: readonly string[];
}

export type RoutedCriteriaDelta =
	| { readonly ok: true; readonly delta: CriteriaDelta; readonly operations: Record<string, unknown>[] }
	| { readonly ok: false; readonly reason: string; readonly fix: string };

/**
 * An amendment's changeCriteria and retireCriteria split between the feature's
 * text criteria, which stay on the draft, and the Given/When/Then criteria of
 * its behaviour model, which become the update_acceptance_criterion and
 * remove_acceptance_criterion operations apply_behavior_batch would append to
 * the draft (criterion 569c7789). An id in neither list is left to the draft's
 * own check, which refuses it by name. A list whose every row went to the
 * behaviour model is left out, so it does not clear what the draft held.
 */
export function routeCriteriaDelta(delta: CriteriaDelta, behaviourIds: ReadonlySet<string>, textIds: ReadonlySet<string>): RoutedCriteriaDelta {
	const isBehaviour = (id: string) => behaviourIds.has(id) && !textIds.has(id);
	const operations: Record<string, unknown>[] = [];
	const keptChanges: Readonly<Record<string, unknown>>[] = [];
	for (const row of delta.changeCriteria ?? []) {
		const id = text(row.id);
		if (!isBehaviour(id)) {
			keptChanges.push(row);
			continue;
		}
		const patch = Object.fromEntries(CRITERION_FIELDS.flatMap((f) => (typeof row[f] === 'string' && text(row[f]) !== '' ? [[f, text(row[f])]] : [])));
		if (Object.keys(patch).length === 0)
			return {
				ok: false,
				reason: `Criterion "${id}" is a Given/When/Then criterion of the feature's behaviour model: reword it with title, given, when, then or description.`,
				fix: 'A text criterion is reworded with {id, text}; a Given/When/Then criterion with {id, title?, given?, when?, then?, description?}.'
			};
		operations.push({ kind: 'update_acceptance_criterion', criterionId: id, patch });
	}
	const keptRetired: string[] = [];
	for (const id of delta.retireCriteria ?? []) {
		if (isBehaviour(text(id))) operations.push({ kind: 'remove_acceptance_criterion', criterionId: text(id) });
		else keptRetired.push(id);
	}
	const kept = <T>(sent: readonly T[] | undefined, rows: T[]): T[] | undefined => (sent === undefined || (rows.length === 0 && sent.length > 0) ? undefined : rows);
	return { ok: true, delta: { changeCriteria: kept(delta.changeCriteria, keptChanges), retireCriteria: kept(delta.retireCriteria, keptRetired) }, operations };
}
