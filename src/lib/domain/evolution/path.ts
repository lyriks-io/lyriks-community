import type { AuthorKind, RequestStage } from './enums';
import { STAGE_ORDER } from './enums';
import type { DraftLeaf, EvolutionRequest, SkippableStep, StepSkip } from './draft';
import { behaviourOperationCount, skippedQuestionOf, STEP_QUESTIONS } from './draft';
import { NEED_KEYS, fieldKey, type NeedKey } from './blocks';
import { openCustomQuestions } from './custom-questions';
import { diagramBehindTexts, textsBehindDiagram } from './functional-sync';
import { awaitedAmong, goneFrom, isWholeValidatedStep, namedOn, stepTarget } from './named-validators';

/**
 * The path a request is read along: the usual path of a specification, from
 * the need to the deployment (ac-evo-req-6).
 *
 * The four stages and their gates stay the engine underneath. The path is how a
 * person reads where a request stands: Need, Solution, Functional spec and
 * Technical spec run inside Specify, Impact analysis is the challenge whose exit
 * freezes the spec, Build is Verify, Approval is Accept and Deployment is
 * Delivered.
 *
 * The four steps of specification are not gated against one another
 * (ac-evo-req-7); what holds the freeze is that each of them is validated by
 * the people it was asked of, or marked not applicable (ac-evo-req-19,
 * ac-evo-gate-steps). The Impact analysis is the platform's reading of the
 * change on the product as it stands: nobody validates it, leaving it is the
 * decision (ac-evo-form-impact-step).
 */
export const EVOLUTION_STEPS = [
	{ code: 'need', label: 'Need', stage: 'specification' },
	{ code: 'solution', label: 'Solution', stage: 'specification' },
	{ code: 'functional_spec', label: 'Functional spec', stage: 'specification' },
	{ code: 'technical_spec', label: 'Technical spec', stage: 'specification' },
	{ code: 'impact_analysis', label: 'Impact analysis', stage: 'coherence' },
	{ code: 'build', label: 'Build', stage: 'implementation' },
	{ code: 'approval', label: 'Approval', stage: 'acceptance' },
	{ code: 'deployment', label: 'Deployment', stage: 'delivered' }
] as const satisfies readonly { code: string; label: string; stage: RequestStage }[];
export type EvolutionStep = (typeof EVOLUTION_STEPS)[number]['code'];
export const isEvolutionStep = (v: unknown): v is EvolutionStep =>
	typeof v === 'string' && EVOLUTION_STEPS.some((s) => s.code === v);
export const stepLabel = (step: EvolutionStep): string =>
	EVOLUTION_STEPS.find((s) => s.code === step)?.label ?? step;

/**
 * The steps people validate. The Impact analysis is read by the platform, Build
 * is judged line by line and Deployment is declared.
 */
export const VALIDATED_STEPS = ['need', 'solution', 'functional_spec', 'technical_spec', 'approval'] as const;
export type ValidatedStep = (typeof VALIDATED_STEPS)[number];
export const isValidatedStep = (v: unknown): v is ValidatedStep =>
	typeof v === 'string' && (VALIDATED_STEPS as readonly string[]).includes(v);

/** The steps whose validation the freeze reads. */
export const SPEC_STEPS: readonly ValidatedStep[] = ['need', 'solution', 'functional_spec', 'technical_spec'];

/**
 * The answers of the steps of prose edit until the freeze, validated or not
 * (ac-evo-form-edit-anytime): at one of those steps and at the Impact
 * analysis, which follows what they say and never locks them. From the
 * freeze on they read, until the specification is reopened.
 */
export function answersEditableAt(step: EvolutionStep): boolean {
	return step === 'impact_analysis' || (SPEC_STEPS as readonly string[]).includes(step);
}

/**
 * Who stands behind a step: one validation is enough (ac-evo-req-19), unless
 * people are named on the step (ac-evo-req-named-validators), which lives on
 * the request. `validatorIds` is what requests stored when validators could
 * first be named; it is kept so the history reads, and gates nothing.
 */
export interface StepValidation {
	step: ValidatedStep;
	validatorIds: string[];
	validations: { by: string; kind: AuthorKind; at: string }[];
}

export type StepProgress = 'todo' | 'in_progress' | 'done' | 'not_applicable';

