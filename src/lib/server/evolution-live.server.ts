import { aiWorkedAt } from './ai-work.server';
import type { AppServices } from '$composition/container.server';
import {
	advanceStepPrefill,
	readsSpecificationActions,
	blockFieldByPath,
	isOriginField,
	ORIGIN_ANSWER_KEYS,
	REQUEST_ORIGINS,
	closeTurn,
	endSession,
	fieldKey,
	requestSeenBy,
	topicOf,
	waitingQuestionOf,
	type FieldThreadMessage,
	isIdle,
	lastSessionOf,
	latestThread,
	LIVE_SESSION,
	openSessionOf,
	pageKnowledge,
	requestPagePath,
	secondsBetween,
	sectionOf,
	stepDescriptionQuestionOf,
	isPairedStep,
	pairedTextFields,
	textsBehindDiagram,
	FUNCTIONAL_DIAGRAM_KEY,
	stepQuestionOf,
	suggestionPlaceOf,
	suggestionPlaces,
	handToWaitingCall,
	stepLabel,
	ticketPostInstruction,
	type Coaching,
	type PersonProgress,
	type StepPrefill,
	type AiClick,
	type EvolutionRequest,
	type PageKnowledge,
	type SessionEndReason,
	NO_ACTIONS_COUNTED
} from '$domain/evolution';
import type { LivePresenceStatus } from '$lib/shared/live-session';
import { publishLiveSignal, subscribeLiveSignals, subscribeSectionChanges, type ProjectLiveSignal } from './sync-bus.server';
import { coachFor, dossierFieldRows, loadEvolutionView, needFieldRows, originAnswersOf, type EvolutionView } from './evolution-view.server';
import { codeReadingOf, type CodeReading } from '$domain/evolution';
import { requestKeyOf } from '$domain/evolution';
import { specificationActionTrails } from './evolution-spec-actions.server';

/**
 * The server side of a live session (feat-evo-live-session): the call the AI
 * holds open until the person's next click, and what the person's page is told
 * the AI is doing. The session and the clicks are on the request, written
 * under the section's revision like any act; what happens now travels on the
 * bus, so the node holding the call and the nodes serving the page agree.
 */

/**
 * A request holds one session of a person at a time; the project holds one per
 * AI of that person (EVO-015), so its signals are told apart by their session.
 */
const keyOf = (projectId: string, requestId: string, personId: string, sessionId: string) =>
	`${projectId}|${requestId}|${personId.trim().toLowerCase()}${requestId === PROJECT_SESSION_KEY ? `|${sessionId}` : ''}`;

/** What every node knows of each live session, fed by the bus; never saved (criterion ea1709d0). */
const presence = new Map<string, ProjectLiveSignal>();
let watching = false;

export function ensureWatching(services: AppServices): void {
	if (watching) return;
	watching = true;
	subscribeLiveSignals((signal) => presence.set(keyOf(signal.projectId, signal.requestId, signal.personId, signal.sessionId), signal));
	// The server's clock of the session ("Time passes in the session"): an AI
	// between two calls that stays silent too long is gone ("Mark a silent AI gone").
	const timer = setInterval(() => void markSilentGone(services), LIVE_SESSION.progressIntervalSeconds * 1000);
	(timer as { unref?: () => void }).unref?.();
}

/**
 * The person's live session on a request, or one of their sessions on the
 * project, as this node knows it; null when none was heard of. On the project
 * without a session named: the latest one heard.
 */
export function presenceOf(projectId: string, requestId: string, personId: string, sessionId?: string): ProjectLiveSignal | null {
	if (requestId !== PROJECT_SESSION_KEY) return presence.get(keyOf(projectId, requestId, personId, '')) ?? null;
	if (sessionId) return presence.get(keyOf(projectId, requestId, personId, sessionId)) ?? null;
	return projectPresencesOf(projectId, personId).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;
}

/** What each of the person's AIs on the project does now, as this node heard it (EVO-015). */
export function projectPresencesOf(projectId: string, personId: string): ProjectLiveSignal[] {
	const person = personId.trim().toLowerCase();
	return [...presence.values()].filter((s) => s.projectId === projectId && s.requestId === PROJECT_SESSION_KEY && s.personId.trim().toLowerCase() === person);
}

export function say(
	services: AppServices,
	base: { projectId: string; requestId: string; personId: string; sessionId: string },
	status: LivePresenceStatus,
	extra: { thinkingAbout?: string | null; saying?: string | null; step?: number | null; endReason?: SessionEndReason | null; callHeld?: boolean } = {}
): void {
	ensureWatching(services);
	const before = presenceOf(base.projectId, base.requestId, base.personId, base.sessionId);
	const same = before?.sessionId === base.sessionId;
	const live = status !== 'gone' && status !== 'ended';
	publishLiveSignal({
		...base,
		status,
		// What the AI said last while the session lasts, never past it.
		thinkingAbout: extra.thinkingAbout !== undefined ? extra.thinkingAbout : same && status === 'thinking' ? (before?.thinkingAbout ?? null) : null,
		saying: !live ? null : extra.saying !== undefined ? extra.saying : same ? (before?.saying ?? null) : null,
		step: !live ? null : extra.step !== undefined ? extra.step : same ? (before?.step ?? null) : null,
		endReason: extra.endReason ?? null,
		...(extra.callHeld ? { callHeld: true } : {}),
		at: services.clock.nowIso()
	});
}

