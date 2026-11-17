import { leafOf, postOnFieldAct, type ActContext, type ActOutcome } from './acts';
import type { EvolutionRequest } from './draft';
import { refuse } from './guard';
import { publishExchange } from './live-exchange';
import { answerSuggestion } from './suggestion-ask';
import { startStepPrefill, stopStepPrefill, stopStepPrefillOnClick, type StepPrefillSection } from './step-prefill';
import {
	answerClick,
	BUILD_FIELD,
	clickAllowed,
	closeField,
	endSession,
	isDrawableStep,
	sendClick,
	startSession,
	withdrawClick,
	type AiAnswer,
	type AiClickKind,
	type CloseStep,
	type DrawableStep
} from './live-session';

/**
 * The acts of a live session as the Evolution operations carry them
 * (feat-evo-live-session), each guarded by who may make it: the AI opens a
 * session from the prompt, the person clicks, either one ends it. A session is
 * traffic, not a decision, so none of these writes the request's history.
 */

/** The AI client opens a session for its person (ac-evo-live-start). */
export function startSessionAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	if (ctx.actor.kind !== 'ai_client')
		return refuse('A session is opened by your AI: by itself in a repository bound to the project, or from the prompt the floating chip copies.', 'The session is the AI waiting on your pages for you; a person has nothing to open.');
	const outcome = startSession(request, ctx.actor.id, ctx.newId(), ctx.at);
	if (!outcome.ok) return outcome;
	const replaced = outcome.replaced ? `; session ${outcome.replaced.id} it replaces answers that it was replaced` : '';
	return { ok: true, request: outcome.request, summary: `Session ${outcome.session.id} opened for ${ctx.actor.id}${replaced}` };
}

/** The person ends the session from the page, or their AI on their word in the chat (ac-evo-live-end). */
export function endSessionAct(ctx: ActContext, request: EvolutionRequest, sessionId: string | null): ActOutcome {
	const outcome = endSession(request, ctx.actor.id, 'ended_by_person', ctx.at, sessionId ?? undefined);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Session ${outcome.session.id} ended` };
}

export interface ClickRequest {
	readonly kind: AiClickKind;
	readonly fieldPath: string;
	readonly leafId: string | null;
	/** Prefill: every question of the section clicked on (ac-evo-live-prefill). */
	readonly section?: readonly string[];
	/** Ask: the message posted in the thread, addressed to the AI. */
	readonly body?: string;
	readonly replyTo?: string | null;
	/** Draw: the step whose diagram to draw. */
	readonly step?: string;
}

/**
 * The person sends a click to their own AI (ac-evo-live-prefill, -ask, -draw).
 * An ask posts its message in the field's thread first, as the person's own,
 * and the click carries that message so the AI answers it in reply.
 */
export function sendClickAct(ctx: ActContext, request: EvolutionRequest, input: ClickRequest): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only a person clicks to ask their AI.', 'An AI client answers the clicks; it never sends one.');
	const canEdit = ctx.actor.role !== 'viewer';
	const step: DrawableStep | undefined = isDrawableStep(input.step) ? input.step : undefined;
	let current = request;
	let messageId: string | undefined;
	if (input.kind === 'ask') {
		// Refused before the message is posted: a thread never holds an ask nobody can take.
		const allowed = clickAllowed('ask', canEdit);
		if (!allowed.ok) return allowed;
		// A new topic stays between the person and their AI until it is published (ac-evo-live-ask); a reply keeps
		// the visibility of the message it answers, so an answer to a question everyone reads is read by everyone (ac-evo-live-one-box).
		const posted = postOnFieldAct(ctx, request, input.fieldPath, input.leafId, input.body ?? '', input.replyTo ?? null, input.replyTo ? {} : { privateTo: ctx.actor.id });
		if (!posted.ok) return posted;
		current = posted.request;
		messageId = newestMessageOf(current, ctx.actor.id);
	}
	const outcome = sendClick(current, ctx.actor.id, { kind: input.kind, fieldPath: input.fieldPath, leafId: input.leafId, section: input.section, step, messageId }, canEdit, ctx.newId(), ctx.at);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Click ${outcome.click.id} (${outcome.click.kind}) waits for ${ctx.actor.id}'s AI` };
}

