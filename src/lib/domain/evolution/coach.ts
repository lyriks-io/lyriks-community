import { isDescribedStep, skippedQuestionOf, STEP_QUESTIONS, type EvolutionRequest, type StepQuestion } from './draft';
import { isStepValidated, type StepReading } from './path';
import { openCustomQuestions } from './custom-questions';
import { FUNCTIONAL_DIAGRAM_KEY } from './functional-diagram';
import { diagramBehindTexts, solutionDiagramOwed, textsBehindDiagram } from './functional-sync';

/**
 * What to do next on a request, said to whoever drives it: the AI client that
 * prepares the change with a person, or the person reading the page.
 *
 * A request is prepared in conversation. The person knows the need and decides;
 * the client asks the right question at the right moment, writes what was said,
 * and hands back what only a person may decide. Left to itself a client asks
 * everything at once or nothing at all, so the dossier says, at every moment,
 * the few questions that matter now and the operations that follow from the
 * answers. Pure: computed from the readings the dossier already holds.
 */
export interface Coaching {
	/** The step the request stands at. */
	readonly step: StepReading['step'];
	/** Where the request stands, in one plain sentence to say to the person. */
	readonly say: string;
	/** The questions to put to the person now, in the order to ask them. Empty when nothing is to be asked. */
	readonly ask: readonly string[];
	/** What the client does with the answers: operations, in order. */
	readonly then: readonly string[];
	/** What only a person decides here; a client relays it (`as_person`) only once they said it. */
	readonly personDecides: readonly string[];
}

export interface CoachFacts {
	readonly path: readonly StepReading[];
	readonly pendingProposals: number;
	/** Fields asked of the subjects that hold no answer and no proposal. */
	readonly questionsOwed: number;
	/** The next gate: whether it is met, and the sentence it refuses with. */
	readonly gate: { readonly ok: boolean; readonly reason: string | null };
	readonly collisions: number;
	readonly frictions: number;
	/** Report lines this request brought that nobody decided. */
	readonly undecidedLines: number;
	/** True when one person is the whole workspace: they carry each step alone. */
	readonly solo: boolean;
	/** Need and Solution are validated answer by answer: how many answers they hold, and how many are validated. */
	readonly inputs?: { readonly need: InputTally; readonly solution: InputTally };
	/**
	 * The items the Specification asks a person to validate (each written answer
	 * of the touched features, the values an AI typed on a draft included, each
	 * action it offers and each path of the journey) and how many a person stands
	 * behind: the Simulation and the freeze wait for all of them (ac-evo-form-step-lock).
	 */
	readonly specification?: InputTally;
}

interface InputTally {
	readonly total: number;
	readonly validated: number;
}

const needQuestion: Record<string, string> = {
	description: 'In your own words, what is the change about, and who asked for it?',
	situation: 'What happens today, and for whom?',
	objectives: 'What should be true once the change ships?',
	symptoms: 'What goes wrong today, how often? One real example helps.',
	cost: 'What does it cost today: time, errors, money, customers?',
	measures: 'Which number should move, from what value today to what target?'
};

/** The description each step opens on, asked in the person's own words (ac-evo-form-step-description). */
const stepDescriptionQuestion: Record<string, string> = {
	solution: 'In your own words, what changes in the product?',
	functional_spec: 'In your own words, walk it through as the person using it does: what they do, what the product answers.',
	technical_spec: 'In your own words, what technical constraint or risk do you already know of?'
};

/** What a step's description asks, as the person and their AI read it. */
export const stepDescriptionQuestionOf = (step: string): string | null => stepDescriptionQuestion[step] ?? null;

const READ_THE_DESCRIPTION =
	'Read the description: propose a value on each empty field of the step, citing it, and ask_question for what only this request needs answered (five open at most).';