/** Tell the person's page the session opened and listens (ac-evo-live-start). */
export function sayOpened(services: AppServices, base: { projectId: string; requestId: string; personId: string; sessionId: string }): void {
	say(services, base, 'listening', { thinkingAbout: null, saying: null });
}

/** Tell the person's page the session ended, and why (ac-evo-live-end). */
export function sayEnded(services: AppServices, base: { projectId: string; requestId: string; personId: string; sessionId: string }, reason: SessionEndReason): void {
	say(services, base, reason === 'gone' ? 'gone' : 'ended', { endReason: reason });
}

/** The AI's next step in one sentence, numbered from the click it took, replacing the one before (ac-evo-live-state). */
export function sayDoing(services: AppServices, base: { projectId: string; requestId: string; personId: string; sessionId: string }, text: string): void {
	const now = presenceOf(base.projectId, base.requestId, base.personId, base.sessionId);
	const same = now?.sessionId === base.sessionId;
	say(services, base, same && now.status !== 'listening' ? now.status : 'writing', { saying: text, step: (same ? (now.step ?? 0) : 0) + 1 });
}

/** The person cancelled the request their AI was on: the header says so until the AI calls again (ac-evo-live-cancel). */
export function sayCancelled(services: AppServices, base: { projectId: string; requestId: string; personId: string; sessionId: string }): void {
	say(services, base, 'cancelled', { thinkingAbout: null, saying: null, step: null });
}

/**
 * Any call the AI makes on the request counts: it is not silent, and a write
 * reads writing in the header (ac-evo-live-state). Called wherever the MCP's
 * reads and writes reach the platform.
 */
export function noteAiCall(services: AppServices, projectId: string, requestId: string, personId: string, act: 'read' | 'write'): void {
	const now = presenceOf(projectId, requestId, personId);
	// A cancelled request reads cancelled until the AI calls again, whatever it still sends.
	if (!now || now.status === 'gone' || now.status === 'ended' || now.status === 'listening' || now.status === 'cancelled') return;
	say(services, { projectId, requestId, personId, sessionId: now.sessionId }, act === 'write' ? 'writing' : now.status);
}

type Change<T> = { readonly request: EvolutionRequest | null; readonly result: T };

/**
 * Read the request, change it, save it under the revision read. A concurrent
 * write refuses the save; the change is then made again on what it wrote.
 */
async function changeRequest<T>(services: AppServices, projectId: string, requestId: string, change: (request: EvolutionRequest) => Change<T>): Promise<T | null> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const [draft, revision] = await Promise.all([
			services.loadEvolutionDraft.execute(projectId),
			services.sectionDocuments.currentRevision(projectId, 'evolution')
		]);
		const request = draft.requests.find((r) => r.id === requestId);
		if (!request) return null;
		const { request: changed, result } = change(request);
		if (!changed) return result;
		const saved = await services.saveEvolutionDraft.execute(
			{ ...draft, requests: draft.requests.map((r) => (r.id === requestId ? changed : r)) },
			{ expectedRevision: revision, origin: null }
		);
		if (saved) return result;
	}
	return null;
}

/** What the AI receives with a click: the place, the question, the value it holds now, the thread (ac-evo-live-prefill, -ask, -draw). */
export interface ClickContext {
	readonly id: string;
	readonly kind: AiClick['kind'];
	readonly fieldPath: string;
	readonly leafId: string | null;
	readonly step: string | null;
	readonly question: string;
	readonly value: string;
	readonly href: string;
	readonly message: { readonly id: string; readonly body: string; readonly replyTo: string | null } | null;
	readonly thread: readonly {
		readonly id: string;
		readonly author: string;
		readonly authorKind: string;
		readonly body: string;
		readonly replyTo: string | null;
		readonly private: boolean;
		readonly awaitsAnswer: boolean;
		/** The texts the message offered and where the person's decision stands (ac-evo-live-comment-suggests). */
		readonly suggestion?: { readonly places: readonly string[]; readonly state: 'waiting' | 'accepted' | 'refused' };
	}[];
	/**
	 * Where the message stands among the questions of the thread (ac-evo-live-scope):
	 * the AI's question still waiting there, and what to say when the message
	 * opens a new topic instead of answering it.
	 */
	readonly scope: { readonly waitingQuestion: { readonly id: string; readonly excerpt: string } | null; readonly note: string | null } | null;
	/** What the request page already holds: never ask the person any of it (ac-evo-live-known). */
	readonly known: PageKnowledge;
	/**
	 * Every question a prefill covers, the one it bears on first (ac-evo-live-prefill):
	 * a section's click hands them all, each with its value and whether a
	 * suggestion of yours already waits on it. Empty for an ask or a draw.
	 */
	readonly section: readonly { readonly fieldPath: string; readonly question: string; readonly value: string; readonly suggestionWaits: boolean }[];
	/** The person's answer to the question of your suggestion, when that is what the click carries (ac-evo-live-card-ask). */
	readonly answer: {
		readonly proposalId: string;
		readonly suggested: string;
		readonly question: string;
		readonly body: string;
		readonly earlier: readonly { readonly question: string; readonly answer: string }[];
	} | null;
	/**
	 * The prefill of a whole step that sent this click (ac-evo-live-prefill-step):
	 * the section it is on, counted from 1, of the ones the run covers. Fill that
	 * section only; the next one comes once it is settled.
	 */
	readonly stepPrefill: { readonly step: string; readonly section: number; readonly of: number } | null;
	/** A ticket click: the ticket to post on and the message to post (the closing block's hand-off). */
	readonly ticket?: { readonly key: string; readonly message: string };
	/** A build click: the brief of the frozen version, the points still open in it. */
	readonly build?: { readonly brief: string };
	/** A close click: the step of the close to carry out and its brief, the commands to run. */
	readonly close?: { readonly step: string; readonly brief: string };
	/** The one operation that answers this click. */
	readonly answerWith: string;
}