/**
 * The person hands the build of the frozen version to their AI ("Send to my
 * AI" at Build): the brief goes with the click, so nothing is pasted. Only at
 * Build, where a version is frozen to build against.
 */
export function sendBuildClickAct(ctx: ActContext, request: EvolutionRequest, brief: string): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only a person hands the build to their AI.', 'An AI client answers the clicks; it never sends one.');
	if (request.stage !== 'implementation') return refuse('The build is handed to the AI at Build.', 'The AI builds a frozen version; before Build there is none, after it the code is already judged.');
	const outcome = sendClick(request, ctx.actor.id, { kind: 'build', fieldPath: BUILD_FIELD, leafId: null, build: { brief } }, ctx.actor.role !== 'viewer', ctx.newId(), ctx.at);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Click ${outcome.click.id} (build of version ${request.specVersion}) waits for ${ctx.actor.id}'s AI` };
}

/**
 * The person hands a step of the close to their AI (ac-evo-verd-steps-to-ai):
 * the merge of the request's branch and its report once the change is
 * approved, then syncing the index again and deleting the merged branch once
 * it is live. The brief goes with the click; Lyriks itself never touches the
 * repository (ac-evo-branch-no-repo).
 */
export function sendCloseClickAct(ctx: ActContext, request: EvolutionRequest, step: CloseStep, brief: string): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only a person hands the close to their AI.', 'An AI client answers the clicks; it never sends one.');
	if (step === 'merge') {
		if (request.status !== 'open' || request.stage !== 'delivered') return refuse('The merge is handed to the AI once the change is approved.', 'Approve the change first; once it is live, nothing is left to merge.');
		if (!request.code?.validated?.commit) return refuse('The merge waits for a validated commit.', 'Validate the verification first: the merge must hold the commit it validated.');
	} else if (request.status !== 'closed') return refuse('Syncing the index again and deleting the branch come once the change is live.', 'Merge the branch and report the merge first.');
	const outcome = sendClick(request, ctx.actor.id, { kind: 'close', fieldPath: closeField(step), leafId: null, close: { step, brief } }, ctx.actor.role !== 'viewer', ctx.newId(), ctx.at);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Click ${outcome.click.id} (${step} of the close) waits for ${ctx.actor.id}'s AI` };
}

/**
 * The person answers the question of a suggestion, with one click or their own
 * words ("Answer the question in the suggestion"): the answer is kept on the
 * suggestion and goes to their AI as a prefill of that field, which the AI
 * answers by rewriting the suggestion in place (ac-evo-live-card-ask).
 */
export function answerSuggestionAct(ctx: ActContext, request: EvolutionRequest, proposalId: string, body: string, section: readonly string[] = []): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only the person answers the question of a suggestion.', 'An AI client asks with its suggestion; the person answers.');
	const canEdit = ctx.actor.role !== 'viewer';
	// Refused before anything is kept: an answer nobody's AI can take is never recorded.
	const allowed = clickAllowed('prefill', canEdit);
	if (!allowed.ok) return allowed;
	const answered = answerSuggestion(request, ctx.actor.id, proposalId, body, ctx.at);
	if (!answered.ok) return answered;
	// The answer goes with the rest of the suggestion's section, which the AI fills too (ac-evo-live-card-ask).
	const target = { kind: 'prefill' as const, fieldPath: answered.proposal.targetField, leafId: leafOf(answered.proposal), section, proposalId };
	const outcome = sendClick(answered.request, ctx.actor.id, target, canEdit, ctx.newId(), ctx.at);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Answer to suggestion ${proposalId} waits for ${ctx.actor.id}'s AI (click ${outcome.click.id})` };
}

/** The id of the last message the person posted, which the ask just wrote. */
function newestMessageOf(request: EvolutionRequest, author: string): string | undefined {
	let newest: { id: string; postedAt: string } | undefined;
	for (const thread of request.fieldThreads)
		for (const message of thread.messages)
			if (message.author === author && (!newest || message.postedAt >= newest.postedAt)) newest = message;
	return newest?.id;
}