/** What the Solution's description owes in the same batch: the page shows 2.1 and its drawing with it (ac-evo-sol-with-diagram). */
const SOLUTION_WITH_DIAGRAM =
	'The use case diagram is owed: the page shows the Solution, the Functional spec and the Technical spec as ONE Solution tab, so the Solution never goes without 2.1 Functional requirements and its use case diagram. In the same batch, from the Solution: update_step_description {step: "functional_spec", description} (walked through as the person using it does it), answer_step {step: "functional_spec", question: "refusals" | "failures", answer}, then redraw_diagram {step: "functional_spec", diagram} drawn from those texts.';
/** The technical side, when there is one, comes with its own diagram (ac-evo-sol-with-diagram). */
const TECHNICAL_WITH_DIAGRAM =
	'When the change has a technical side (a new store, a new dependency, a call that can fail), write 2.2 Technical requirements and draw its technical diagram in the same batch: update_step_description {step: "technical_spec", description}, then redraw_diagram {step: "technical_spec", diagram}; when it has none, mark_step_not_applicable {step: "technical_spec", reason}.';

const emptyAnswer = (request: EvolutionRequest, q: StepQuestion): boolean =>
	(request.stepAnswers[q.step][q.key] ?? '').trim() === '' && !skippedQuestionOf(request, `step.${q.step}.${q.key}`);

const SOLUTION_TAB = ['solution', 'functional_spec', 'technical_spec'] as const;

/**
 * The required texts the Solution tab still owes, across its three steps (criterion
 * 6c37a06f): the page shows the Solution, the Functional spec and the Technical spec
 * as one tab, and a step written but missing one of them refuses its Validate. A step
 * not written yet is asked by its own description first; one marked not applicable owes nothing.
 */
export function owedInSolutionTab(request: EvolutionRequest): StepQuestion[] {
	const written = (step: (typeof SOLUTION_TAB)[number]) => request.stepDescriptions[step].trim() !== '' && !request.skippedSteps.some((s) => s.step === step);
	return STEP_QUESTIONS.filter((q) => q.required && (SOLUTION_TAB as readonly string[]).includes(q.step) && written(q.step as (typeof SOLUTION_TAB)[number]) && emptyAnswer(request, q));
}

/** How a required text of the tab is asked, named as the page shows it (2.1 lines carry their kind on a chip). */
const OWED_IN_TAB: Readonly<Record<string, string>> = {
	'solution.examples':
		'2.1 Example is owed: the Solution cannot be validated without how we will know it works. answer_step {step: "solution", question: "examples", answer}: one checkable example per line, in the person\'s words.',
	'functional_spec.refusals':
		'2.1 Rule is owed: the Functional spec cannot be validated without its rules, and the person\'s Validate is refused while it is empty. answer_step {step: "functional_spec", question: "refusals", answer}: what the product allows or refuses and why, one rule per line. A change that refuses nothing new says so in one line (Nothing new: the product refuses what it refused before), or skip_question {fieldPath: "step.functional_spec.refusals", reason} says why it is not asked; never hand the Solution over with it empty.'
};

function validationAsk(step: StepReading, solo: boolean, inputs?: CoachFacts['inputs'], needed = 1): string[] {
	if (!step.validation || step.validation.validated || step.progress !== 'done') return [];
	const tally = step.step === 'need' || step.step === 'solution' ? inputs?.[step.step] : undefined;
	if (tally && tally.total > 0) {
		const left = tally.total - tally.validated;
		// Several people behind each answer when the request asks for it (ac-evo-req-validations-per-answer).
		const each = needed > 1 ? `, ${needed} different people on each` : '';
		return [`Validate each answer of ${step.label} (validate_field {fieldPath, leafId?}): ${left} of ${tally.total} left, waiting on ${solo ? 'you' : 'anyone with access to the project'}${each}. The step stands validated with the last one.`];
	}
	const who = solo ? 'you' : 'anyone with access to the project';
	return [`Validate ${step.label} (validate_step "${step.step}"): waiting on ${who}.`];
}