const THREAD_SHOWN = 12;
const EXCERPT = 120;

/** The answer a prefill click carries to the question of the AI's suggestion; null for a plain prefill. */
function suggestionAnswerOf(request: EvolutionRequest, click: AiClick): ClickContext['answer'] {
	const proposal = click.proposalId ? request.proposals.find((p) => p.id === click.proposalId) : undefined;
	if (!proposal?.ask?.answer) return null;
	return {
		proposalId: proposal.id,
		suggested: proposal.value,
		question: proposal.ask.question,
		body: proposal.ask.answer.body,
		earlier: (proposal.dialogue ?? []).map((e) => ({ question: e.question, answer: e.answer }))
	};
}

/** The AI's question a message leaves unanswered by starting another topic, and what to tell the person. */
function scopeOf(messages: readonly FieldThreadMessage[], message: FieldThreadMessage, personId: string): ClickContext['scope'] {
	const waiting = waitingQuestionOf(
		messages.filter((m) => m.postedAt < message.postedAt),
		personId
	);
	if (!waiting) return { waitingQuestion: null, note: null };
	const excerpt = waiting.body.length > EXCERPT ? `${waiting.body.slice(0, EXCERPT)}...` : waiting.body;
	const answersIt = topicOf(messages, message.id) === topicOf(messages, waiting.id);
	return {
		waitingQuestion: { id: waiting.id, excerpt },
		note: answersIt
			? null
			: `This message opens a new topic while your question (${waiting.id}) still waits in this thread: say so to the person, and ask whether it answers that question before acting on it.`
	};
}

/** What the page holds on one question: its words, its value, and whether a suggestion waits on it. */
function questionRead(view: EvolutionView, request: EvolutionRequest, fieldPath: string, leafId: string | null) {
	// Who asked and where it comes from, as 1.1 reads them (ac-evo-live-prefill).
	const origin = isOriginField(fieldPath) ? originAnswersOf(view, request).find((a) => a.path === fieldPath) : undefined;
	if (origin) {
		const waits = request.proposals.some((p) => p.targetField === fieldPath && (p.decision === 'pending' || p.decision === 'reworded'));
		return { asked: null, step: 'request', label: blockFieldByPath(fieldPath)?.label ?? fieldPath, value: origin.value, suggestionWaits: waits };
	}
	const key = fieldKey(fieldPath, leafId);
	const [, step, question] = fieldPath.split('.');
	const asked = fieldPath.startsWith('step.') ? stepQuestionOf(step, question) : null;
	const row = fieldPath.startsWith('00-need.')
		? needFieldRows(view, request).find((r) => r.path === fieldPath)
		: dossierFieldRows(view, request, { excerpt: false }).find((r) => fieldKey(r.path, r.leafId) === key);
	const value = row
		? row.value
		: asked
			? (request.stepAnswers[asked.step]?.[asked.key] ?? '')
			: question === 'description' && step in request.stepDescriptions
				? request.stepDescriptions[step as keyof typeof request.stepDescriptions]
				: '';
	return {
		asked,
		step,
		label: row && 'label' in row ? String(row.label) : (asked?.question ?? (question === 'description' ? stepDescriptionQuestionOf(step) : null) ?? fieldPath),
		value,
		suggestionWaits: !!row && 'pendingProposalId' in row && !!row.pendingProposalId
	};
}

/**
 * A ticket click asks nothing of the request: the message is composed, and the
 * AI posts it through its own tracker connector, then reports what it did.
 */
function ticketContextOf(projectId: string, request: EvolutionRequest, click: AiClick & { readonly ticket: NonNullable<AiClick['ticket']> }): ClickContext {
	return {
		id: click.id,
		kind: click.kind,
		fieldPath: click.fieldPath,
		leafId: null,
		step: null,
		question: `Post the closing message on ticket ${click.ticket.key}`,
		value: click.ticket.message,
		href: requestPagePath(projectId, request.id),
		message: null,
		thread: [],
		scope: null,
		known: pageKnowledge(request, []),
		section: [],
		answer: null,
		stepPrefill: null,
		ticket: click.ticket,
		answerWith: ticketPostInstruction({ projectId, requestId: request.id, ticketKey: click.ticket.key })
	};
}

