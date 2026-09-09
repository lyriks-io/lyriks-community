/**
 * Shared run-mode contract between NodeRenderer (the renderer) and the run
 * controller (the interpreter, implemented in run-controller.svelte.ts). Keeping
 * it here lets the renderer stay agnostic of the engine and avoids a cycle.
 */
import type { RowContext, TransitionTrigger } from '$domain/experience';

export interface RunGate {
	visible: boolean;
	enabled: boolean;
}

/**
 * Every value/interaction method takes an optional row context because ONE
 * authored element can be rendered once per row of a bound list: the row decides
 * which record an action applies to and which slot a field value lives in.
 */
export interface RunController {
	/** Persona-gating resolution for a node at render time (row-aware inside a list). */
	gateOf(nodeId: string, ctx?: RowContext | null): RunGate;
	/** Fire an interaction (click / hover / change / submit) on an element node. */
	interact(nodeId: string, trigger: TransitionTrigger, ctx?: RowContext | null): void;
	/** Current typed value of a field node (live). */
	inputValue(nodeId: string, rowKey?: string | null): string;
	/** Write a typed value into a field node's bound state. */
	setFieldValue(nodeId: string, value: string, rowKey?: string | null): void;
	/** Live validation error messages for a field node. */
	fieldErrors(nodeId: string, rowKey?: string | null): string[];
	/** True once the user has touched (blurred) this field, or submitted the screen. */
	isTouched(nodeId: string, rowKey?: string | null): boolean;
	/** Mark a field touched (on blur) so its validation errors may show. */
	markTouched(nodeId: string, rowKey?: string | null): void;
	/** Live choices for a `select` element (authored list or a collection field). */
	selectOptions(nodeId: string): string[];
	/** True when a require-valid button is blocked by invalid inputs on its screen. */
	isBlocked(nodeId: string): boolean;
	/** Live backend rows for a list element bound to a collection (empty if unbound). */
	listRows(nodeId: string): Record<string, unknown>[];
	/** Resolve `{state.path}` placeholders in a label against the live run state. */
	resolve(text: string): string;
	/** Resolve a label inside a list row template against `row` (then run state). */
	resolveRow(text: string, row: Record<string, unknown>): string;
	/** Read a live run-state value at a dotted path (used by tabs/overlay chrome). */
	stateValue(path: string): unknown;
	/** Write a live run-state value at a dotted path (tabs selection, close overlay). */
	setState(path: string, value: unknown): void;
}
