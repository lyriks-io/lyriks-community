/** Exact source identifiers behind one rendered variable label, as a read-only text span. */
export interface VariableHint {
	readonly start: number;
	readonly end: number;
	readonly identifiers: readonly string[];
}