/**
 * A build click hands the AI the brief of the frozen version: it writes the
 * code, proves it with tests, records the results in the index and syncs it;
 * every sync rebuilds the report the Build step reads, and the last rebuild,
 * asked by the AI, answers the click.
 */
function buildContextOf(projectId: string, request: EvolutionRequest, click: AiClick & { readonly build: NonNullable<AiClick['build']> }, code: CodeReading | null): ClickContext {
	// The branch first: the code of the request is never written on the deployment branch (ac-evo-branch-name).
	const onBranch = code
		? ` Work on the branch ${code.expectedBranch}${code.branch ? '' : ` (create it: ${code.createCommand})`}, never on ${code.deploymentBranch}, and commit before running the tests: a result on uncommitted code or another commit proves nothing. sync-index.mjs reports the branch and its last commit of code.`
		: '';
	return {
		id: click.id,
		kind: click.kind,
		fieldPath: click.fieldPath,
		leafId: null,
		step: 'build',
		question: `Build version ${request.specVersion} of the request and prove it`,
		value: click.build.brief,
		href: requestPagePath(projectId, request.id),
		message: null,
		thread: [],
		scope: null,
		known: pageKnowledge(request, []),
		section: [],
		answer: null,
		stepPrefill: null,
		build: click.build,
		answerWith: `Write the code against spec version ${request.specVersion} (follow the lyriks-delivery skill).${onBranch} Add a test per acceptance criterion and per scenario named by its [criterion:...] or [unspa:...] token; run the tests, record their results with node .lyriks/tools/ingest-results.mjs, then sync the index (node .lyriks/tools/sync-index.mjs). Each sync rebuilds the report the person reads at Build, so say each step with update_evolution_session. When you are done, answer with apply_evolution_batch [{ op: "build_implementation_report", requestId: "${request.id}" }]. Never report a test that did not run.`
	};
}

const CLOSE_QUESTION: Readonly<Record<string, string>> = {
	merge: "Merge the request's branch into the deployment branch and report the merge",
	sync: 'Sync the implementation index again now that the change is live',
	branch: "Delete the request's merged branch"
};
const CLOSE_ANSWER: Readonly<Record<string, string>> = {
	merge:
		"In the person's checkout, run the commands of the brief in order: switch to the deployment branch, merge the request's branch with --no-ff, then report the merge with report-merge.mjs, which makes the change official once Lyriks finds the validated commit in it. Never push. If git refuses the merge (a conflict, an uncommitted tree), stop and tell the person what git said with update_evolution_session; never force it.",
	sync: 'From the deployment branch, run the command of the brief (sync-index.mjs): the entries held while the request was open resolve against the official specification. Tell the person the counters it prints with update_evolution_session.',
	branch: "Run the command of the brief (git branch -d): it deletes the branch only when git says it is merged. Never use -D; if git refuses, tell the person what it said with update_evolution_session."
};

/**
 * A close click hands the AI one step of the close (ac-evo-verd-steps-to-ai):
 * the commands of the step in its brief, what they make of the request, and
 * what to say when git refuses. Lyriks never touches the repository: the AI
 * does, in the person's checkout, and reports what git says.
 */
function closeContextOf(projectId: string, request: EvolutionRequest, click: AiClick & { readonly close: NonNullable<AiClick['close']> }): ClickContext {
	return {
		id: click.id,
		kind: click.kind,
		fieldPath: click.fieldPath,
		leafId: null,
		step: null,
		question: CLOSE_QUESTION[click.close.step] ?? 'Carry out the step of the close',
		value: click.close.brief,
		href: requestPagePath(projectId, request.id, { kind: 'next-step' }),
		message: null,
		thread: [],
		scope: null,
		known: pageKnowledge(request, []),
		section: [],
		answer: null,
		stepPrefill: null,
		close: click.close,
		answerWith: `${CLOSE_ANSWER[click.close.step] ?? ''} When you are done, call await_evolution_event: that answers the click.`
	};
}

