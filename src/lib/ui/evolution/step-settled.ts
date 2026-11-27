import { getContext, setContext } from 'svelte';

/**
 * Whether the step a block is read in stands validated (criterion f97d4509 of
 * feat-34): its blocks then show who stands behind them and nothing to click.
 * The request page sets it for the tab it shows; a block outside a request
 * (Knowledge) reads it as never settled.
 */
export const STEP_SETTLED = Symbol('evo-step-settled');

export function settleStep(settled: () => boolean): void {
	setContext(STEP_SETTLED, settled);
}

export function stepSettled(): () => boolean {
	return getContext<(() => boolean) | undefined>(STEP_SETTLED) ?? (() => false);
}