export function coachOf(request: EvolutionRequest, facts: CoachFacts): Coaching {
	const current = facts.path.find((s) => s.current) ?? facts.path[0];
	const step = current.step;
	const ask: string[] = [];
	const then: string[] = [];
	const decides: string[] = [];
	let say = current.detail;
	const specificationLeft = facts.specification ? facts.specification.total - facts.specification.validated : 0;

	switch (step) {
		case 'need': {
			// A question already answered, or whose answer waits for a signature, is not asked again.
			const proposed = new Set(
				request.proposals
					.filter((p) => p.decision === 'pending' || p.decision === 'reworded')
					.map((p) => p.targetField.replace(/^00-need\./, ''))
			);
			// A question skipped on purpose is not asked again (ac-evo-form-question-skip).
			const unasked = (key: keyof typeof needQuestion) =>
				request.need[key as keyof typeof request.need].trim() === '' && !proposed.has(key) && !skippedQuestionOf(request, `00-need.${key}`);
			const missing = (['description', 'situation', 'objectives'] as const).filter(unasked);
			for (const key of missing) ask.push(needQuestion[key]);
			if (missing.length === 0 && proposed.size === 0)
				for (const key of ['cost', 'measures'] as const) if (unasked(key)) ask.push(`${needQuestion[key]} (optional)`);
			if (missing.includes('description'))
				then.push('update_need {description}: the person\'s own words, verbatim.');
			if (ask.length > 0)
				then.push(
					'register_source with their words in the note, then propose each answer on 00-need.<question> citing it (leafId: null). Never guess a fact they did not say: ask it.'
				);
			say =
				missing.length > 0
					? 'The request starts with the need: why it exists, before what it changes.'
					: proposed.size > 0
						? 'The answers of the need are proposed: sign them, reword them, or refuse them.'
						: 'The need is written. Read it back to the person before asking them to validate it.';
			break;
		}
		case 'solution':
		case 'functional_spec':
		case 'technical_spec': {
			// Prose up to the Impact analysis (ac-evo-sol-prose, ac-evo-func-prose, ac-evo-tech-prose).
			// The diagram is drawn by the AI from the texts, never asked of the person (ac-evo-func-uml-ai).
			const unanswered = STEP_QUESTIONS.filter((q) => q.step === step && q.key !== FUNCTIONAL_DIAGRAM_KEY && emptyAnswer(request, q));
			for (const q of unanswered) ask.push(q.required ? q.question : `${q.question} (optional)`);
			if (unanswered.length > 0)
				then.push(
					`answer_step {step: "${step}", question: ${unanswered.map((q) => `"${q.key}"`).join(' | ')}, answer}: their words, verbatim. Cite an element of the product as @[name](kind:id) (kind feature, screen, rule or term).`
				);
			// The tab's other steps are validated with it: a required text they owe is owed now (criterion 6c37a06f).
			const owedInTab = owedInSolutionTab(request).filter((q) => q.step !== step);
			for (const q of owedInTab) {
				ask.push(q.question);
				then.push(OWED_IN_TAB[`${q.step}.${q.key}`] ?? `answer_step {step: "${q.step}", question: "${q.key}", answer}: required before the Solution is handed over.`);
			}
			// The Solution tab is the Solution, the Functional and the Technical spec as one: its texts come
			// with the requirements and the use case diagram drawn from them, in the same batch (ac-evo-sol-with-diagram).
			if (step === 'solution' && request.stepDescriptions.solution.trim() !== '') {
				if (solutionDiagramOwed(request) && request.stepDescriptions.functional_spec.trim() === '') then.unshift(SOLUTION_WITH_DIAGRAM);
				if (request.stepDescriptions.technical_spec.trim() === '' && !request.skippedSteps.some((s) => s.step === 'technical_spec'))
					then.push(TECHNICAL_WITH_DIAGRAM);
			}
			// Validating is optional until the build; the freeze waits for the Solution's validation only.
			const tabWritten = (['solution', 'functional_spec', 'technical_spec'] as const).every(
				(s) => request.skippedSteps.some((k) => k.step === s) || request.stepDescriptions[s].trim() !== ''
			);
			if (unanswered.every((q) => !q.required) && owedInTab.length === 0 && tabWritten)
				then.push(
					'Hand the person the link to the Solution (its texts and its two diagrams): validating it is optional now, and it is the one validation the build waits for. The Specification may be drafted at once: add_draft_leaf, add_data_draft, add_section_draft and add_rule_draft.'
				);
			const SAY: Record<string, string> = {
				solution: 'Say what changes in the product, and how we will know it works.',
				functional_spec: 'Say how it goes for the person using it, and what the product refuses.',
				technical_spec: 'Say what the change asks of the technique: the constraints and risks you know of, and the data it moves.'
			};
			say =
				current.progress === 'done'
						? current.detail
						: SAY[step];
			break;
		}
		case 'impact_analysis':
			// What the change touches is named and answered here, then read against the product (ac-evo-form-impact-step).
			if (request.leafIds.length === 0) {
				then.push(
					'Review only added, changed or removed actions and rules; unchanged inherited actions stay context. Preserve stable IDs and all human rejections until explicit Restore; never recreate or validate rejected actions. From the Solution, name the features the change touches: get_knowledge_graph {kinds:["feature"], q:"<their words>"}, then add_draft_leaf (add | amend | remove) for each, add_data_draft for each table the Technical spec names (field by field), add_section_draft for what it changes on another page of the spec and add_rule_draft for a rule the whole product keeps. Optional: the behaviour model of a new feature (apply_behavior_batch on its draft id, lyriks-behavior), said to the person as your reading of their text.'
				);
				say = 'Name what the change touches, from the Solution.';
			} else if (facts.questionsOwed > 0) {
				then.push(`propose a value on each of the ${facts.questionsOwed} empty questions of the features touched, citing the Solution.`);
				say = `${facts.questionsOwed} ${facts.questionsOwed === 1 ? 'question' : 'questions'} on the features touched to answer.`;
			} else if (request.impactReport.status !== 'ready' || request.coherenceReport.status !== 'ready') {
				then.push('run_impact (one hypothesis per kind of draft) and run_coherence, in one batch; then read the two plain lines of the impact to the person.');
				say = 'Measure the change against the product as it stands.';
			} else if (facts.collisions > 0) {
				say = `${facts.collisions} point${facts.collisions === 1 ? '' : 's'} of the change collide${facts.collisions === 1 ? 's' : ''} with the product.`;
				decides.push('For each collision: fix it in the section that owns it, accept it as a risk with a reason (decide_finding), or cross with a waiver.');
			} else {
				say = facts.frictions > 0 ? `The change fits, with ${facts.frictions} point${facts.frictions === 1 ? ' that rubs' : 's that rub'}.` : 'The change fits the product.';
			}
			// What an AI wrote of the Specification is read and validated by a person before the Simulation and any freeze (ac-evo-form-step-lock).
			if (request.leafIds.length > 0 && facts.questionsOwed === 0 && specificationLeft > 0) {
				say = `${say} The Specification waits for a person's validation.`;
				decides.push(
					`Validate the Specification: each answer of the features touched, the values an AI typed on a draft included, each action, each path of the journey and each change to the data (validate_field on each, as the page's Specification offers it): ${specificationLeft} of ${facts.specification?.total} left, waiting on ${facts.solo ? 'you' : 'anyone with access to the project'}. The version is frozen once a person validated them.`
				);
			}
			break;
		case 'build':
			then.push(
				`Write the code against spec version ${request.specVersion} (lyriks-delivery), sync_implementation_index as usual (the entries naming what this request adds are held on it until the change is declared live), then build_implementation_report.`
			);
			if (facts.undecidedLines > 0) decides.push(`Decide the ${facts.undecidedLines} report line${facts.undecidedLines === 1 ? '' : 's'} this change brought (decide_line).`);
			say = `Version ${request.specVersion} is frozen on the request: build it. Nothing of it is official until it is declared live.`;
			break;
		case 'approval':
			ask.push('Walk the change: what did you see that is wrong, could be better, or reveals a new need?');
			then.push('log_observation for each remark, as the person said it (as_person, once they said it).');
			decides.push('Rule each remark (rule_observation), write the validated ones back (fold_back).');
			say = 'The build is accepted: the people concerned walk it and approve it. Nothing is official yet; it becomes so once declared live.';
			break;
		case 'deployment':
			if (request.status === 'open') decides.push('Declare the change live once it is (declare_deployment, with the release when known): that is when it becomes official, written into the specification.');
			// Live: what the index held for the change resolves now.
			if (request.status !== 'open' && Object.keys(request.heldImplementation ?? {}).length > 0)
				then.push('The change is official now: sync_implementation_index again, so the index resolves the entries held until it went live.');
			say = request.status === 'open' ? 'Approved. Declaring it live makes it official and closes it.' : current.detail;
			break;
	}

	// The description first, then what it leaves unsaid (ac-evo-form-step-description, ac-evo-llm-step-description).
	if (isDescribedStep(step) && request.stage !== 'implementation' && request.stage !== 'acceptance' && request.stage !== 'delivered') {
		if (request.stepDescriptions[step].trim() === '' && !skippedQuestionOf(request, `step.${step}.description`)) {
			ask.unshift(stepDescriptionQuestion[step]);
			then.unshift(`update_step_description {step: "${step}", description}: the person's own words, verbatim.`);
		} else then.push(READ_THE_DESCRIPTION);
	} else if (step === 'need' && request.need.description.trim() !== '') then.push(READ_THE_DESCRIPTION);
	// What was asked of this request in particular comes before the generic questions (ac-evo-coach-custom-5).
	const custom = openCustomQuestions(request, step);
	if (custom.length > 0) {
		ask.unshift(...custom.map((q) => `${q.question} (${q.why})`));
		then.unshift(
			'resolve_question {questionId, resolution: "answered", text}: their answer verbatim; then turn it into a proposal on the field it bears on. A question that does not apply: resolution "set_aside" with the reason.'
		);
	}

	if (facts.pendingProposals > 0)
		decides.unshift(`Sign the ${facts.pendingProposals} value${facts.pendingProposals === 1 ? '' : 's'} waiting (decide_proposal accept | reword | refuse).`);
	decides.push(...validationAsk(current, facts.solo, facts.inputs, request.validationsPerAnswer));
	// Every spec step validated and the gate met: the next move is the crossing.
	const crossing = step === 'impact_analysis' || step === 'build' || step === 'approval';
	const specificationWaits = step === 'impact_analysis' && specificationLeft > 0;
	if (crossing && facts.gate.ok && current.validation?.validated !== false && !specificationWaits)
		decides.push(
			step === 'impact_analysis'
				? `Freeze version ${request.specVersion + 1} on the request (cross_stage); nothing becomes official before it is declared live.`
				: step === 'build'
					? 'Accept the Build (cross_stage): the code matches the frozen version. Nothing becomes official before the change is declared live.'
					: 'Move on (cross_stage).'
		);
	else if (crossing && !facts.gate.ok && facts.gate.reason) say = `${say} The next gate says: ${facts.gate.reason}`;
	// Validating is optional until the build: the Solution is the one validation the freeze waits for, named before it refuses.
	if (step === 'impact_analysis' && !isStepValidated(request, 'solution'))
		decides.push(
			`Validate the Solution (validate_step {step: "solution"}): the one validation the build waits for, by ${facts.solo ? 'you' : 'anyone with access to the project'}. The Need, the Functional and the Technical spec may stay unvalidated.`
		);

	// The diagram behind its texts is caught up first, whatever step the request stands on, while the texts
	// still edit: an act is always due while one says something the other does not (ac-evo-func-uml-sync, -ai).
	if (diagramBehindTexts(request, 'technical_spec') && !request.frozen && request.status === 'open')
		then.unshift(
			`${(request.stepAnswers.technical_spec[FUNCTIONAL_DIAGRAM_KEY] ?? '').trim() === '' ? 'Draw' : 'Redraw'} the Technical spec's diagram from its description first: redraw_diagram {step: "technical_spec", diagram} in the notation of the tool (component / store / system / actor <name>, ": new" after what the change adds; link <a> -> <b>: <what goes through>; note <element>: <constraint or risk>; sequence <name> with "<a> -> <b>: <message>" lines, "-->" for an answer, and their "goes wrong when <condition>: <what then happens>" lines). A component that is a feature the product already has ends with @[name](feature:<featureId>), a store that is a table of the Data model with @[name](entity:<tableId>). It rewrites no text. Then say to the person it is your drawing of their description, to correct on the page.`
		);
	if (diagramBehindTexts(request) && !request.frozen && request.status === 'open')
		then.unshift(
			`${(request.stepAnswers.functional_spec[FUNCTIONAL_DIAGRAM_KEY] ?? '').trim() === '' ? 'Draw' : 'Redraw'} the Functional spec's diagram from its texts first: redraw_diagram {diagram} in the notation of the tool (actor / system, use case <name>: <who>, flow <use case> with "<who>: <step>" lines and their "refused when" / "goes wrong when" ways out, states <thing> with "<from> -> <to>: <cause>"). A use case that is a feature the product already has ends with @[name](feature:<featureId>), a step that is an action it already has with @[name](action:<featureId>/<actionId>). It rewrites no text. Then say to the person it is your drawing of their texts, to correct on the page. Editing the diagram later (answer_step question diagram) leaves the texts it changes behind it, to rewrite from it.`
		);
	// A text the diagram moved past is rewritten before anything else, the diagram's redraw included:
	// it is no longer shown until it is, and a redraw from it would undo the diagram's edit (ac-evo-func-uml-sync, -ai).
	for (const paired of ['technical_spec', 'functional_spec'] as const) {
		const behind = textsBehindDiagram(request, paired);
		if (behind.length === 0 || request.frozen || request.status !== 'open') continue;
		const spec = paired === 'functional_spec' ? 'Functional' : 'Technical';
		then.unshift(
			`The ${spec} spec's diagram changed what ${behind.length === 1 ? 'one of its texts says' : 'its texts say'} (${behind.join(', ')}): rewrite ${behind.length === 1 ? 'it' : 'each'} from the diagram first, write_text_from_diagram {step: "${paired}", question: "${behind[0]}"${behind.length > 1 ? ` (then ${behind.slice(1).map((k) => `"${k}"`).join(', ')})` : ''}, answer}, in prose and in the spec's language, keeping the person's words wherever the diagram still says them; ${paired === 'functional_spec' ? 'refusals and failures are one statement per line' : 'the description says the parts, how they talk, what can go wrong, then the constraints and risks'}. The text is not shown on the page until you do. Then say to the person it is your reading of their diagram, to correct.`
		);
	}
	return { step, say, ask, then, personDecides: decides };
}

/**
 * Whether a question still owes its answer (criterion 189c4d88): left empty,
 * required or not, or parked as an open question, with no suggestion waiting on
 * it and not skipped on purpose. Skipping is how a question one will not answer
 * stops holding its section open (ac-evo-form-question-skip).
 */
export function owesAnswer(field: {
	readonly filled: boolean;
	readonly openQuestion?: boolean;
	readonly pendingProposalId?: string | null;
	readonly skipped?: unknown;
}): boolean {
	return (!field.filled || !!field.openQuestion) && !field.pendingProposalId && !field.skipped;
}
