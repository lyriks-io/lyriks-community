import { aiActsOf, aiWorkedAt } from './ai-work.server';
import { readRetrospecStanding } from './retrospec-status.server';
import { retrospecFinishedAt } from '$domain/retrospec';
import type { AppServices } from '$composition/container.server';
import {
	advanceStepPrefill,
	askAnotherAi,
	clicksFor,
	closeProjectTurn,
	closeTurn,
	endProjectSession,
	expireQuestion,
	handToWaitingCall,
	isProjectIdle,
	projectSessionEnding,
	lastProjectSessionOf,
	LIVE_SESSION,
	openProjectSessionOf,
	openProjectSessionsOf,
	openSessionOf,
	pendingProjectClicksOf,
	questionStanding,
	requestPagePath,
	RUN_CLICK_KINDS,
	sendProjectClick,
	sessionHolding,
	sessionName,
	sessionWorkDone,
	startProjectSession,
	takeProjectClick,
	withdrawProjectClick,
	withMirror,
	type AiClick,
	type SessionHolding,
	type SessionOpening,
	type SessionStanding,
	type EvolutionRequest,
	type LiveSession,
	type ProjectClick,
	type ProjectClickInput,
	type PersonProgress,
	type ProjectClickOutcome,
	type ProjectEvolutionDraft,
	type SessionEndReason
} from '$domain/evolution';
import { placeOfAnchor, anchorKind } from '$domain/discussions';
import { conversationOf } from '$domain/ai-conversations';
import { subscribeSectionChanges, type ProjectLiveSignal } from './sync-bus.server';
import { runHandover } from './retrospec-handover.server';
import {
	contextOf,
	ensureWatching,
	noticeOf,
	onProjectSessionGone,
	presenceOf,
	PROJECT_SESSION_KEY,
	projectPresencesOf,
	progressContextOf,
	say,
	sayEnded,
	sayOpened,
	thinkingAboutOf,
	type ClickContext,
	type Notice,
	type ProgressContext
} from './evolution-live.server';

/**
 * The sessions of the person's own AIs on the whole project (feat-ai-session):
 * each opened from the prompt Ask my AI copies (or by the AI itself in a
 * bound repository), beside the person's other AIs (EVO-015). Each hands its
 * AI the person's clicks that go to it (click-routing), from every page of the
 * project, in the order they were made. A click on a request is handed through
 * that request's own session logic, the request getting a session of the same
 * id (withMirror); a question on a block of the Specification 360°, a
 * re-reading of the code and a question of another AI are clicks of the project.
 */

type Base = { readonly projectId: string; readonly personId: string; readonly sessionId: string };
const onProject = (base: Base) => ({ ...base, requestId: PROJECT_SESSION_KEY });

type Change<T> = { readonly draft: ProjectEvolutionDraft | null; readonly result: T };

/** Read the evolution draft, change it, save it under the revision read; a concurrent write makes the change again. */
async function changeDraft<T>(services: AppServices, projectId: string, change: (draft: ProjectEvolutionDraft) => Change<T>): Promise<T | null> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const [draft, revision] = await Promise.all([services.loadEvolutionDraft.execute(projectId), services.sectionDocuments.currentRevision(projectId, 'evolution')]);
		const { draft: changed, result } = change(draft);
		if (!changed) return result;
		if (await services.saveEvolutionDraft.execute(changed, { expectedRevision: revision, origin: null })) return result;
	}
	return null;
}

/**
 * The calls of each session's AI held on this server right now, and when the
 * last one ended (ac-ai-session-end): what tells an AI that waits from one whose
 * conversation was closed between two waits. Per node, like presence; a server
 * that restarts counts from its own start (criterion 8181d158).
 */
const SERVER_STARTED_MS = Date.now();
const heldCalls = new Map<string, { calls: number; lastMs: number }>();
const callKey = (projectId: string, sessionId: string) => `${projectId}::${sessionId}`;
function holdCall(projectId: string, sessionId: string): () => void {
	const key = callKey(projectId, sessionId);
	const now = heldCalls.get(key) ?? { calls: 0, lastMs: Date.now() };
	heldCalls.set(key, { calls: now.calls + 1, lastMs: Date.now() });
	return () => {
		const held = heldCalls.get(key);
		if (held) heldCalls.set(key, { calls: Math.max(0, held.calls - 1), lastMs: Date.now() });
	};
}

