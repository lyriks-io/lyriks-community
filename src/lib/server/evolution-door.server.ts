/**
 * What the write door of the Evolution section asks of a batch before any
 * operation runs (issue 38, EVO-001). Pure: it reads the operation names only;
 * each act still applies its own rules once through the door.
 */

/**
 * The acts the request lets a viewer make: a comment or a reply, an edit of
 * their own message, a ruling on a conversation, an ask of their own AI (an ask
 * is a comment), taking back or cancelling their own click, making their
 * exchange a comment, and their AI's answer to a click made outside a request.
 * A batch made only of these needs the right to read the project; every other
 * act needs the right to write it.
 */
export const READER_OPERATIONS: ReadonlySet<string> = new Set([
	'post_on_field',
	'edit_message',
	'validate_topic',
	'resolve_topic',
	'reopen_topic',
	'send_click',
	'withdraw_click',
	'cancel_click',
	'publish_exchange',
	'answer_click'
]);

/** The acts of the session of the whole project: Ask my AI is not an Evolution, so Community keeps them. */
const PROJECT_SESSION_OPERATIONS: ReadonlySet<string> = new Set(['answer_click']);

/** An operation is named by `op`, or by `kind` the way the behavior batch spells it. */
function operationName(operation: unknown): string {
	if (!operation || typeof operation !== 'object') return '';
	const { op, kind } = operation as { op?: unknown; kind?: unknown };
	if (typeof op === 'string' && op) return op;
	return typeof kind === 'string' ? kind : '';
}

/** The right a batch needs on the project: read when every act in it is one a viewer may make. */
export function accessNeededFor(operations: readonly unknown[]): 'read' | 'write' {
	return operations.length > 0 && operations.every((op) => READER_OPERATIONS.has(operationName(op))) ? 'read' : 'write';
}

/** Whether the batch only answers clicks made outside a request, which the Community lock on Evolutions leaves open. */
export function onlyProjectSessionActs(operations: readonly unknown[]): boolean {
	return operations.length > 0 && operations.every((op) => PROJECT_SESSION_OPERATIONS.has(operationName(op)));
}