/** The person makes an exchange with their AI a comment everyone who reads the thread sees ("Make it a comment"). */
export function publishExchangeAct(ctx: ActContext, request: EvolutionRequest, messageId: string): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only the person the exchange belongs to makes it a comment.', 'An AI client never publishes an exchange on its own.');
	const outcome = publishExchange(request, ctx.actor.id, messageId);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Exchange ${messageId} made a comment (${outcome.published} messages)` };
}

/** The person takes back a click no AI has taken yet; the click of a step prefill takes the run with it. */
export function withdrawClickAct(ctx: ActContext, request: EvolutionRequest, clickId: string): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only the person who sent a click withdraws it.', 'Withdraw only shows on a waiting click of your own.');
	const outcome = withdrawClick(request, ctx.actor.id, clickId);
	if (!outcome.ok) return outcome;
	return { ok: true, request: stopStepPrefillOnClick(outcome.request, clickId, ctx.at), summary: `Click ${clickId} withdrawn` };
}

/**
 * The person prefills a whole step with their AI (ac-evo-live-prefill-step):
 * the first section's Prefill click waits for the AI, the next ones follow as
 * each section is settled.
 */
export function startStepPrefillAct(ctx: ActContext, request: EvolutionRequest, step: string, sections: readonly StepPrefillSection[]): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only a person prefills a step with their AI.', 'An AI client answers the clicks; it never sends one.');
	const outcome = startStepPrefill(request, ctx.actor.id, { step, sections }, ctx.actor.role !== 'viewer', ctx.newId, ctx.at);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Step prefill ${outcome.run.id} of ${step} (${outcome.run.sections.length} sections) waits for ${ctx.actor.id}'s AI` };
}

/** The person stops their running step prefill ("Stop the step prefill"). */
export function stopStepPrefillAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	if (ctx.actor.kind !== 'person') return refuse('Only the person who started a step prefill stops it.', 'The cross shows beside the icon of a running step prefill.');
	const outcome = stopStepPrefill(request, ctx.actor.id, ctx.at);
	if (!outcome.ok) return outcome;
	return { ok: true, request: outcome.request, summary: `Step prefill ${outcome.run.id} stopped` };
}

/**
 * What an operation of the AI answers ("Record the AI's answer"): a reply in a
 * thread, a proposal on a field (or, on a question of a step of prose, the
 * answer the person then validates or refuses), a redraw of a step's diagram.
 */
export function answerOf(name: string, op: Readonly<Record<string, unknown>>): AiAnswer | null {
	const text = (v: unknown) => (typeof v === 'string' ? v : '');
	if (name === 'post_on_field' && text(op.replyTo)) return { kind: 'reply', messageId: text(op.replyTo) };
	if (name === 'propose' && text(op.fieldPath)) return { kind: 'propose', fieldPath: text(op.fieldPath), leafId: text(op.leafId) || null };
	// A question of a step of prose is signed as a version the person validates, not as a proposal.
	if (name === 'answer_step' && text(op.step) && text(op.question)) return { kind: 'propose', fieldPath: `step.${text(op.step)}.${text(op.question)}`, leafId: null };
	// A step's description, prefilled first, answers its section's click like its questions do.
	if (name === 'update_step_description' && text(op.step)) return { kind: 'propose', fieldPath: `step.${text(op.step)}.description`, leafId: null };
	if (name === 'redraw_diagram') return { kind: 'redraw', step: isDrawableStep(op.step) ? op.step : 'functional_spec' };
	// A text rewritten from the diagram catches the step up as a redraw does (ac-evo-live-draw).
	if (name === 'write_text_from_diagram') return { kind: 'redraw', step: isDrawableStep(op.step) ? op.step : 'functional_spec' };
	// The report rebuilt on what the AI built and synced answers the build the person handed it.
	if (name === 'build_implementation_report') return { kind: 'report' };
	return null;
}

/** The request with the click an act of the AI answers marked answered; unchanged when it answers none. */
export function recordAnswerAct(ctx: ActContext, request: EvolutionRequest, answer: AiAnswer): EvolutionRequest | null {
	if (ctx.actor.kind !== 'ai_client') return null;
	const outcome = answerClick(request, ctx.actor.id, answer, ctx.at);
	return outcome.click ? outcome.request : null;
}