/**
 * What one session's AI is doing now, as the routing reads it (EVO-015): free
 * while its waiting call is held and was heard within heardWithinSeconds, at
 * work while it is on a click. Read off the bus, so every node agrees.
 */
export function standingOf(projectId: string, personId: string, sessionId: string, nowMs: number): SessionStanding {
	const signal = presenceOf(projectId, PROJECT_SESSION_KEY, personId, sessionId);
	if (!signal) return { free: false, working: false };
	const fresh = nowMs - Date.parse(signal.at) <= LIVE_SESSION.heardWithinSeconds * 1000;
	return {
		free: signal.status === 'listening' && signal.callHeld === true && fresh,
		working: signal.status === 'thinking' || signal.status === 'writing' || signal.status === 'cancelled'
	};
}

/**
 * Ends each open session of the person that is over when Ask my AI reads it
 * ("Mark a silent AI gone", "End an idle session"): nobody did anything for
 * half an hour, or no call of its AI was held nor heard for
 * disconnectAfterSeconds. Without it a session its conversation left read
 * 'listening' forever.
 */
export async function settleProjectSession(services: AppServices, projectId: string, personId: string): Promise<void> {
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const now = services.clock.nowIso();
	// Every act of its AI on the project counts, its writes and reads included, not only the calls of the session (criterion 122ab5c8).
	const worked = aiWorkedAt(projectId, personId);
	for (const open of openProjectSessionsOf(draft, personId)) {
		const heard = presenceOf(projectId, PROJECT_SESSION_KEY, personId, open.id);
		const held = heldCalls.get(callKey(projectId, open.id));
		const reason = projectSessionEnding({
			idle: isProjectIdle(draft, personId, now, aiActsOf(projectId, personId), open.id),
			callHeld: (held?.calls ?? 0) > 0,
			working: heard?.status === 'thinking' || heard?.status === 'writing' || heard?.status === 'cancelled',
			quietSinceMs: Math.max(Date.parse(open.startedAt), SERVER_STARTED_MS, held?.lastMs ?? 0, heard ? Date.parse(heard.at) : 0, worked ? Date.parse(worked) : 0),
			nowMs: Date.parse(now)
		});
		if (reason) await closeProjectSession(services, projectId, personId, reason, open.id);
	}
}

/** One session as Ask my AI and the person's other AIs read it (criteria 39e1abc1, 4536271d). */
export interface SessionReading {
	readonly id: string;
	readonly name: string;
	readonly client: string | null;
	readonly holds: SessionHolding;
	readonly startedAt: string;
	/** What its AI does now, never saved; null when nothing was heard of it on this node. */
	readonly presence: ProjectLiveSignal | null;
}

/** The person's open sessions on the project, newest first, each with its name and what its AI does now. */
export function openSessionsReading(draft: ProjectEvolutionDraft, projectId: string, personId: string): SessionReading[] {
	return openProjectSessionsOf(draft, personId)
		.map((s) => ({
			id: s.id,
			name: sessionName(draft, personId, s),
			client: s.client ?? null,
			holds: sessionHolding(draft, personId, s),
			startedAt: s.startedAt,
			presence: presenceOf(projectId, PROJECT_SESSION_KEY, personId, s.id)
		}))
		.reverse();
}

/** The person's sessions on the project and what each of their AIs is doing now, as Ask my AI reads them (criteria 4cb97f74, 39e1abc1). */
export function projectSessionReading(draft: ProjectEvolutionDraft, projectId: string, personId: string) {
	// The newest open session, else the last one, so the chip can still say why it ended.
	const last = openProjectSessionOf(draft, personId) ?? lastProjectSessionOf(draft, personId);
	const now = last ? presenceOf(projectId, PROJECT_SESSION_KEY, personId, last.id) : null;
	return {
		session: last ? { id: last.id, open: !last.endedAt, startedAt: last.startedAt, endedAt: last.endedAt ?? null, endReason: last.endReason ?? null } : null,
		presence: now,
		sessions: openSessionsReading(draft, projectId, personId),
		clicks: (draft.clicks ?? []).filter((c) => c.personId.trim().toLowerCase() === personId.trim().toLowerCase() && c.kind !== 'question')
	};
}