export async function contextOf(services: AppServices, projectId: string, stored: EvolutionRequest, click: AiClick): Promise<ClickContext> {
	// The AI reads the request as its person does: never another member's private exchange.
	const request = requestSeenBy(stored, click.personId);
	if (click.kind === 'ticket' && click.ticket) return ticketContextOf(projectId, request, { ...click, ticket: click.ticket });
	if (click.kind === 'close' && click.close) return closeContextOf(projectId, request, { ...click, close: click.close });
	if (click.kind === 'build' && click.build) {
		const draft = (await loadEvolutionView(services, projectId)).draft;
		const code = codeReadingOf(request, requestKeyOf(draft.requests, request.id) ?? 'EVO', draft.deploymentBranch ?? '');
		return buildContextOf(projectId, request, { ...click, build: click.build }, code);
	}
	const view = await loadEvolutionView(services, projectId);
	const key = fieldKey(click.fieldPath, click.leafId);
	const { asked, step, label, value } = questionRead(view, request, click.fieldPath, click.leafId);
	const thread = latestThread(request, key);
	const message = click.messageId ? thread?.messages.find((m) => m.id === click.messageId) : undefined;
	const at = { requestId: request.id, fieldPath: click.fieldPath, leafId: click.leafId };
	const answer = suggestionAnswerOf(request, click);
	const run: StepPrefill | null = (click.stepPrefillId && request.stepPrefills?.find((r) => r.id === click.stepPrefillId)) || null;
	const stepPrefill = run ? { step: run.step, section: run.index + 1, of: run.sections.length } : null;
	// A step prefill walks its sections one at a time: the page hands the next one once this one is settled.
	const walked = stepPrefill
		? ` This click is section ${stepPrefill.section} of ${stepPrefill.of} of a prefill of the whole ${stepPrefill.step} step: fill this section only, then call await_evolution_event; the next section comes once this one is settled (your question there answered).`
		: '';
	// A prefill hands every question of its section; a draw, the texts its diagram is drawn from (ac-evo-live-draw).
	const drawn = click.kind === 'draw' && click.step && isPairedStep(click.step) ? click.step : null;
	const section = (click.kind === 'prefill' ? sectionOf(click) : drawn ? pairedTextFields(drawn) : []).map((fieldPath) => {
		const read = questionRead(view, request, fieldPath, click.leafId);
		return { fieldPath, question: read.label, value: read.value, suggestionWaits: read.suggestionWaits };
	});
	// The texts the diagram moved past, which a draw rewrites from it instead of redrawing.
	const textsBehind = drawn ? textsBehindDiagram(request, drawn) : [];
	// The steps whose texts a prefill writes: their diagram is redrawn from them in the same answer (ac-evo-live-prefill).
	const pairedWritten = [...new Set(section.map((q) => q.fieldPath.split('.')).filter(([kind, s, q]) => kind === 'step' && isPairedStep(s) && q !== FUNCTIONAL_DIAGRAM_KEY).map(([, s]) => s))];
	/** The one operation that fills a question: a version on a step of prose, a proposal anywhere else. */
	const fillOp = (fieldPath: string) => {
		const [, s, q] = fieldPath.split('.');
		if (fieldPath.startsWith('step.') && q === 'description') return `{ op: "update_step_description", requestId: "${request.id}", step: "${s}", description }`;
		return fieldPath.startsWith('step.') && stepQuestionOf(s, q)
			? `{ op: "answer_step", requestId: "${request.id}", step: "${s}", question: "${q}", answer }`
			: `{ op: "propose", requestId: "${request.id}", fieldPath: "${fieldPath}", leafId: ${JSON.stringify(click.leafId)}, value${fieldPath === ORIGIN_ANSWER_KEYS.origin ? ` (one of ${REQUEST_ORIGINS.map((o) => o.code).join(', ')})` : ''}, whatWasRead, whatWasInferred, citedSourceIds, question?, choices? }`;
	};
	const ONE_QUESTION = 'Read `known` first and never ask what it holds; when one fact is still missing, ask it in ONE suggestion (question: ONE question, choices: at most 3 short answers a click gives), the one it changes most, never in the thread.';
	/** How the AI talks with the person in comments (ac-evo-live-conversation-writes). */
	const CONVERSATION_RULES =
		'Read `known` and the thread first and never ask what they hold; one question per message, its answers as choices when there are few; answer in the thread of the question it concerns.';
	// In a workspace of several members the AI writes no version on a step: its texts are one suggestion the person accepts (ac-evo-live-shared-writes).

	const PLACES = suggestionPlaces().map((p) => `${p.fieldPath} (${p.label})`).join('; ');
	/** One message carrying every text of a step the click fills, each at its place, for the person to accept in one click. */
	const suggestOp = (paths: readonly string[]) =>
		`{ op: "post_on_field", requestId: "${request.id}", fieldPath: "${paths[0]}", body: <one sentence: what you suggest>, writes: [${paths.map((p) => `{ fieldPath: "${p}", value }`).join(', ')}] }`;
	const SUGGEST_RULE =
		'Each value contains only the new requirement candidates for its exact fieldPath/category, one statement per line. Keep existing answers intact. The person accepts or rejects each requirement independently in Solution; accepting never validates it. The message body is one short explanation, never the requirement bundle again. Read existing candidates and decisions first: never repeat an identical pending, accepted or rejected requirement in a new message or reply. Preserve stable IDs and every human rejection; model only actual changes, keep unchanged actions as context, and never recreate or validate rejected actions to bypass Restore.';
	const whole =
		section.length > 1
			? ` The click covers every question of \`section\`: in the same batch, fill each one still empty that what the page holds lets you fill (${section
					.filter((q) => q.fieldPath !== click.fieldPath)
					.map((q) => fillOp(q.fieldPath))
					.join(', ')}), a step's description first, the questions of its step written from it; leave one alone only when your suggestion already waits on it and nothing new informs it, or when nothing on the page lets you suggest it.`
			: '';
	const redrawn =
		click.kind === 'prefill' && pairedWritten.length > 0
			? ` Then, in the same batch, redraw the diagram of ${pairedWritten.join(' and ')} from the texts you wrote (${pairedWritten
					.map((s) => `{ op: "redraw_diagram", requestId: "${request.id}", step: "${s}", diagram }`)
					.join(', ')}): the list and the drawing say the same.`
			: '';
	// A click is never let go of in silence (ac-evo-live-click-state).
	const NEVER_SILENT = ` Never call await_evolution_event again with nothing written: when nothing on the page lets you fill any question, ask the person the one fact you miss in the thread of the first one ({ op: "post_on_field", ${JSON.stringify(at).slice(1, -1)}, body, asks: true }).`;
	const stepTexts = (section.length > 0 ? section.map((q) => q.fieldPath) : [click.fieldPath]).filter((p) => suggestionPlaceOf(p) !== null);
	const otherFields = section.map((q) => q.fieldPath).filter((p) => p !== click.fieldPath && suggestionPlaceOf(p) === null);
	const answerWith =
		click.kind === 'prefill' && stepTexts.length > 0
			? `apply_evolution_batch [${[suggestOp(stepTexts), ...otherFields.map(fillOp)].join(', ')}]: offer requirement candidates at their exact fieldPath, one statement per line; each appears in its category in Solution for its own Accept or Reject. Write no answer yourself. ${SUGGEST_RULE} Do not redraw the diagram: it follows the texts once they are accepted.${NEVER_SILENT}${walked}`
			: click.kind === 'prefill' && answer
			? `apply_evolution_batch [{ op: "register_source", note: <the person's answer, verbatim> }, ${fillOp(click.fieldPath)}]: the person answered the question of your suggestion; your new suggestion folds the answer in and replaces the old one in place.${whole} Ask a next question only if one fact is still missing, one question, with at most 3 choices.`
			: click.kind === 'prefill' && click.fieldPath.startsWith('step.')
				? `apply_evolution_batch [${fillOp(click.fieldPath)}]: your answer is a version the person validates or refuses on the page.${whole}${redrawn}${NEVER_SILENT}${walked}`
				: click.kind === 'prefill'
					? `apply_evolution_batch [${fillOp(click.fieldPath)}]: the person signs the proposal on the page.${whole} ${ONE_QUESTION}${NEVER_SILENT}${walked}`
					: click.kind === 'ask'
						? `apply_evolution_batch [{ op: "post_on_field", ${JSON.stringify(at).slice(1, -1)}, replyTo: "${click.messageId}", body, asks?, choices?, multiple?, writes? }]: your reply, in that thread, under your name, between the person and you until it is published; add asks: true when it asks them something, with its answers as choices when it is one of a few (yes or no among them), and multiple: true when several may be picked. A subject that belongs to another question goes there with private: true, and your reply here says where. ${CONVERSATION_RULES} When the exchange settled what a text of the request needs, offer it in this reply: writes [{ fieldPath, value }], each requirement in its exact category, and ask the person to decide the individual candidates in Solution. ${SUGGEST_RULE} The places: ${PLACES}. A field of a block takes a proposal instead (op propose).`
						: textsBehind.length > 0
							? `apply_evolution_batch [${textsBehind.map((q) => `{ op: "write_text_from_diagram", requestId: "${request.id}", step: "${click.step}", question: "${q}", answer }`).join(', ')}]: the diagram moved past ${textsBehind.length === 1 ? 'this text' : 'these texts'} of \`section\`; rewrite ${textsBehind.length === 1 ? 'it' : 'each'} from the diagram, in prose, keeping the person's words wherever the diagram still says them.${click.follow ? ' Sent by the page: a write left the texts and the diagram apart.' : ''}`
							: `apply_evolution_batch [{ op: "redraw_diagram", requestId: "${request.id}", step: "${click.step}", diagram }]: the diagram drawn from the step's texts as they stand, in \`section\`.${click.follow ? ' Sent by the page: a write left the texts and the diagram apart.' : ''}`;
	return {
		id: click.id,
		kind: click.kind,
		fieldPath: click.fieldPath,
		leafId: click.leafId,
		step: click.step ?? (click.fieldPath.startsWith('step.') ? step : null),
		question: label,
		value,
		href: requestPagePath(projectId, request.id, { kind: 'field', leafId: click.leafId, path: click.fieldPath }),
		message: message ? { id: message.id, body: message.body, replyTo: message.replyTo ?? null } : null,
		thread: (thread?.messages ?? []).slice(-THREAD_SHOWN).map((m) => ({
			id: m.id,
			author: m.author,
			authorKind: m.authorKind,
			body: m.body,
			replyTo: m.replyTo ?? null,
			private: !!m.privateTo,
			awaitsAnswer: !!m.awaitsAnswer,
			...(m.suggests?.length ? { suggestion: { places: m.suggests.map((w) => w.fieldPath), writes: m.suggests, state: m.suggestion?.state ?? ('waiting' as const), decisions: m.requirementDecisions ?? [] } } : {})
		})),
		scope: message && thread ? scopeOf(thread.messages, message, click.personId) : null,
		known: pageKnowledge(
			request,
			needFieldRows(view, request)
				.filter((r) => r.filled)
				.map((r) => ({ path: r.path, label: String(r.label), value: r.value }))
		),
		section,
		answer,
		stepPrefill,
		answerWith
	};
}