export interface StepReading {
	readonly step: EvolutionStep;
	readonly label: string;
	readonly progress: StepProgress;
	/** Null on a step nobody validates (Impact analysis, Build, Deployment). */
	readonly validation: {
		readonly validated: boolean;
		/** Who validated it. */
		readonly given: readonly string[];
		/** The people named on the step, when someone named them (ac-evo-req-named-validators). */
		readonly expected: readonly string[];
		/** The people named on the step who left the workspace since: no longer waited on. */
		readonly gone: readonly string[];
	} | null;
	readonly skip: StepSkip | null;
	/** True on the one step the page opens on. */
	readonly current: boolean;
	/** One sentence a person reads under the step: what it holds, or what it waits for. */
	readonly detail: string;
}

/** What the path reads from the rest of the dossier, computed by the caller who holds the features. */
export interface PathFacts {
	/** Questions asked of the subjects that hold no answer yet. */
	readonly questionsOwed: number;
	/** Values waiting for a signature. */
	readonly pendingProposals: number;
}

/** The validation record of one step, empty when nobody acted on it yet. */
export function validationOf(request: Pick<EvolutionRequest, 'stepValidations'>, step: ValidatedStep): StepValidation {
	return (
		request.stepValidations.find((v) => v.step === step) ?? { step, validatorIds: [], validations: [] }
	);
}

type StepJudged = Pick<EvolutionRequest, 'stepValidations'> & { readonly namedValidators?: EvolutionRequest['namedValidators'] };

/** The people named on a step validated as a whole; empty on the Need and the Solution, named answer by answer. */
export const namedOnStep = (request: StepJudged, step: ValidatedStep): readonly string[] =>
	isWholeValidatedStep(step) ? namedOn(request, stepTarget(step)) : [];

/** Whether someone stands behind a step: one person, or every person named on it (ac-evo-req-named-validators). */
export function isStepValidated(request: StepJudged, step: ValidatedStep): boolean {
	const given = validationOf(request, step).validations.map((v) => v.by);
	const expected = namedOnStep(request, step);
	return expected.length > 0 ? awaitedAmong(expected, given).length === 0 : given.length > 0;
}

export const skipOf = (request: Pick<EvolutionRequest, 'skippedSteps'>, step: EvolutionStep): StepSkip | null =>
	request.skippedSteps.find((s) => s.step === step) ?? null;

/** The steps of specification the freeze still waits for: neither validated nor marked not applicable. */
export function unvalidatedSpecSteps(request: StepJudged & Pick<EvolutionRequest, 'skippedSteps'>): ValidatedStep[] {
	return SPEC_STEPS.filter((step) => skipOf(request, step) === null && !isStepValidated(request, step));
}

/** The need keys whose answer is critical for the freeze (ac-evo-gate-need). */
export const CRITICAL_NEED_KEYS: readonly NeedKey[] = ['situation', 'objectives'];

const needAnswered = (request: Pick<EvolutionRequest, 'need' | 'openQuestionKeys'>, key: NeedKey): boolean =>
	request.need[key].trim() !== '' && !request.openQuestionKeys.includes(fieldKey(`00-need.${key}`));
/** Answered, or left unanswered on purpose: nothing is owed on it (ac-evo-form-question-skip). */
const needSettled = (request: Pick<EvolutionRequest, 'need' | 'openQuestionKeys' | 'skippedQuestions'>, key: NeedKey): boolean =>
	needAnswered(request, key) || skippedQuestionOf(request, fieldKey(`00-need.${key}`)) !== null;

/**
 * The critical questions of the need still owed, by field path. Nothing is
 * owed when the Need step is marked not applicable: that mark is the named,
 * visible way a small change says it has no need to state.
 */
export function needCriticalEmpty(request: Pick<EvolutionRequest, 'need' | 'openQuestionKeys' | 'skippedSteps' | 'skippedQuestions'>): string[] {
	if (skipOf(request, 'need')) return [];
	return CRITICAL_NEED_KEYS.filter((key) => !needSettled(request, key)).map((key) => `00-need.${key}`);
}

/** The steps of prose whose description and first question are required (ac-evo-sol-prose, ac-evo-func-prose). */
export type ProseStep = 'solution' | 'functional_spec';