/** One AI opens its own session on the project, beside the person's other AIs ("Open the session", rule edea94b0). */
export async function openProjectSession(services: AppServices, projectId: string, personId: string, opening: SessionOpening = {}) {
	const now = services.clock.nowIso();
	const opened = await changeDraft(services, projectId, (draft) => {
		const outcome = startProjectSession(draft, personId, crypto.randomUUID(), now, opening);
		if (!outcome.ok) return { draft: null, result: null };
		const waiting = pendingProjectClicksOf(outcome.draft, personId).length + outcome.draft.requests.reduce((n, r) => n + (r.aiClicks ?? []).filter((c) => c.personId === personId && c.state === 'waiting').length, 0);
		const others = openSessionsReading(outcome.draft, projectId, personId).filter((s) => s.id !== outcome.session.id);
		return { draft: outcome.draft, result: { session: outcome.session, waiting, others } };
	});
	if (!opened) throw new Error('The session could not be saved: try again.');
	sayOpened(services, onProject({ projectId, personId, sessionId: opened.session.id }));
	return opened;
}

/** The person ends one AI's session from the box of Ask my AI, or it ends idle or gone ("End the session"); their other AIs stay. */
export async function closeProjectSession(services: AppServices, projectId: string, personId: string, reason: SessionEndReason, sessionId?: string): Promise<LiveSession | null> {
	const now = services.clock.nowIso();
	const ended = await changeDraft(services, projectId, (draft) => {
		const outcome = endProjectSession(draft, personId, reason, now, sessionId);
		return outcome.ok ? { draft: outcome.draft, result: outcome.session } : { draft: null, result: null };
	});
	if (ended) sayEnded(services, onProject({ projectId, personId, sessionId: ended.id }), reason);
	return ended;
}

onProjectSessionGone(async (services, base) => {
	await closeProjectSession(services, base.projectId, base.personId, 'gone', base.sessionId);
});

/** A click made outside a request waits for the person's AI (ac-ai-session-ask-block, ac-ai-session-reread). */
export async function sendClickOnProject(services: AppServices, projectId: string, personId: string, input: ProjectClickInput, canEdit: boolean) {
	const now = services.clock.nowIso();
	return changeDraft<ProjectClickOutcome>(services, projectId, (draft) => {
		const outcome = sendProjectClick(draft, personId, input, canEdit, crypto.randomUUID(), now);
		return { draft: outcome.ok && outcome.draft !== draft ? outcome.draft : null, result: outcome };
	});
}

/** The person takes back a click their AI has not taken yet ("Withdraw the click"). */
export async function withdrawClickOnProject(services: AppServices, projectId: string, personId: string, clickId: string) {
	return changeDraft<ProjectClickOutcome>(services, projectId, (draft) => {
		const outcome = withdrawProjectClick(draft, personId, clickId);
		return { draft: outcome.ok ? outcome.draft : null, result: outcome };
	});
}

/** What the AI receives with a click made outside a request (ac-ai-session-ask-block, ac-ai-session-reread). */
export interface ProjectClickContext {
	readonly id: string;
	readonly kind: ProjectClick['kind'];
	readonly page: ProjectClick['page'];
	readonly place: { readonly anchor: string; readonly title: string; readonly href: string };
	readonly question?: string;
	readonly thread?: readonly { readonly author: string; readonly at: string; readonly text: string }[];
	/** A message of Ask my AI: the private conversation so far, oldest first. */
	readonly conversation?: readonly { readonly from: 'person' | 'you' | 'lyriks'; readonly at: string; readonly text: string; readonly change?: string }[];
	/** The page the conversation was asked from, or null for a conversation about the product as a whole. */
	readonly askedFrom?: { readonly title: string; readonly href: string; readonly anchor: string | null } | null;
	/** A question of another AI of the person: who asked it (EVO-015). */
	readonly from?: { readonly sessionId: string; readonly name: string };
	readonly read: string;
	readonly answerWith: string;
}

