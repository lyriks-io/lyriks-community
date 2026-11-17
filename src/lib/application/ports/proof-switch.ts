/**
 * Outbound port that applies the proofs switch (Settings → Proofs) to the
 * running engine: it holds the solver from now on, or not, without a restart
 * of the installation.
 */
export interface ProofSwitchPort {
	/** Whether this installation may prove at all: the Enterprise edition. */
	readonly allowed: boolean;
	/** Whether the operator turned the solver off in the environment (UNSPA_SOLVER=off). */
	readonly operatorTurnedOff: boolean;
	apply(on: boolean): void;
}