/**
 * The texts a step of prose still owes, by field path: its description and its
 * required questions. Nothing is owed once the step is marked not applicable.
 */
export function requiredTextsEmpty(
	request: Pick<EvolutionRequest, 'stepDescriptions' | 'stepAnswers' | 'skippedSteps'> & {
		readonly openQuestionKeys?: readonly string[];
		readonly skippedQuestions?: EvolutionRequest['skippedQuestions'];
	},
	step: ProseStep
): string[] {
	if (skipOf(request, step)) return [];
	// A required text postponed is owed like an empty one (ac-evo-form-question-acts);
	// one skipped on purpose is owed no longer (ac-evo-form-question-skip).
	const postponed = new Set(request.openQuestionKeys ?? []);
	const skipped = new Set((request.skippedQuestions ?? []).map((s) => s.key));
	const owed = (path: string, value: string) => (value.trim() === '' && !skipped.has(path)) || postponed.has(path);
	return [
		...(owed(`step.${step}.description`, request.stepDescriptions[step]) ? [`step.${step}.description`] : []),
		...STEP_QUESTIONS.filter((q) => q.step === step && q.required && owed(`step.${q.step}.${q.key}`, request.stepAnswers[step][q.key] ?? '')).map(
			(q) => `step.${q.step}.${q.key}`
		)
	];
}

/** Whether a step of prose holds any text at all. */
const writtenOn = (request: Pick<EvolutionRequest, 'stepDescriptions' | 'stepAnswers'>, step: 'solution' | 'functional_spec' | 'technical_spec'): boolean =>
	request.stepDescriptions[step].trim() !== '' || STEP_QUESTIONS.some((q) => q.step === step && (request.stepAnswers[step][q.key] ?? '').trim() !== '');

/** What a required text is called in a sentence that says it is owed. */
const OWED_LABEL: Record<string, string> = {
	'step.solution.description': 'what changes',
	'step.solution.examples': 'how we will know it works',
	'step.functional_spec.description': 'how it goes',
	'step.functional_spec.refusals': 'its rules'
};

const hasBehaviour = (draft: DraftLeaf): boolean =>
	draft.behaviour.length > 0 || behaviourOperationCount(draft.behaviourModel) > 0;

const stageAtLeast = (stage: RequestStage, than: RequestStage): boolean =>
	STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(than);