/** How the AI reads the element an anchor names, through the Lyriks MCP. */
function readHint(projectId: string, anchor: string, featureId?: string): string {
	const [, first, second] = anchor.split(':');
	switch (anchorKind(anchor)) {
		case 'feature':
		case 'core':
			return `get_behavior_feature({ project_id: "${projectId}", feature_id: "${first}" })`;
		case 'action':
			return `get_behavior_feature({ project_id: "${projectId}", feature_id: "${first}", action_id: "${second}" })`;
		case 'rule':
			return first === 'project' ? `get_section({ project_id: "${projectId}", section: "rules" })` : `get_behavior_feature({ project_id: "${projectId}", feature_id: "${first}", summary: true })`;
		case 'role':
		case 'permissions':
			return `get_section({ project_id: "${projectId}", section: "users" })`;
		case 'term':
			return `get_section({ project_id: "${projectId}", section: "glossary" })`;
		case 'datamap':
		case 'data':
			return `get_section({ project_id: "${projectId}", section: "data", summary: true })`;
		case 'stack':
			return `get_section({ project_id: "${projectId}", section: "architecture" })`;
		default:
			return featureId ? `get_behavior_feature({ project_id: "${projectId}", feature_id: "${featureId}" })` : `get_section({ project_id: "${projectId}", section: "foundation" })`;
	}
}

/** How the AI answers a message of Ask my AI (criteria 8fe54838, 8ec8310b, bbab6a2f). */
const CHAT_ANSWER = (clickId: string) =>
	[
		`apply_evolution_batch [{ op: "answer_click", clickId: "${clickId}", text, asks?, place?, proposal? }] (no requestId): your answer reads in the person's PRIVATE conversation with you, signed Lyriks · for them; nobody else reads it.`,
		'First read the page it was asked from (askedFrom; read) and judge whether the question bears on it: when it bears on something else, say what you understood it to be about; when you cannot tell what the person means, answer with ONE short question and asks: true, nothing else.',
		'Answer what was asked from what the specification and the code say, in the language of the question, in the words of the page (the Overview, the feature, its rules), never by a tool name or an id. Read the whole conversation: a message may answer your own question.',
		'Every page of the project you name is a link the person clicks: write it [its name](href), with the href a Lyriks answer gave for it (criterion 7f4690b0); a link to anywhere else than this installation reads as plain text.',
		'Add place { anchor, title }: the block of Knowledge your answer bears on most (feature:<featureId>, action:<featureId>:<actionId>, rule:<featureId>:<ruleId>, term:<id>, overview:what...), so the person can publish it there for the others to decide.',
		'Never write the specification from this answer. When the person asks for a change, prepare it as proposal { featureId, summary (what it changes, in their words), operations (the apply_behavior_batch vocabulary, against the feature as it is now: read it first) }. Lyriks runs it as a dry run and refuses your answer with what does not land: correct it and answer again until it lands. The person validates it on the page, which writes it; a message of Lyriks in the conversation tells you when it no longer lands.'
	].join(' ');

