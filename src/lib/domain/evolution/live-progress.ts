import type { EvolutionRequest, Proposal } from './draft';
import { REQUEST_STAGES, type RequestStage } from './enums';
import { isStepValidated, stepLabel, validationOf, VALIDATED_STEPS, type ValidatedStep } from './path';
import { pendingProposals } from './proposals';
import { openSessionOf, takeNextClick, type AiClick, type LiveSession } from './live-session';

/**
 * What the person does on the page that moves the request on reaches their AI
 * in session like a click does (ac-evo-live-progress-wakes): a step that stands
 * validated, a crossing into another stage, the last suggestion that waited on
 * them decided. The session keeps what its AI last heard of the request; a look
 * that finds the person moved it on since answers the waiting call with that
 * progress, once. The AI's own writes never wake it.
 */

/** What the AI last heard of the request: the stage, the steps standing validated, the suggestions already decided. */
export interface HeardProgress {
	readonly at: string;
	readonly stage: RequestStage;
	readonly steps: readonly ValidatedStep[];
	readonly decided: readonly string[];
}

/** What the person did since their AI last heard, in the words the AI repeats. */
export interface PersonProgress {
	readonly happened: readonly string[];
	readonly stepsValidated: readonly ValidatedStep[];
	/** The stage the person crossed into, null when they crossed none. */
	readonly crossedInto: RequestStage | null;
	/** Every suggestion that waited on the person is decided now. */
	readonly lastDecided: boolean;
}

const decidedIds = (request: EvolutionRequest): string[] =>
	request.proposals.filter((p) => p.decision === 'accepted' || p.decision === 'refused').map((p) => p.id);

/** What the request holds now, as the AI hears it. */
export function heardOf(request: EvolutionRequest, at: string): HeardProgress {
	return { at, stage: request.stage, steps: VALIDATED_STEPS.filter((step) => isStepValidated(request, step)), decided: decidedIds(request) };
}

const sameHeard = (a: HeardProgress, b: HeardProgress): boolean =>
	a.stage === b.stage && a.steps.join() === b.steps.join() && a.decided.join() === b.decided.join();

/** Only a person refuses; an acceptance is the person's when its history entry says so (the AI accepts under delegation). */
function decidedByPerson(request: EvolutionRequest, proposal: Proposal): boolean {
	if (proposal.decision === 'refused') return true;
	return (
		proposal.decision === 'accepted' &&
		request.history.some((h) => h.type === 'accepted_proposal' && h.proposalId === proposal.id && h.authorKind === 'person')
	);
}

const stageLabel = (stage: RequestStage): string => REQUEST_STAGES.find((s) => s.code === stage)?.label ?? stage;

/** What the person moved on since `heard`, or null when nothing did ("Note the person's progress"). */
export function progressSince(request: EvolutionRequest, heard: HeardProgress): PersonProgress | null {
	const stepsValidated = VALIDATED_STEPS.filter(
		(step) =>
			!heard.steps.includes(step) &&
			isStepValidated(request, step) &&
			validationOf(request, step).validations.some((v) => v.kind === 'person' && v.at > heard.at)
	);
	const crossedInto =
		request.stage !== heard.stage &&
		request.history.some((h) => h.type === 'stage_crossing' && h.authorKind === 'person' && h.recordedAt > heard.at)
			? request.stage
			: null;
	const lastDecided =
		pendingProposals(request).length === 0 && request.proposals.some((p) => !heard.decided.includes(p.id) && decidedByPerson(request, p));
	const happened = [
		...stepsValidated.map((step) => `${stepLabel(step)} validated`),
		...(crossedInto ? [`The request crossed into ${stageLabel(crossedInto)}`] : []),
		...(lastDecided ? ['Every suggestion that waited on the person is decided'] : [])
	];
	return happened.length > 0 ? { happened, stepsValidated, crossedInto, lastDecided } : null;
}

/**
 * One look of the waiting call at the person's progress ("Hand the person's
 * progress to the AI"): the progress the AI has not heard of, which it hears
 * now, once. When the AI just called again (`aiCalledAgain`) and nothing of the
 * person's moved, what it wrote itself is what it last heard, so its own writes
 * never wake it. A session that heard nothing yet starts from the request as it is.
 */
export function hearProgress(
	request: EvolutionRequest,
	personId: string,
	at: string,
	aiCalledAgain: boolean
): { readonly request: EvolutionRequest; readonly progress: PersonProgress | null } {
	const session = openSessionOf(request, personId);
	if (!session) return { request, progress: null };
	const now = heardOf(request, at);
	const progress = session.heard ? progressSince(request, session.heard) : null;
	const unchanged = session.heard && !progress && (!aiCalledAgain || sameHeard(session.heard, now));
	if (unchanged) return { request, progress: null };
	const heard: LiveSession = { ...session, heard: now };
	return {
		request: { ...request, liveSessions: (request.liveSessions ?? []).map((s) => (s.id === session.id ? heard : s)) },
		progress
	};
}

/**
 * What the waiting call answers with: the oldest click first ("Hand the next
 * click to the AI"), else the person's progress the AI has not heard of
 * ("Hand the person's progress to the AI"), else it keeps waiting.
 */
export function handToWaitingCall(
	request: EvolutionRequest,
	personId: string,
	at: string,
	aiCalledAgain: boolean
):
	| { readonly kind: 'click'; readonly request: EvolutionRequest; readonly click: AiClick }
	| { readonly kind: 'progress'; readonly request: EvolutionRequest; readonly progress: PersonProgress }
	| { readonly kind: 'wait'; readonly request: EvolutionRequest } {
	const taken = takeNextClick(request, personId, at);
	if (taken) return { kind: 'click', request: taken.request, click: taken.click };
	const heard = hearProgress(request, personId, at, aiCalledAgain);
	return heard.progress ? { kind: 'progress', request: heard.request, progress: heard.progress } : { kind: 'wait', request: heard.request };
}
