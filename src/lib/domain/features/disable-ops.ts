/**
 * The two behaviour-batch operations that put an element aside and bring it
 * back (`disable_element`, `enable_element`), as the platform guards them
 * before the engine applies them: who disabled an element is the person signed
 * in, never what a client claims, and once the specification is validated
 * definitively the change goes through a change request.
 */

export type BatchOperation = Readonly<Record<string, unknown>>;

const DISABLE = 'disable_element';
const ENABLE = 'enable_element';

const kindOf = (op: BatchOperation): string => String(op.kind ?? op.op ?? '');

/** Whether the batch disables or enables anything. */
export function touchesDisabling(operations: readonly BatchOperation[]): boolean {
	return operations.some((op) => kindOf(op) === DISABLE || kindOf(op) === ENABLE);
}

/**
 * The refusal a validated specification answers to the batch, in the words of
 * its rules (840b0846, dc50bf71): null when the batch neither disables nor
 * enables, or when the specification is still a draft.
 */
export function validatedSpecRefusal(operations: readonly BatchOperation[], specValidated: boolean): string | null {
	if (!specValidated) return null;
	const first = operations.map(kindOf).find((kind) => kind === DISABLE || kind === ENABLE);
	if (first === DISABLE) return 'The specification is validated: disable it through a change request.';
	if (first === ENABLE) return 'The specification is validated: enable it through a change request.';
	return null;
}

/** Every disable stamped with who asked and when; the other operations as they came. */
export function stampDisableOps(operations: readonly BatchOperation[], by: string, at: string): BatchOperation[] {
	return operations.map((op) => (kindOf(op) === DISABLE ? { ...op, by, at } : op));
}