async function projectClickContext(services: AppServices, projectId: string, click: ProjectClick): Promise<ProjectClickContext> {
	// A run handed from Mismatch: the prompt of the run to follow (EVO-014, action 077fe5e2).
	if (RUN_CLICK_KINDS.has(click.kind)) {
		const runHref = click.page === 'drift' ? `/projects/${projectId}/drift` : `/projects/${projectId}/retrospec`;
		const handed = await runHandover(services, projectId, click);
		return { id: click.id, kind: click.kind, page: click.page, place: { anchor: click.anchor, title: click.title, href: runHref }, read: handed.read, answerWith: handed.answerWith };
	}
	const answer = (sentence: string) => `apply_evolution_batch [{ op: "answer_click", clickId: "${click.id}", text }] (no requestId): ${sentence}`;
	if (click.kind === 'question') {
		const draft = await services.loadEvolutionDraft.execute(projectId);
		const asker = lastProjectSessionOf(draft, click.personId, click.fromSessionId);
		const name = asker ? sessionName(draft, click.personId, asker) : 'your other AI';
		return {
			id: click.id,
			kind: click.kind,
			page: click.page,
			place: { anchor: '', title: `a question of ${name}`, href: `/projects/${projectId}` },
			question: click.text ?? '',
			from: { sessionId: click.fromSessionId ?? '', name },
			read: `read_evolution_sessions({ project_id: "${projectId}", session_id: <your session> }) says what each AI of the person holds and does`,
			answerWith: answer(
				`your answer goes back to ${name}, the other AI of the same person that asked it, and to nobody else. Answer from what you hold and know of the work you are on, briefly; change nothing in the specification for it. It waits ${LIVE_SESSION.peerAnswerSeconds} s at most: after that the asker was told no answer came and your answer is refused.`
			)
		};
	}
	const href = click.page === 'spec' ? `/projects/${projectId}/spec/${placeOfAnchor(click.anchor)}` : click.page === 'drift' ? `/projects/${projectId}/drift` : `/projects/${projectId}/retrospec`;
	if (click.kind === 'chat') {
		const document = await services.aiConversations.load(projectId).catch(() => null);
		const conversation = document && click.conversationId ? conversationOf(document, click.personId, click.conversationId) : null;
		const context = conversation?.context ?? null;
		return {
			id: click.id,
			kind: click.kind,
			page: click.page,
			place: { anchor: context?.anchor ?? '', title: click.title, href: `/projects/${projectId}/ask?c=${encodeURIComponent(click.conversationId ?? '')}` },
			question: click.text ?? '',
			conversation: (conversation?.messages ?? [])
				.filter((m) => !m.withdrawn)
				.map((m) => ({
					from: m.role === 'ai' ? ('you' as const) : m.role,
					at: m.at,
					text: m.text,
					...(m.proposal ? { change: `${m.proposal.summary} (${m.proposal.state})` } : {})
				})),
			askedFrom: context ? { title: context.title, href: context.href, anchor: context.anchor ?? null } : null,
			read: context?.anchor ? readHint(projectId, context.anchor) : `get_section({ project_id: "${projectId}", section: "foundation" })`,
			answerWith: CHAT_ANSWER(click.id)
		};
	}
	if (click.kind === 'ask_block') {
		const discussions = await services.loadDiscussions.execute(projectId).catch(() => null);
		const thread = discussions?.document.threads.find((t) => t.id === click.threadId);
		return {
			id: click.id,
			kind: click.kind,
			page: click.page,
			place: { anchor: click.anchor, title: click.title, href },
			question: click.text ?? '',
			thread: (thread?.messages ?? []).map((m) => ({ author: m.author.name, at: m.at, text: m.text })),
			read: readHint(projectId, click.anchor),
			answerWith: answer(
				'your answer is posted in the block\'s thread under your name, in reply to the question. Read the element first; answer what was asked from what the specification and the code say, in the language of the question, and change nothing in the specification in this answer. Answer in the words of the page: name what you read as the page names it (the Overview, the feature, its rules, its sources), never by a tool name or an id.'
			)
		};
	}
	return {
		id: click.id,
		kind: click.kind,
		page: click.page,
		place: { anchor: click.anchor, title: click.title, href },
		...(click.text ? { question: click.text } : {}),
		read: readHint(projectId, click.anchor, click.featureId),
		answerWith: `Re-read the code behind "${click.title}" (follow the lyriks-retrospec skill): read what was extracted, the sources and the places in the code it cites (list_sources, get_implementation_status), open those files in the repository, and correct the extraction wherever the code says otherwise, through apply_behavior_batch or patch_section, citing the code you read. What you rewrite waits for a person's validation again. Then ${answer('one sentence saying what you changed, or that nothing needed to change; the page shows it under the button.')}`
	};
}

/** What Ask my AI and the place of the click read while the AI is on a click outside a request. */
function thinkingAboutProjectClick(click: ProjectClick): string {
	switch (click.kind) {
		case 'chat':
			return `your message in ${click.title}`;
		case 'ask_block':
			return `your question on ${click.title}`;
		case 'question':
			return click.title;
		default:
			return `re-reading the code of ${click.title}`;
	}
}