function progressOf(request: EvolutionRequest, step: EvolutionStep, facts: PathFacts): { progress: StepProgress; detail: string } {
	if (skipOf(request, step)) return { progress: 'not_applicable', detail: `Not applicable: ${skipOf(request, step)?.reason}` };
	// One subject per change: an amendment and the feature it stands for are one.
	const standIns = new Set(request.drafts.map((d) => d.baseLeafId).filter((id): id is string => id !== null));
	const subjects = request.leafIds.filter((id) => !standIns.has(id) || !request.leafIds.some((other) => other !== id && request.drafts.some((d) => d.id === other && d.baseLeafId === id))).length;
	switch (step) {
		case 'need': {
			const answered = NEED_KEYS.filter((key) => needAnswered(request, key)).length;
			const owed = needCriticalEmpty(request);
			if (answered === 0) return { progress: 'todo', detail: 'Describe the change, then the facts behind it.' };
			if (owed.length > 0 || !needSettled(request, 'description')) {
				const missing = [
					...(needSettled(request, 'description') ? [] : ['the description']),
					...owed.map((path) => (path.endsWith('situation') ? 'the current situation' : 'the objectives'))
				];
				// "The objectives" is one plural noun: "the objectives are owed".
				const plural = missing.length > 1 || missing[0] === 'the objectives';
				return { progress: 'in_progress', detail: `${answered} of ${NEED_KEYS.length} questions answered; ${missing.join(' and ')} ${plural ? 'are' : 'is'} owed.` };
			}
			return { progress: 'done', detail: `${answered} of ${NEED_KEYS.length} questions answered.` };
		}
		case 'solution': {
			// Prose (ac-evo-sol-prose): the features it touches are read at the Impact analysis.
			if (!writtenOn(request, 'solution')) return { progress: 'todo', detail: 'Say what changes in the product, and how we will know it works.' };
			const owed = requiredTextsEmpty(request, 'solution');
			if (owed.length > 0) return { progress: 'in_progress', detail: `Still to write: ${owed.map((path) => OWED_LABEL[path]).join(' and ')}.` };
			return { progress: 'done', detail: 'Written.' };
		}
		case 'functional_spec': {
			// Prose first (ac-evo-func-prose): the behaviour model is the AI's optional translation (ac-evo-func-model).
			const owed = requiredTextsEmpty(request, 'functional_spec');
			if (!writtenOn(request, 'functional_spec')) return { progress: 'todo', detail: 'Say how it goes for the person using it, and what the product refuses.' };
			if (owed.length > 0) return { progress: 'in_progress', detail: `Still to write: ${owed.map((path) => OWED_LABEL[path]).join(' and ')}.` };
			// Never behind in silence (ac-evo-func-uml-sync).
			if (diagramBehindTexts(request)) return { progress: 'in_progress', detail: 'Written; the diagram is behind the texts, to redraw from them.' };
			if (textsBehindDiagram(request).length > 0) return { progress: 'in_progress', detail: 'Written; the diagram changed a text, to update from it.' };
			const translated = request.drafts.filter(hasBehaviour).length;
			return { progress: 'done', detail: translated === 0 ? 'Written.' : `Written; translated by the AI on ${translated} ${translated === 1 ? 'subject' : 'subjects'}.` };
		}
		case 'technical_spec': {
			// Prose (ac-evo-tech-prose): the tables themselves are declared at the Impact analysis.
			const described = request.stepDescriptions.technical_spec.trim() !== '';
			if (stageAtLeast(request.stage, 'implementation'))
				return { progress: 'done', detail: `${writtenOn(request, 'technical_spec') ? 'Written' : 'Not described'}; frozen in version ${request.specVersion}.` };
			if (!writtenOn(request, 'technical_spec'))
				return { progress: 'todo', detail: 'Say what the change asks of the technique: the constraints and risks you know of, the data it moves.' };
			if (!described) return { progress: 'in_progress', detail: 'The technical constraints and risks are not described yet.' };
			// Never behind in silence (ac-evo-tech-uml-sync).
			if (diagramBehindTexts(request, 'technical_spec')) return { progress: 'in_progress', detail: 'Written; the diagram is behind the description, to redraw from it.' };
			return textsBehindDiagram(request, 'technical_spec').length > 0
				? { progress: 'in_progress', detail: 'Written; the diagram changed the description, to update from it.' }
				: { progress: 'done', detail: 'Written.' };
		}
		case 'impact_analysis': {
			if (stageAtLeast(request.stage, 'implementation')) return { progress: 'done', detail: `Version ${request.specVersion} frozen on the request.` };
			const impact = request.impactReport.status === 'ready';
			const coherence = request.coherenceReport.status === 'ready';
			// What the change touches is answered here (ac-evo-form-impact-step).
			if (subjects === 0) return { progress: request.stage === 'coherence' ? 'in_progress' : 'todo', detail: 'Name the features the change touches, from the Solution.' };
			if (facts.questionsOwed > 0 || facts.pendingProposals > 0)
				return {
					progress: request.stage === 'coherence' ? 'in_progress' : 'todo',
					detail: `${subjects} ${subjects === 1 ? 'feature' : 'features'} touched; ${facts.questionsOwed} ${facts.questionsOwed === 1 ? 'question' : 'questions'} to answer, ${facts.pendingProposals} ${facts.pendingProposals === 1 ? 'value' : 'values'} to sign.`
				};
			// Read, but not left yet: leaving it, the freeze, is what a person decides.
			if (impact && coherence) return { progress: 'in_progress', detail: 'Impact and coherence read; leaving this step freezes the version.' };
			if (impact || coherence || request.stage === 'coherence')
				return { progress: 'in_progress', detail: impact ? 'The coherence check has not run yet.' : 'The impact has not been computed yet.' };
			return { progress: 'todo', detail: 'Read on its own once the steps of specification are validated.' };
		}
		case 'build':
			if (stageAtLeast(request.stage, 'acceptance')) return { progress: 'done', detail: 'Accepted: the code matches the frozen version.' };
			if (request.stage === 'implementation') return { progress: 'in_progress', detail: `Building against version ${request.specVersion}, not official until declared live.` };
			return { progress: 'todo', detail: 'Opens once the spec is frozen.' };
		case 'approval':
			if (stageAtLeast(request.stage, 'delivered')) return { progress: 'done', detail: 'Approved.' };
			if (request.stage === 'acceptance') {
				// Ready to approve once every remark is ruled and every validated one
				// is written back: the validation is what then carries it to Deployment.
				const unruled = request.observations.filter((o) => o.status === 'logged' && o.ruling === 'open').length;
				const unfolded = request.observations.filter((o) => o.ruling === 'validated' && !o.foldedBackAt).length;
				if (unruled + unfolded === 0)
					return { progress: 'done', detail: request.observations.length === 0 ? 'Walk the change; approve it when it reads right.' : 'Every remark is settled: approve it.' };
				return {
					progress: 'in_progress',
					detail: [unruled ? `${unruled} ${unruled === 1 ? 'remark' : 'remarks'} to rule` : '', unfolded ? `${unfolded} to write back into the spec` : ''].filter(Boolean).join(', ') + '.'
				};
			}
			return { progress: 'todo', detail: 'Opens once the build is accepted.' };
		case 'deployment':
			if (request.deployment)
				return {
					progress: 'done',
					detail: `Declared live on ${request.deployment.declaredAt.slice(0, 10)}${request.deployment.releaseId ? ` in ${request.deployment.releaseId}` : ''}.`
				};
			if (request.stage === 'delivered' && request.status === 'open') return { progress: 'in_progress', detail: 'Declare the change live once it is.' };
			return { progress: 'todo', detail: 'Opens once the change is approved.' };
	}
}