/**
 * What the AI receives when the person moved the request on themselves
 * (ac-evo-live-progress-wakes): what they did, the step the request stands at
 * now and its next steps, so the AI carries on the tour without being told.
 */
export interface ProgressContext {
	readonly happened: readonly string[];
	readonly step: { readonly code: string; readonly label: string };
	readonly href: string;
	readonly next: Coaching;
	readonly answerWith: string;
}

const CARRY_ON =
	'The person moved the request on themselves, on the page. Say in one sentence, in the chat, what they did and what comes next (next.say), then carry on from `next`: on a step of prose, draft what it asks the way a Prefill click would (its description first, then each question it covers, its diagram with it), ask the one fact you miss in your suggestion, and hand the person the href of what waits on them. Then call await_evolution_event again.';

export async function progressContextOf(services: AppServices, projectId: string, stored: EvolutionRequest, personId: string, progress: PersonProgress): Promise<ProgressContext> {
	const request = requestSeenBy(stored, personId);
	const view = await loadEvolutionView(services, projectId);
	// At the Impact analysis the next step counts the Specification's actions too (ac-evo-form-step-lock).
	const next = coachFor(view, request, readsSpecificationActions(request) ? await specificationActionTrails(services, view, request) : NO_ACTIONS_COUNTED);
	return {
		happened: progress.happened,
		step: { code: next.step, label: stepLabel(next.step) },
		href: requestPagePath(projectId, request.id, { kind: 'next-step' }),
		next,
		answerWith: CARRY_ON
	};
}