export type ProjectAwaitAnswer = Notice &
	(
		| { readonly kind: 'click'; readonly requestId: string; readonly click: ClickContext }
		| { readonly kind: 'click'; readonly requestId: null; readonly click: ProjectClickContext }
		| { readonly kind: 'progress'; readonly requestId: string; readonly progress: ProgressContext }
		| { readonly kind: 'nothing'; readonly waitedSeconds: number }
		| { readonly kind: 'ended'; readonly reason: SessionEndReason }
	);

type Step = (
	| { kind: 'project-click'; click: ProjectClick }
	| { kind: 'request-click'; click: AiClick; request: EvolutionRequest }
	| { kind: 'progress'; progress: PersonProgress; request: EvolutionRequest }
	| { kind: 'ended'; reason: SessionEndReason }
	| { kind: 'wait' }
) & { cancelled?: AiClick | null };

/** The requests the session reached: those holding a session of its id. */
const mirrored = (draft: ProjectEvolutionDraft, personId: string, sessionId: string) => draft.requests.filter((r) => openSessionOf(r, personId)?.id === sessionId);

/**
 * One look at the project for the waiting call: the turn the AI was on ends, an
 * idle session ends, the oldest click of the person on any page is handed over,
 * else the progress of a request the session reached.
 */
/**
 * The draft with each request passed through `change`, the very same draft when
 * none changed: a look that finds nothing to do must write nothing. A new object
 * for an unchanged draft made every 30 s look of a waiting AI save the whole
 * Evolution document, which moved the project's revision, emptied every reading
 * cached on it and reloaded every open page of the project.
 */
export function withRequests(draft: ProjectEvolutionDraft, change: (request: EvolutionRequest) => EvolutionRequest): ProjectEvolutionDraft {
	const requests = draft.requests.map(change);
	return requests.some((r, i) => r !== draft.requests[i]) ? { ...draft, requests } : draft;
}

async function look(services: AppServices, base: Base, first: boolean): Promise<Step> {
	const now = services.clock.nowIso();
	const { personId, sessionId } = base;
	// Read before the change: a finished Reverse-Specification lets the session end once its AI's work is done (criterion 45933ee4).
	const finishedAt = await readRetrospecStanding(services, base.projectId)
		.then(({ status, doc }) => retrospecFinishedAt(status, doc))
		.catch(() => null);
	const step = await changeDraft<Step>(services, base.projectId, (stored) => {
		const open = openProjectSessionOf(stored, personId, sessionId);
		if (!open) {
			const last = lastProjectSessionOf(stored, personId, sessionId);
			return { draft: null, result: { kind: 'ended', reason: last?.endReason ?? 'ended_by_person' } };
		}
		let draft = stored;
		let cancelled: AiClick | null = null;
		if (first) {
			draft = closeProjectTurn(draft, personId, now, sessionId);
			draft = withRequests(draft, (r) => {
				if (openSessionOf(r, personId)?.id !== sessionId) return r;
				const turn = closeTurn(r, personId, now);
				cancelled ??= turn?.cancelled ?? null;
				return turn?.request ?? r;
			});
		}
		if (isProjectIdle(draft, personId, now, aiActsOf(base.projectId, personId), sessionId)) {
			const idle = endProjectSession(draft, personId, 'idle', now, sessionId);
			return { draft: idle.ok ? idle.draft : draft, result: { kind: 'ended', reason: 'idle' } };
		}
		// A step prefill of a request the session reached moves on once its section is settled.
		draft = withRequests(draft, (r) => (openSessionOf(r, personId)?.id === sessionId ? advanceStepPrefill(r, personId, now, () => crypto.randomUUID()) : r));
		// The oldest click that goes to this AI: the one holding what it touches, else the free AI opened last (EVO-015).
		const nowMs = Date.parse(now);
		for (const next of clicksFor(draft, personId, sessionId, (id) => standingOf(base.projectId, personId, id, nowMs))) {
			if (next.where === 'project') {
				const taken = takeProjectClick(draft, next.click.id, now, sessionId);
				if (taken) return { draft: taken.draft, result: { kind: 'project-click', click: taken.click, cancelled } };
				continue;
			}
			const request = withMirror(draft.requests.find((r) => r.id === next.requestId)!, personId, open, now);
			const handed = handToWaitingCall(request, personId, now, first);
			if (handed.kind === 'click') {
				const changed = { ...draft, requests: draft.requests.map((r) => (r.id === request.id ? handed.request : r)) };
				return { draft: changed, result: { kind: 'request-click', click: handed.click, request: handed.request, cancelled } };
			}
		}
		// The person's progress on a request the session reached, once (ac-evo-live-progress-wakes).
		for (const request of mirrored(draft, personId, sessionId)) {
			const handed = handToWaitingCall(request, personId, now, first);
			if (handed.kind === 'progress') {
				const changed = { ...draft, requests: draft.requests.map((r) => (r.id === request.id ? handed.request : r)) };
				return { draft: changed, result: { kind: 'progress', progress: handed.progress, request: handed.request, cancelled } };
			}
		}
		// Its work done and nothing waiting, the AI is told to stop instead of waiting half an hour ("End the session once the work is done").
		if (sessionWorkDone(draft, personId, sessionId, finishedAt, mirrored(draft, personId, sessionId).length > 0)) {
			const done = endProjectSession(draft, personId, 'finished', now, sessionId);
			if (done.ok) return { draft: done.draft, result: { kind: 'ended', reason: 'finished' } };
		}
		return { draft: draft === stored ? null : draft, result: { kind: 'wait', cancelled } };
	});
	return step ?? { kind: 'ended', reason: 'ended_by_person' };
}

