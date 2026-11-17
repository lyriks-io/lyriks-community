import type { EvolutionStep, StepReading } from '$domain/evolution';

/**
 * The six tabs a request is read along on its page. They group the eight
 * steps of the path for display only, under the design's names: the steps,
 * their gates and the operations underneath stay what they are.
 */
export type RequestTab = 'briefing' | 'solutioning' | 'specification' | 'impact' | 'development' | 'final_report';

export interface RequestTabDef {
	readonly id: RequestTab;
	readonly label: string;
	readonly steps: readonly EvolutionStep[];
}

export const REQUEST_TABS: readonly RequestTabDef[] = [
	{ id: 'briefing', label: 'Briefing', steps: ['need'] },
	{ id: 'solutioning', label: 'Solution', steps: ['solution', 'functional_spec', 'technical_spec'] },
	// The Impact analysis is read in two tabs: what the change touches, then the simulation of what it does to the product.
	{ id: 'specification', label: 'Specification', steps: ['impact_analysis'] },
	{ id: 'impact', label: 'Simulation', steps: ['impact_analysis'] },
	{ id: 'development', label: 'Implementation', steps: ['build'] },
	{ id: 'final_report', label: 'Verification', steps: ['approval', 'deployment'] }
];

export const tabLabel = (tab: RequestTab): string => REQUEST_TABS.find((t) => t.id === tab)?.label ?? tab;

/**
 * The tab a step is read in. At the Impact analysis the touched features come
 * first while they still owe an answer or a person's validation, or while none
 * is named yet (ac-evo-form-step-lock).
 */
export function tabOfStep(step: EvolutionStep, specificationWaits = false): RequestTab {
	switch (step) {
		case 'need':
			return 'briefing';
		case 'solution':
		case 'functional_spec':
		case 'technical_spec':
			return 'solutioning';
		case 'impact_analysis':
			return specificationWaits ? 'specification' : 'impact';
		case 'build':
			return 'development';
		default:
			return 'final_report';
	}
}

/** An answer as the step lock reads it: whether it is written, where its current version stands, and whether a person validated it. */
export interface AnswerHold {
	readonly filled: boolean;
	readonly validation?: string;
	readonly humanValidated?: boolean;
}

/**
 * Whether every written answer carries a person's validation, an AI client's
 * own aside: the Specification's reading (ac-evo-form-step-lock). Unlike a step
 * of prose, a Specification that holds no written answer holds nothing back.
 */
export function nothingWaitsOnPeople(answers: readonly AnswerHold[]): boolean {
	return answers.filter((a) => a.filled).every((a) => a.validation !== 'refused' && !!a.humanValidated);
}

export interface StepLockFacts {
	/** The tab the request stands on: it and the ones before it always open. */
	readonly current: RequestTab;
	/** The request reached the Impact analysis, its version is frozen, the code was read against it once. */
	readonly atImpactAnalysis: boolean;
	readonly versionFrozen: boolean;
	readonly codeRead: boolean;
}

/**
 * Why each tab does not open yet, in one sentence, or null when it opens.
 * Validating is optional until the build: the Solution and the Specification
 * always open, and no tab waits for a validation; the later tabs wait for the
 * request itself to reach them. The freeze is where the Solution's validation
 * is asked, on the crossing itself.
 */
export function tabLocks(facts: StepLockFacts): Record<RequestTab, string | null> {
	return {
		briefing: null,
		solutioning: null,
		specification: null,
		impact: facts.atImpactAnalysis ? null : 'The Simulation opens once the request reaches the Impact analysis: go on from the Specification.',
		development: facts.versionFrozen ? null : 'The Implementation opens once the Simulation froze a version.',
		final_report: facts.codeRead ? null : 'The Verification opens once the code was read against the frozen version.'
	};
}

export type TabState = 'done' | 'current' | 'ahead';

type StepFacts = Pick<StepReading, 'step' | 'progress' | 'validation'>;

/** A step that asks nothing more: validated, done where nobody validates it, or marked not applicable. */
const stepDone = (r: StepFacts) => r.progress === 'not_applicable' || !!r.validation?.validated || (r.progress === 'done' && !r.validation);

/**
 * Where each tab stands: the ones whose steps ask nothing more, the one the
 * request stands on included, so a live change reads every tab done
 * (ac-evo-form-tab-ticked); then the one it stands on, and the rest still
 * ahead. What the change touches is behind once the request reads its impact.
 */
export function tabStates(path: readonly StepFacts[], current: RequestTab): Record<RequestTab, TabState> {
	const done = (tab: RequestTabDef) =>
		(tab.id === 'specification' && current === 'impact') ||
		tab.steps.every((step) => {
			const r = path.find((s) => s.step === step);
			return !!r && stepDone(r);
		});
	return Object.fromEntries(
		REQUEST_TABS.map((tab) => [tab.id, done(tab) ? 'done' : tab.id === current ? 'current' : 'ahead'])
	) as Record<RequestTab, TabState>;
}