/** The page's words for what the AI thinks about (ac-evo-live-state). */
export function thinkingAboutOf(click: AiClick): string {
	const where = click.fieldPath.replace(/^00-need\./, 'Need, ').replace(/^step\.([a-z_]+)\./, (_, s: string) => `${s.replace('_', ' ')}, `);
	if (click.kind === 'ticket') return `posting the closing message on ${click.ticket?.key ?? 'the ticket'}`;
	if (click.kind === 'build') return 'building the frozen version';
	if (click.kind === 'close') return click.close?.step === 'merge' ? 'merging the branch and reporting the merge' : click.close?.step === 'sync' ? 'syncing the index again' : 'deleting the merged branch';
	if (click.kind === 'prefill' && click.proposalId) return `your answer on ${where}`;
	return click.kind === 'prefill' ? `prefilling ${where}` : click.kind === 'ask' ? `your question on ${where}` : `drawing the ${(click.step ?? 'functional_spec').replace('_', ' ')} diagram`;
}

/** Said with the next answer of the call when the person cancelled the request the AI was on (ac-evo-live-cancel). */
export type Notice = { readonly cancelled?: { readonly clickId: string; readonly undone: number; readonly kept: readonly string[]; readonly note: string } };

export type AwaitAnswer = Notice &
	(
		| { readonly kind: 'click'; readonly click: ClickContext }
		| { readonly kind: 'progress'; readonly progress: ProgressContext }
		| { readonly kind: 'nothing'; readonly waitedSeconds: number }
		| { readonly kind: 'ended'; readonly reason: SessionEndReason }
	);

type Step = (
	| { kind: 'click'; click: AiClick; request: EvolutionRequest }
	| { kind: 'progress'; progress: PersonProgress; request: EvolutionRequest }
	| { kind: 'ended'; reason: SessionEndReason }
	| { kind: 'wait' }
) & {
	cancelled?: AiClick | null;
};

export function noticeOf(click: AiClick | null | undefined): Notice {
	if (!click) return {};
	const undone = click.cancellation?.undone ?? 0;
	const kept = click.cancellation?.kept ?? [];
	return {
		cancelled: {
			clickId: click.id,
			undone,
			kept,
			note: `The person cancelled the request you were on (${click.id}): ${undone} ${undone === 1 ? 'place' : 'places'} you wrote went back to what ${undone === 1 ? 'it was' : 'they were'}${
				kept.length > 0 ? `, and ${kept.length} changed since by someone else stayed` : ''
			}. Do not redo it unless the person asks again.`
		}
	};
}

/**
 * One look at the request for the waiting call: the turn the AI was on ends now
 * that it calls again, an idle session ends, the oldest waiting click is handed
 * over, else the person's progress the AI has not heard of.
 */
async function look(services: AppServices, projectId: string, requestId: string, personId: string, sessionId: string, first: boolean): Promise<Step> {
	const now = services.clock.nowIso();
	const step = await changeRequest<Step>(services, projectId, requestId, (request) => {
		const open = openSessionOf(request, personId);
		if (!open || open.id !== sessionId) {
			// The session named answers its own reason: opening another AI's session never ends one (EVO-015).
			const named = (request.liveSessions ?? []).find((s) => s.id === sessionId) ?? lastSessionOf(request, personId);
			return { request: null, result: { kind: 'ended', reason: named?.endReason ?? 'ended_by_person' } };
		}
		const turn = first ? closeTurn(request, personId, now) : null;
		const cancelled = turn?.cancelled ?? null;
		const answered = turn?.request ?? request;
		if (isIdle(answered, personId, now, aiWorkedAt(projectId, personId))) {
			const idle = endSession(answered, personId, 'idle', now, sessionId);
			return { request: idle.ok ? idle.request : answered, result: { kind: 'ended', reason: 'idle' } };
		}
		// A step prefill moves to its next section once the one it is on is settled ("Move the step prefill to the next section").
		const moved = advanceStepPrefill(answered, personId, now, () => crypto.randomUUID());
		// The oldest click first, else the person's own progress, once (ac-evo-live-progress-wakes).
		const handed = handToWaitingCall(moved, personId, now, first);
		if (handed.kind === 'click') return { request: handed.request, result: { kind: 'click', click: handed.click, request: handed.request, cancelled } };
		if (handed.kind === 'progress') return { request: handed.request, result: { kind: 'progress', progress: handed.progress, request: handed.request, cancelled } };
		return { request: handed.request === request ? null : handed.request, result: { kind: 'wait', cancelled } };
	});
	return step ?? { kind: 'ended', reason: 'ended_by_person' };
}