/** The AI waits for the person's next click on any page of the project ("Hand the next click to the AI"). */
export async function awaitProjectEvent(
	services: AppServices,
	input: Base & { readonly waitSeconds: number },
	hooks: { readonly aborted: () => boolean; readonly onAbort: (listener: () => void) => void }
): Promise<ProjectAwaitAnswer> {
	ensureWatching(services);
	const base: Base = { projectId: input.projectId, personId: input.personId, sessionId: input.sessionId };
	const limit = Math.max(1, Math.min(input.waitSeconds, LIVE_SESSION.platformWaitSeconds));
	const started = Date.now();
	let first = true;
	let notice: Notice = {};
	// While this call waits, the AI is there; once it returns, its silence counts (ac-ai-session-end).
	const release = holdCall(input.projectId, input.sessionId);
	try {
	for (;;) {
		const step = await look(services, base, first);
		if (first) notice = noticeOf(step.cancelled);
		first = false;
		if (step.kind === 'ended') {
			sayEnded(services, onProject(base), step.reason);
			return { ...notice, kind: 'ended', reason: step.reason };
		}
		if (step.kind === 'project-click') {
			say(services, onProject(base), 'thinking', { thinkingAbout: thinkingAboutProjectClick(step.click), saying: null, step: null });
			return { ...notice, kind: 'click', requestId: null, click: await projectClickContext(services, base.projectId, step.click) };
		}
		if (step.kind === 'request-click') {
			const about = thinkingAboutOf(step.click);
			// Ask my AI and the request page both say what the AI thinks about; its steps show where the click was made.
			say(services, onProject(base), 'thinking', { thinkingAbout: `${about} (${step.request.title || 'a request'})`, saying: null, step: null });
			say(services, { ...base, requestId: step.request.id }, 'thinking', { thinkingAbout: about, saying: null, step: null });
			return { ...notice, kind: 'click', requestId: step.request.id, click: { ...(await contextOf(services, base.projectId, step.request, step.click)), href: requestPagePath(base.projectId, step.request.id) } as ClickContext };
		}
		if (step.kind === 'progress')
			return { ...notice, kind: 'progress', requestId: step.request.id, progress: await progressContextOf(services, base.projectId, step.request, base.personId, step.progress) };
		const left = limit * 1000 - (Date.now() - started);
		if (left <= 0) {
			// Between two waits the AI is not free: a click nobody holds goes to an AI whose call is held (EVO-015).
			say(services, onProject(base), 'listening', { thinkingAbout: null });
			return { ...notice, kind: 'nothing', waitedSeconds: Math.round((Date.now() - started) / 1000) };
		}
		// Said at every beat of the wait: free while this is fresh, on every node (criterion 8181d158).
		say(services, onProject(base), 'listening', { thinkingAbout: null, callHeld: true });
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
			await closeProjectSession(services, base.projectId, base.personId, 'gone', base.sessionId);
			return { kind: 'ended', reason: 'gone' };
		}
	}
	} finally {
		release();
	}
}