/** The step a request is read at, from its stage first, then from what it holds. */
function currentStepOf(request: EvolutionRequest, readings: readonly Omit<StepReading, 'current'>[]): EvolutionStep {
	if (request.status === 'closed' || request.stage === 'delivered') return 'deployment';
	if (request.stage === 'acceptance') return 'approval';
	if (request.stage === 'implementation') return 'build';
	// Validating is optional until the build: before the freeze the request reads
	// at the first step of specification still to write, validated or not.
	if (request.stage === 'coherence') return 'impact_analysis';
	const open = readings.find(
		(r) => (SPEC_STEPS as readonly string[]).includes(r.step) && r.progress !== 'not_applicable' && r.progress !== 'done'
	);
	return open?.step ?? 'impact_analysis';
}

/** The eight steps of a request, each with its progress, its validation and its skip. */
export function readPath(request: EvolutionRequest, facts: PathFacts): StepReading[] {
	const readings = EVOLUTION_STEPS.map((s) => {
		const read = progressOf(request, s.code, facts);
		// A custom question is owed like a generic one (ac-evo-coach-custom-1).
		const asked = read.progress === 'not_applicable' ? 0 : openCustomQuestions(request, s.code).length;
		const progress: StepProgress = asked > 0 && read.progress === 'done' ? 'in_progress' : read.progress;
		const detail = asked > 0 ? `${read.detail} ${asked} ${asked === 1 ? 'question asked of this request is' : 'questions asked of this request are'} owed.` : read.detail;
		const validated = isValidatedStep(s.code) ? validationOf(request, s.code) : null;
		const given = validated ? [...new Set(validated.validations.map((v) => v.by))] : [];
		return {
			step: s.code,
			label: s.label,
			progress,
			validation: validated
				? {
						validated: isStepValidated(request, validated.step),
						given,
						expected: namedOnStep(request, validated.step),
						gone: isWholeValidatedStep(validated.step) ? goneFrom(request, stepTarget(validated.step)) : []
					}
				: null,
			skip: skipOf(request, s.code),
			detail
		};
	});
	const current = currentStepOf(request, readings);
	return readings.map((r) => ({ ...r, current: r.step === current }));
}

/** Drop the validations of the steps a change reopened (ac-evo-req-21). */
export function reopenSteps(request: EvolutionRequest, steps: readonly ValidatedStep[]): EvolutionRequest {
	if (!request.stepValidations.some((v) => steps.includes(v.step) && v.validations.length > 0)) return request;
	return {
		...request,
		stepValidations: request.stepValidations.map((v) => (steps.includes(v.step) ? { ...v, validations: [] } : v))
	};
}

export type { SkippableStep };