/**
 * The AI waits for the person's next click ("Wait for the next click",
 * ac-evo-live-wait): at most `waitSeconds`, never more than platformWaitSeconds
 * in one request. It looks at the request again whenever the project changes,
 * and every progressIntervalSeconds at the latest; `aborted` says the caller
 * hung up, which reads gone at once ("The waiting call drops").
 */
export async function awaitNextClick(
	services: AppServices,
	input: { readonly projectId: string; readonly requestId: string; readonly personId: string; readonly sessionId: string; readonly waitSeconds: number },
	hooks: { readonly aborted: () => boolean; readonly onAbort: (listener: () => void) => void }
): Promise<AwaitAnswer> {
	ensureWatching(services);
	const base = { projectId: input.projectId, requestId: input.requestId, personId: input.personId, sessionId: input.sessionId };
	const limit = Math.max(1, Math.min(input.waitSeconds, LIVE_SESSION.platformWaitSeconds));
	const started = Date.now();
	let first = true;
	let notice: Notice = {};
	for (;;) {
		const step = await look(services, input.projectId, input.requestId, input.personId, input.sessionId, first);
		if (first) notice = noticeOf(step.cancelled);
		first = false;
		if (step.kind === 'ended') {
			sayEnded(services, base, step.reason);
			return { ...notice, kind: 'ended', reason: step.reason };
		}
		if (step.kind === 'click') {
			say(services, base, 'thinking', { thinkingAbout: thinkingAboutOf(step.click), saying: null, step: null });
			return { ...notice, kind: 'click', click: await contextOf(services, input.projectId, step.request, step.click) };
		}
		if (step.kind === 'progress')
			return { ...notice, kind: 'progress', progress: await progressContextOf(services, input.projectId, step.request, input.personId, step.progress) };
		const left = limit * 1000 - (Date.now() - started);
		if (left <= 0) return { ...notice, kind: 'nothing', waitedSeconds: Math.round((Date.now() - started) / 1000) };
		say(services, base, 'listening', { thinkingAbout: null });
		// A click is a write on the request: any change of the project is a reason to look again.
		const woke = await new Promise<'look' | 'abort'>((resolve) => {
			const unsubscribe = subscribeSectionChanges((change) => {
				if (change.projectId === input.projectId) finish('look');
			});
			const timer = setTimeout(() => finish('look'), Math.min(left, LIVE_SESSION.progressIntervalSeconds * 1000));
			hooks.onAbort(() => finish('abort'));
			function finish(why: 'look' | 'abort') {
				clearTimeout(timer);
				unsubscribe();
				resolve(why);
			}
		});
		if (woke === 'abort' || hooks.aborted()) {
			await endGone(services, base);
			return { kind: 'ended', reason: 'gone' };
		}
	}
}

/** The AI is gone: its session ends and what it held goes back to waiting. */
async function endGone(services: AppServices, base: { projectId: string; requestId: string; personId: string; sessionId: string }): Promise<void> {
	const now = services.clock.nowIso();
	const ended = await changeRequest(services, base.projectId, base.requestId, (request) => {
		const outcome = endSession(request, base.personId, 'gone', now, base.sessionId);
		return { request: outcome.ok ? outcome.request : null, result: outcome.ok };
	});
	if (ended) sayEnded(services, base, 'gone');
}

/** The key the session of the whole project is said under, beside the requests' own (ac-ai-session-project). */
export const PROJECT_SESSION_KEY = '';

type GoneHandler = (services: AppServices, base: { projectId: string; personId: string; sessionId: string }) => Promise<void>;
let projectGone: GoneHandler | null = null;
/** The session of the whole project ends its own way when its AI is gone (ai-session.server). */
export function onProjectSessionGone(handler: GoneHandler): void {
	projectGone = handler;
}

/** Every AI between two calls silent for disconnectAfterSeconds is gone ("Mark a silent AI gone"). */
async function markSilentGone(services: AppServices): Promise<void> {
	const now = services.clock.nowIso();
	for (const signal of presence.values()) {
		if (signal.status !== 'thinking' && signal.status !== 'writing' && signal.status !== 'cancelled') continue;
		// Any call of its AI on the project counts, not only the calls of the session (criterion 122ab5c8 of feat-ai-session).
		const worked = aiWorkedAt(signal.projectId, signal.personId);
		const since = worked && worked > signal.at ? worked : signal.at;
		if (secondsBetween(since, now) < LIVE_SESSION.disconnectAfterSeconds) continue;
		const ending = signal.requestId === PROJECT_SESSION_KEY ? projectGone?.(services, signal) : endGone(services, signal);
		await ending?.catch((e) => console.warn('[evolution-live] could not end a silent session:', e instanceof Error ? e.message : e));
	}
}
