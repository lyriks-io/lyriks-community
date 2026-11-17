import { aiActsOf, aiWorkedAt } from './ai-work.server';
import { readRetrospecStanding } from './retrospec-status.server';
import { retrospecFinishedAt } from '$domain/retrospec';
import type { AppServices } from '$composition/container.server';
import {
	advanceStepPrefill,
	closeProjectTurn,
	closeTurn,
	endProjectSession,
	handToWaitingCall,
	isProjectIdle,
	projectSessionEnding,
	lastProjectSessionOf,
	LIVE_SESSION,
	nextClickOf,
	openProjectSessionOf,
	openSessionOf,
	pendingProjectClicksOf,
	requestPagePath,
	sendProjectClick,
	sessionWorkDone,
	startProjectSession,
	takeProjectClick,
	withdrawProjectClick,
	withMirror,
	type AiClick,
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
import { subscribeSectionChanges } from './sync-bus.server';
import {
	contextOf,
	ensureWatching,
	noticeOf,
	onProjectSessionGone,
	presenceOf,
	PROJECT_SESSION_KEY,
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
 * The session of the person's own AI on the whole project (feat-ai-session):
 * opened from the prompt Ask my AI copies (or by the AI itself in a
 * bound repository), it hands the AI the person's clicks
 * from every page of the project, in the order they were made. A click on a
 * request is handed through that request's own session logic, the request
 * getting a session of the same id (withMirror); a question on a block of the
 * Specification 360° and a re-reading of the code are clicks of the project.
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
 * The calls of each person's AI held on this server right now, and when the
 * last one ended (ac-ai-session-end): what tells an AI that waits from one whose
 * conversation was closed between two waits. Per node, like presence; a server
 * that restarts counts from its own start.
 */
const SERVER_STARTED_MS = Date.now();
const heldCalls = new Map<string, { calls: number; lastMs: number }>();
const callKey = (projectId: string, personId: string) => `${projectId}::${personId.trim().toLowerCase()}`;
function holdCall(projectId: string, personId: string): () => void {
	const key = callKey(projectId, personId);
	const now = heldCalls.get(key) ?? { calls: 0, lastMs: Date.now() };
	heldCalls.set(key, { calls: now.calls + 1, lastMs: Date.now() });
	return () => {
		const held = heldCalls.get(key);
		if (held) heldCalls.set(key, { calls: Math.max(0, held.calls - 1), lastMs: Date.now() });
	};
}

/**
 * Ends the person's open session when Ask my AI reads it and it is over
 * ("Mark the AI gone", "End an idle session"): nobody did anything for half an
 * hour, or no call of its AI was held nor heard for disconnectAfterSeconds.
 * Without it a session its conversation left read 'listening' forever.
 */
export async function settleProjectSession(services: AppServices, projectId: string, personId: string): Promise<void> {
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const open = openProjectSessionOf(draft, personId);
	if (!open) return;
	const now = services.clock.nowIso();
	const signal = presenceOf(projectId, PROJECT_SESSION_KEY, personId);
	const heard = signal && signal.sessionId === open.id ? signal : null;
	const held = heldCalls.get(callKey(projectId, personId));
	// Every act of its AI on the project counts, its writes and reads included, not only the calls of the session (criterion 122ab5c8).
	const worked = aiWorkedAt(projectId, personId);
	const reason = projectSessionEnding({
		idle: isProjectIdle(draft, personId, now, aiActsOf(projectId, personId)),
		callHeld: (held?.calls ?? 0) > 0,
		working: heard?.status === 'thinking' || heard?.status === 'writing' || heard?.status === 'cancelled',
		quietSinceMs: Math.max(Date.parse(open.startedAt), SERVER_STARTED_MS, held?.lastMs ?? 0, heard ? Date.parse(heard.at) : 0, worked ? Date.parse(worked) : 0),
		nowMs: Date.parse(now)
	});
	if (reason) await closeProjectSession(services, projectId, personId, reason, open.id);
}

/** The person's session on the project and what their AI is doing now, as Ask my AI reads it (criterion 4cb97f74). */
export function projectSessionReading(draft: ProjectEvolutionDraft, projectId: string, personId: string) {
	const last = lastProjectSessionOf(draft, personId);
	const now = presenceOf(projectId, PROJECT_SESSION_KEY, personId);
	return {
		session: last ? { id: last.id, open: !last.endedAt, startedAt: last.startedAt, endedAt: last.endedAt ?? null, endReason: last.endReason ?? null } : null,
		presence: now && last && now.sessionId === last.id ? now : null,
		clicks: (draft.clicks ?? []).filter((c) => c.personId.trim().toLowerCase() === personId.trim().toLowerCase())
	};
}

/** The AI opens the person's session on the project ("Open the session on the project"). */
export async function openProjectSession(services: AppServices, projectId: string, personId: string) {
	const now = services.clock.nowIso();
	const opened = await changeDraft(services, projectId, (draft) => {
		const outcome = startProjectSession(draft, personId, crypto.randomUUID(), now);
		if (!outcome.ok) return { draft: null, result: null };
		const waiting = pendingProjectClicksOf(outcome.draft, personId).length + outcome.draft.requests.reduce((n, r) => n + (r.aiClicks ?? []).filter((c) => c.personId === personId && c.state === 'waiting').length, 0);
		return { draft: outcome.draft, result: { session: outcome.session, waiting } };
	});
	if (!opened) throw new Error('The session could not be saved: try again.');
	sayOpened(services, onProject({ projectId, personId, sessionId: opened.session.id }));
	return opened;
}

/** The person ends their session from the box of Ask my AI, or it ends idle or gone ("End the session"). */
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
		'Add place { anchor, title }: the block of Knowledge your answer bears on most (feature:<featureId>, action:<featureId>:<actionId>, rule:<featureId>:<ruleId>, term:<id>, overview:what...), so the person can publish it there for the others to decide.',
		'Never write the specification from this answer. When the person asks for a change, prepare it as proposal { featureId, summary (what it changes, in their words), operations (the apply_behavior_batch vocabulary, against the feature as it is now: read it first) }. Lyriks runs it as a dry run and refuses your answer with what does not land: correct it and answer again until it lands. The person validates it on the page, which writes it; a message of Lyriks in the conversation tells you when it no longer lands.'
	].join(' ');

async function projectClickContext(services: AppServices, projectId: string, click: ProjectClick): Promise<ProjectClickContext> {
	const href = click.page === 'spec' ? `/projects/${projectId}/spec/${placeOfAnchor(click.anchor)}` : `/projects/${projectId}/retrospec`;
	const answer = (sentence: string) => `apply_evolution_batch [{ op: "answer_click", clickId: "${click.id}", text }] (no requestId): ${sentence}`;
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
async function look(services: AppServices, base: Base, first: boolean): Promise<Step> {
	const now = services.clock.nowIso();
	const { personId, sessionId } = base;
	// Read before the change: a finished Reverse-Specification lets the session end once its AI's work is done (criterion 45933ee4).
	const finishedAt = await readRetrospecStanding(services, base.projectId)
		.then(({ status, doc }) => retrospecFinishedAt(status, doc))
		.catch(() => null);
	const step = await changeDraft<Step>(services, base.projectId, (stored) => {
		const open = openProjectSessionOf(stored, personId);
		if (!open || open.id !== sessionId) {
			const last = lastProjectSessionOf(stored, personId);
			return { draft: null, result: { kind: 'ended', reason: last?.id === sessionId ? (last.endReason ?? 'ended_by_person') : 'replaced' } };
		}
		let draft = stored;
		let cancelled: AiClick | null = null;
		if (first) {
			draft = closeProjectTurn(draft, personId, now);
			draft = {
				...draft,
				requests: draft.requests.map((r) => {
					if (openSessionOf(r, personId)?.id !== sessionId) return r;
					const turn = closeTurn(r, personId, now);
					cancelled ??= turn?.cancelled ?? null;
					return turn?.request ?? r;
				})
			};
		}
		if (isProjectIdle(draft, personId, now, aiActsOf(base.projectId, personId))) {
			const idle = endProjectSession(draft, personId, 'idle', now, sessionId);
			return { draft: idle.ok ? idle.draft : draft, result: { kind: 'ended', reason: 'idle' } };
		}
		// A step prefill of a request the session reached moves on once its section is settled.
		draft = { ...draft, requests: draft.requests.map((r) => (openSessionOf(r, personId)?.id === sessionId ? advanceStepPrefill(r, personId, now, () => crypto.randomUUID()) : r)) };
		const next = nextClickOf(draft, personId);
		if (next?.where === 'project') {
			const taken = takeProjectClick(draft, next.click.id, now);
			if (taken) return { draft: taken.draft, result: { kind: 'project-click', click: taken.click, cancelled } };
		}
		if (next?.where === 'request') {
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
	const release = holdCall(input.projectId, input.personId);
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
			say(services, onProject(base), 'thinking', { thinkingAbout:
					step.click.kind === 'chat'
						? `your message in ${step.click.title}`
						: step.click.kind === 'ask_block'
							? `your question on ${step.click.title}`
							: `re-reading the code of ${step.click.title}`, saying: null, step: null });
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
		if (left <= 0) return { ...notice, kind: 'nothing', waitedSeconds: Math.round((Date.now() - started) / 1000) };
		say(services, onProject(base), 'listening', { thinkingAbout: null });
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