/** What an AI reads of its person's sessions on the project ("Read my other AIs", criterion 4536271d): its own marked you. */
export function sessionsForAi(draft: ProjectEvolutionDraft, projectId: string, personId: string, sessionId: string) {
	return openSessionsReading(draft, projectId, personId).map(({ presence, ...session }) => ({
		...session,
		you: session.id === sessionId,
		doing: presence
			? { status: presence.status, thinkingAbout: presence.thinkingAbout, saying: presence.saying, step: presence.step, at: presence.at }
			: null
	}));
}

/** One AI asks another of the person's AIs a question ("Ask another AI of mine"): it waits in the other's wait like a click. */
export async function askOnProject(services: AppServices, projectId: string, personId: string, input: { readonly from: string; readonly to: string; readonly question: string }) {
	const now = services.clock.nowIso();
	return changeDraft(services, projectId, (draft) => {
		const outcome = askAnotherAi(draft, personId, input, crypto.randomUUID(), now);
		return { draft: outcome.ok ? outcome.draft : null, result: outcome };
	});
}

/** What the asking call answers: the other AI's answer, or that none came. */
export type PeerAnswer =
	| { readonly kind: 'answer'; readonly questionId: string; readonly answer: string; readonly from: { readonly sessionId: string; readonly name: string }; readonly waitedSeconds: number }
	| {
			readonly kind: 'no_answer';
			readonly questionId: string;
			readonly from: { readonly sessionId: string; readonly name: string };
			readonly message: string;
			readonly waitedSeconds: number;
	  };

/**
 * Hold the asking call until the other AI answers, or until peerAnswerSeconds
 * passed or the other session ended ("Another AI answers my question", "My
 * question runs out"): an answer is a write on the project, so every change of
 * it is a reason to look again. A question that runs out leaves the other AI's
 * queue; one whose asker hung up runs out at once.
 */
export async function awaitPeerAnswer(
	services: AppServices,
	input: { readonly projectId: string; readonly personId: string; readonly questionId: string; readonly to: string; readonly waitSeconds: number },
	hooks: { readonly aborted: () => boolean; readonly onAbort: (listener: () => void) => void }
): Promise<PeerAnswer> {
	const limit = Math.max(1, Math.min(input.waitSeconds, LIVE_SESSION.peerAnswerSeconds));
	const started = Date.now();
	const waited = () => Math.round((Date.now() - started) / 1000);
	const nameOf = (draft: ProjectEvolutionDraft) => {
		const to = lastProjectSessionOf(draft, input.personId, input.to);
		return { sessionId: input.to, name: to ? sessionName(draft, input.personId, to) : 'your other AI' };
	};
	const runOut = async (): Promise<PeerAnswer> => {
		const from = await changeDraft(services, input.projectId, (draft) => {
			const expired = expireQuestion(draft, input.questionId);
			return { draft: expired === draft ? null : expired, result: nameOf(draft) };
		});
		const named = from ?? { sessionId: input.to, name: 'your other AI' };
		return { kind: 'no_answer', questionId: input.questionId, from: named, message: `No answer from ${named.name} within ${LIVE_SESSION.peerAnswerSeconds} s`, waitedSeconds: waited() };
	};
	for (;;) {
		const draft = await services.loadEvolutionDraft.execute(input.projectId);
		const standing = questionStanding(draft, input.personId, input.questionId, services.clock.nowIso());
		if (standing.state === 'answered') return { kind: 'answer', questionId: input.questionId, answer: standing.answer, from: nameOf(draft), waitedSeconds: waited() };
		if (standing.state === 'expired') return runOut();
		const left = limit * 1000 - (Date.now() - started);
		if (left <= 0) return runOut();
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
		if (woke === 'abort' || hooks.aborted()) return runOut();
	}
}
