import type { DataRuleReading, DataRuleVerdict } from '$application/use-cases';
import type { ChipTone } from '$ui/design-system/Chip.svelte';

/**
 * What one rule of the data model says to a person deciding: its status, the
 * tone it is shown in, the decision bucket it counts in, and the sentence that
 * explains it. Pure: the reading and the solver's verdict in.
 */

export type DecisionBucket =
	| 'broken'
	| 'unchecked'
	| 'proving'
	| 'not-tied'
	| 'held'
	| 'proved'
	| 'out-of-reach'
	| 'permission'
	/** Linked, on an installation that does not prove: every simulation checks it. */
	| 'simulated';

export interface RuleStatus {
	readonly label: string;
	readonly tone: ChipTone;
	readonly bucket: DecisionBucket;
	/** Why, in a sentence: the oracle's own for a solver verdict. */
	readonly detail?: string;
	/** The plan that opens the solver's proof of this rule, where the installation locks it (Community). */
	readonly lockedBy?: string;
}

const SOLVER: Readonly<Record<string, { label: string; tone: ChipTone; bucket: DecisionBucket }>> = {
	proved: { label: 'Proved', tone: 'success', bucket: 'proved' },
	broken: { label: 'Broken', tone: 'danger', bucket: 'broken' },
	impossible: { label: 'Impossible', tone: 'danger', bucket: 'broken' },
	contradicted: { label: 'Contradicted', tone: 'danger', bucket: 'broken' },
	unsettled: { label: 'Unsettled', tone: 'warning', bucket: 'unchecked' },
	'out-of-reach': { label: "Out of the solver's reach", tone: 'neutral', bucket: 'out-of-reach' },
	'never-exercised': { label: 'Never exercised', tone: 'warning', bucket: 'unchecked' }
};

const shown = (value: unknown): string => (typeof value === 'string' ? `"${value}"` : String(value ?? 'nothing'));

export function ruleStatus(
	rule: DataRuleReading,
	verdict: DataRuleVerdict | undefined,
	context: {
		readonly tableName: string;
		readonly proving: boolean;
		/** Whether the installation proves (Enterprise); without it nothing names the solver. */
		readonly proofs: boolean;
		/** On Community, the solver's lock: the plan that opens it and the sentence that says so (EVO-001). */
		readonly solverLock?: { readonly plan: string; readonly sentence: string };
	}
): RuleStatus {
	if (rule.check === 'none') return { label: 'Permission', tone: 'neutral', bucket: 'permission' };
	if (rule.check === 'out-of-reach') {
		return {
			label: context.proofs ? "Out of the solver's reach" : 'Not checked',
			tone: 'neutral',
			bucket: 'out-of-reach',
			...(rule.outOfReach ? { detail: `Not checked: ${rule.outOfReach}.` } : {})
		};
	}
	if (!rule.tiedTo) {
		return {
			label: 'Not checked yet',
			tone: 'neutral',
			bucket: 'not-tied',
			detail: context.proofs
				? `Link ${rule.fieldName} to the behaviour state that holds its value and the solver checks this rule against every feature.`
				: `Link ${rule.fieldName} to the behaviour state that holds its value and every simulation checks this rule.`
		};
	}
	if (rule.check === 'compare') {
		return rule.startsAs?.same
			? { label: 'Agrees', tone: 'success', bucket: 'proved', detail: `The behaviour starts ${rule.tiedTo} at the same value.` }
			: {
					label: 'Differs',
					tone: 'danger',
					bucket: 'broken',
					detail: `The behaviour starts ${rule.tiedTo} at ${shown(rule.startsAs?.behaviour)}.`
				};
	}
	if (rule.missing === 'existence') {
		return {
			label: 'Unchecked',
			tone: 'warning',
			bucket: 'unchecked',
			detail: `Say when a record of ${context.tableName} exists (a yes-or-no state, a status condition such as service.status != none, or always when the behaviour keeps one in play): a required field is only checked for a record that exists.`
		};
	}
	if (!context.proofs) {
		const simulated = `Every simulation refuses a step that leaves ${rule.fieldName} breaking this rule.`;
		// Community: the rule the solver would prove shows its proof locked, naming the plan that opens it.
		const lock = context.solverLock;
		return {
			label: 'Checked in simulation',
			tone: 'neutral',
			bucket: 'simulated',
			detail: lock ? `${simulated} ${lock.sentence}` : simulated,
			...(lock ? { lockedBy: lock.plan } : {})
		};
	}
	// No break within the bound is not a proof: never shown with the mark of one.
	if (verdict?.verdict === 'held-within-bound') {
		const steps = typeof verdict.answer.maxSteps === 'number' ? verdict.answer.maxSteps : null;
		return {
			label: steps === null ? 'Holds within the bound' : `Holds for ${steps} steps`,
			tone: 'neutral',
			bucket: 'held',
			...(verdict.summary ? { detail: verdict.summary } : {})
		};
	}
	if (verdict) {
		const known = SOLVER[verdict.verdict] ?? { label: verdict.verdict, tone: 'neutral' as ChipTone, bucket: 'unchecked' as DecisionBucket };
		return { ...known, ...(verdict.summary ? { detail: verdict.summary } : {}) };
	}
	// Waiting for the search is not a verdict: counted apart from what needs a decision.
	if (context.proving) return { label: 'Proving…', tone: 'neutral', bucket: 'proving' };
	return {
		label: 'Not proven yet',
		tone: 'warning',
		bucket: 'unchecked',
		detail: rule.invariantId ? 'The solver has not answered.' : 'The rule has not reached the engine yet.'
	};
}

/** The steps a broken rule's path takes, as a person reads them. */
export function breakingSteps(verdict: DataRuleVerdict | undefined): string[] {
	const path = (verdict?.answer.brokenBy as { path?: { featureName?: string; actionName?: string; parameters?: Record<string, unknown> }[] } | undefined)?.path ?? [];
	return path.map((step) => {
		const inputs = Object.entries(step.parameters ?? {}).map(([name, value]) => `${name} = ${shown(value)}`);
		return `${step.featureName ?? ''} › ${step.actionName ?? ''}${inputs.length ? ` (${inputs.join(', ')})` : ''}`;
	});
}
