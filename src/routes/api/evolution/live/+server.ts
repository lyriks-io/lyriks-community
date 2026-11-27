import type { AppServices } from '$composition/container.server';
import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { guardSectionWrite } from '$lib/server/section-save.server';
import { resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import { awaitNextClick, presenceOf, PROJECT_SESSION_KEY, sayCancelled, sayDoing, sayEnded } from '$lib/server/evolution-live.server';
import {
	askOnProject,
	awaitPeerAnswer,
	awaitProjectEvent,
	closeProjectSession,
	openProjectSession,
	projectSessionReading,
	sendClickOnProject,
	sessionsForAi,
	settleProjectSession,
	withdrawClickOnProject
} from '$lib/server/ai-session.server';
import { needsYouOf, tellPerson } from '$lib/server/ai-conversations.server';
import { awaitWake, wakerReading } from '$lib/server/ai-waker.server';
import {
	aiMayAct,
	findRequestByRef,
	lastSessionOf,
	isProjectClickKind,
	lastProjectSessionOf,
	LIVE_SESSION,
	NO_SESSION_FOR_AI,
	QUESTION_REFUSALS,
	openProjectSessionOf,
	openSessionOf,
	requestPagePath,
	sessionCallTarget,
	subjectHolder,
	unresolvedRequestReason,
	type Actor,
	type EvolutionRequest
} from '$domain/evolution';
import type { RequestHandler } from './$types';

/**
 * A live session with the person's own AI (feat-evo-live-session).
 *
 *   GET  /api/evolution/live?projectId=&requestId=
 *        -> the reader's session on the request and what their AI is doing now.
 *   GET  /api/evolution/live?projectId=
 *        -> the reader's session on the whole project (feat-ai-session), what
 *           their AI is doing now and their clicks made outside a request.
 *   POST /api/evolution/live { projectId, act, ... }  (no requestId: the project session)
 *        act start (AI) { client? }   opens this AI's session beside the person's other AIs (EVO-015)
 *        act await | say | end, as below, on the whole project, each naming its session;
 *        act sessions (AI) { sessionId }               the person's open sessions, this one marked you
 *        act ask (AI) { sessionId, to, question, waitSeconds? }
 *                                   asks another AI of the person, held until its answer
 *                                   or peerAnswerSeconds, like a wait
 *        act tell (AI) { sessionId, about question | stopped, text, href?, title? }
 *                                   asks the person on their pages, or says why it stopped:
 *                                   a conversation of their Ask my AI opens with it (action cf381e92)
 *        act wake_wait (the person's waker) { waitSeconds? }
 *                                   held until a click of the person waits and none of their AIs
 *                                   is in session, then answers kind wake; kind nothing when the
 *                                   turn ran out (actions 77cdb263, ccca0911)
 *        act click (person) { kind reread | run | resume, page, anchor, title, ... } (a question goes through Ask my AI;
 *        run and resume hand a Reverse-Specification launched or paused on Mismatch to the AI, EVO-014)
 *        act withdraw (person) { clickId }
 *   POST /api/evolution/live { projectId, requestId, act, ... }
 *        act start  (AI)            opens the session from the prompt
 *        act await  (AI) { sessionId, waitSeconds? }
 *                                   holds until the person's next click; a byte is
 *                                   written at once and a space every 15 s, so a
 *                                   proxy keeps it open and a hang-up is seen at once
 *        act say    (AI) { sessionId, text }           its next step, one sentence beside its state
 *        act cancel (person) { clickId? }              cancels the request the AI is on and
 *                                                      undoes what it wrote for it
 *        act end    (person or AI) { sessionId? }      ends the session
 *
 * The session and the clicks are on the request; what an AI does now reaches
 * only the pages of the person whose session it is, and their other AIs
 * (criterion ea1709d0).
 */

/** How often the waiting call writes a space; well under every proxy's idle timeout. */
const KEEP_ALIVE_MS = 15_000;
const SAY_MAX = 200;
const NO_PROJECT_SESSION = 'No session is open on this project: open one with start_evolution_session given the project alone.';
/** What the waker's held call answers in place of a session id. */
const WAKER_SESSION_ID = 'waker';
const WAKER_ONLY = "Only the waking command of the person's AI listens for wakes.";

type Body = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

async function requestOf(services: AppServices, projectId: string, ref: string): Promise<EvolutionRequest> {
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const lookup = findRequestByRef(draft.requests.filter((r) => r.status !== 'deleted'), ref);
	if (lookup.kind !== 'found') error(lookup.kind === 'ambiguous' ? 400 : 404, unresolvedRequestReason(ref, lookup));
	return lookup.request;
}

function aiOnly(actor: Actor): void {
	if (actor.kind !== 'ai_client') error(403, 'Only the AI client of the session does this; the page ends a session with act end.');
}

/** The AI's open session, the one it names; refused with the sentence the spec wrote otherwise. */
function sessionOf(request: EvolutionRequest, actor: Actor, sessionId: string) {
	const open = openSessionOf(request, actor.id);
	if (!open || (sessionId && open.id !== sessionId)) error(409, NO_SESSION_FOR_AI);
	return open;
}

/** The clicks a page sends outside a request: a re-reading of the code, a run handed from Mismatch (EVO-014). */
const CLICKED_FROM_A_PAGE: ReadonlySet<string> = new Set(['reread', 'run', 'resume']);

/** The page the AI's question or stop bears on, when it names one of this application: never an address elsewhere. */
function tellContext(body: Body): { readonly title: string; readonly href: string } | null {
	const href = str(body.href);
	if (!href.startsWith('/') || href.startsWith('//')) return null;
	return { title: str(body.title).slice(0, 200), href: href.slice(0, 500) };
}

/** Between the person's cancellation and its next call, the AI says nothing more on the page (ac-evo-live-cancel). */
function notCancelled(request: EvolutionRequest, actor: Actor): void {
	const mayAct = aiMayAct(request, actor.id);
	if (!mayAct.ok) error(409, mayAct.reason);
}

export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	const ref = event.url.searchParams.get('requestId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	const actor = await resolveEvolutionActor(services, event, projectId);
	// A session its AI left never reads in session: it ends here when it is over (ac-ai-session-end).
	await settleProjectSession(services, projectId, actor.id);
	const draft = await services.loadEvolutionDraft.execute(projectId);
	// What waits on the reader in Ask my AI rides with the session reading, so the foot of the navigation says it (criterion 31488628).
	// Whether the reader's waker listens and where their last wake stands rides along too (criterion 7cfc6440).
	if (!ref)
		return json({
			...projectSessionReading(draft, projectId, actor.id),
			needsYou: await needsYouOf(services, projectId, actor.id),
			waker: wakerReading(draft, projectId, actor.id, Date.parse(services.clock.nowIso()))
		});
	// The session of the whole project stays on Community; a request's session is an Evolution operation.
	requireEvolutionAccess(services);
	const request = await requestOf(services, projectId, ref);
	const last = lastSessionOf(request, actor.id);
	// The session that holds the request, else the newest: a session of the whole project covers the request even before it reached it (ac-ai-session-project).
	const holder = subjectHolder(draft, actor.id, { kind: 'request', requestId: request.id });
	const project = openProjectSessionOf(draft, actor.id, holder ?? undefined);
	if (project && last?.id !== project.id) {
		const now = presenceOf(projectId, PROJECT_SESSION_KEY, actor.id, project.id);
		return json({
			session: { id: project.id, open: true, startedAt: project.startedAt, endReason: null },
			// What the AI does elsewhere in the project is not said on this request: here it reads in session.
			presence: now && now.sessionId === project.id ? { ...now, thinkingAbout: null, saying: null, step: null, status: now.status === 'gone' || now.status === 'ended' ? now.status : 'listening' } : null
		});
	}
	const now = presenceOf(projectId, request.id, actor.id);
	return json({
		session: last ? { id: last.id, open: !last.endedAt, startedAt: last.startedAt, endReason: last.endReason ?? null } : null,
		presence: now && last && now.sessionId === last.id ? now : null
	});
};

/** Hold a waiting call open: a byte at once, a space every 15 s, the answer as one JSON value; a hang-up is seen at once. */
function holdOpen(event: { request: Request }, sessionId: string, wait: (hooks: { aborted: () => boolean; onAbort: (listener: () => void) => void }) => Promise<object>): Response {
	let hungUp = false;
	const listeners: (() => void)[] = [];
	const hangUp = () => {
		if (hungUp) return;
		hungUp = true;
		for (const listener of listeners.splice(0)) listener();
	};
	event.request.signal?.addEventListener('abort', hangUp);
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(' '));
			const keepAlive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(' '));
				} catch {
					hangUp();
				}
			}, KEEP_ALIVE_MS);
			void wait({ aborted: () => hungUp, onAbort: (listener) => (hungUp ? listener() : listeners.push(listener)) })
				.then((answer) => {
					clearInterval(keepAlive);
					if (hungUp) return;
					controller.enqueue(encoder.encode(JSON.stringify({ ok: true, sessionId, ...answer })));
					controller.close();
				})
				.catch((e) => {
					clearInterval(keepAlive);
					if (hungUp) return;
					controller.enqueue(encoder.encode(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : String(e) })));
					controller.close();
				});
		},
		cancel() {
			hangUp();
		}
	});
	return new Response(stream, { headers: { 'content-type': 'application/json', 'cache-control': 'no-cache, no-transform' } });
}

/**
 * The sessions of the whole project (feat-ai-session), one per AI of the person
 * (EVO-015): the acts of Ask my AI, of each AI, and the clicks made outside a
 * request. Opening one on a request starts it there, and every later call
 * naming that request with that session's id is that session's.
 */
async function projectAct(
	event: Parameters<RequestHandler>[0],
	projectId: string,
	act: string,
	body: Body,
	startsOn: { readonly id: string; readonly href: string } | null = null
): Promise<Response> {
	const services = event.locals.services;
	const actor = await resolveEvolutionActor(services, event, projectId);
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const askedId = str(body.sessionId);
	// The session the call names, or the newest when it names none (a page, an older client).
	const open = openProjectSessionOf(draft, actor.id, askedId || undefined);
	const mine = () => {
		if (!open) error(409, NO_PROJECT_SESSION);
		return open;
	};
	switch (act) {
		case 'start': {
			aiOnly(actor);
			const opened = await openProjectSession(services, projectId, actor.id, { client: str(body.client), ...(startsOn ? { startsOn: startsOn.id } : {}) });
			return json({
				ok: true,
				session: { id: opened.session.id, projectId, startedAt: opened.session.startedAt, name: opened.session.client || 'Your AI', ...(startsOn ? { requestId: startsOn.id } : {}) },
				waitingClicks: opened.waiting,
				// The person's other AIs stay in session beside this one (criterion 88cb2ef1).
				others: opened.others.map((o) => ({ id: o.id, name: o.name, startedAt: o.startedAt })),
				...(startsOn ? { href: startsOn.href, startsOn: startsOn.id } : {}),
				covers: 'every page of the project: the Specification 360°, the Reverse-Specification, the Evolution board and every request',
				limits: LIVE_SESSION,
				// Whether the person's waker listens, so the AI offers one only when none does (criterion ab716003).
				waker: { status: wakerReading(draft, projectId, actor.id, Date.parse(services.clock.nowIso())).status }
			});
		}
		case 'end': {
			const ended = await closeProjectSession(services, projectId, actor.id, 'ended_by_person', askedId || undefined);
			if (!ended) error(409, 'There is no session to end.');
			return json({ ok: true, ended: { sessionId: ended.id, reason: 'ended_by_person' } });
		}
		case 'await': {
			aiOnly(actor);
			// A wait after the end answers the end and its reason, never "no session open": the AI stops instead of opening another (criterion 45933ee4).
			if (!open) {
				const last = lastProjectSessionOf(draft, actor.id, askedId || undefined);
				if (!last) mine();
				return json({ ok: true, kind: 'ended', sessionId: last!.id, reason: last!.endReason ?? 'ended_by_person' });
			}
			const session = mine();
			const asked = Number(body.waitSeconds);
			const waitSeconds = Number.isFinite(asked) && asked > 0 ? asked : LIVE_SESSION.platformWaitSeconds;
			return holdOpen(event, session.id, (hooks) => awaitProjectEvent(services, { projectId, personId: actor.id, sessionId: session.id, waitSeconds }, hooks));
		}
		case 'say': {
			aiOnly(actor);
			const session = mine();
			const text = str(body.text).trim();
			if (!text) error(400, 'text is required: one sentence on what you are doing.');
			sayDoing(services, { projectId, requestId: PROJECT_SESSION_KEY, personId: actor.id, sessionId: session.id }, text.slice(0, SAY_MAX));
			return json({ ok: true });
		}
		case 'sessions': {
			// An AI reads its person's other AIs through its own session (rules 05d25986, 2584acc0).
			aiOnly(actor);
			const session = mine();
			return json({ ok: true, sessions: sessionsForAi(draft, projectId, actor.id, session.id) });
		}
		case 'ask': {
			// Only an AI asks another AI, through its own open session (rules a46a070a, 5215082c).
			aiOnly(actor);
			const from = mine();
			const asked = await askOnProject(services, projectId, actor.id, { from: from.id, to: str(body.to), question: str(body.question) });
			if (!asked) error(409, 'The question could not be saved: try again.');
			if (!asked.ok) {
				const status = asked.reason === QUESTION_REFUSALS.notOpen ? 404 : asked.reason === QUESTION_REFUSALS.noSession ? 409 : 400;
				return json({ ok: false, reason: asked.reason }, { status });
			}
			const waitAsked = Number(body.waitSeconds);
			const waitSeconds = Number.isFinite(waitAsked) && waitAsked > 0 ? waitAsked : LIVE_SESSION.peerAnswerSeconds;
			const question = asked.click;
			return holdOpen(event, from.id, (hooks) =>
				awaitPeerAnswer(services, { projectId, personId: actor.id, questionId: question.id, to: question.toSessionId ?? '', waitSeconds }, hooks)
			);
		}
		case 'tell': {
			// The person answers on their pages only an AI that can hear the answer (rules b0fb4174, d81f19db).
			aiOnly(actor);
			const session = mine();
			const about = body.about === 'question' || body.about === 'stopped' ? body.about : null;
			if (!about) error(400, 'about is question (one question you wait on) or stopped (why you stop).');
			const text = str(body.text).trim();
			if (!text) error(400, 'text is required: the question, or why you stop, in a sentence or two.');
			const told = await tellPerson(services, projectId, actor.id, { text, about, context: tellContext(body) }, event.request.headers.get('x-lyriks-client'));
			if (!told.ok) return json({ ok: false, reason: told.reason }, { status: told.status });
			const said = `${about === 'question' ? 'Asks you' : 'Stopped'}: ${text}`;
			sayDoing(services, { projectId, requestId: PROJECT_SESSION_KEY, personId: actor.id, sessionId: session.id }, said.slice(0, SAY_MAX));
			return json({ ok: true, conversationId: told.conversationId, href: `/projects/${encodeURIComponent(projectId)}/ask?c=${encodeURIComponent(told.conversationId)}` });
		}
		case 'wake_wait': {
			// A wake starts a program on the person's machine: only their waker, signed in as their AI, listens (rule 616c5fc3).
			if (actor.kind !== 'ai_client') error(403, WAKER_ONLY);
			const asked = Number(body.waitSeconds);
			const waitSeconds = Number.isFinite(asked) && asked > 0 ? asked : LIVE_SESSION.platformWaitSeconds;
			return holdOpen(event, WAKER_SESSION_ID, (hooks) => awaitWake(services, { projectId, personId: actor.id, waitSeconds }, hooks));
		}
		case 'click': {
			if (actor.kind !== 'person') error(403, 'Only the person clicks on the page.');
			// A question to the AI is a message of Ask my AI, sent through its own page (criterion f7249f99).
			if (!isProjectClickKind(body.kind) || !CLICKED_FROM_A_PAGE.has(body.kind)) error(400, 'kind is reread, run or resume: a question to your AI goes through Ask my AI (/projects/:projectId/ask).');
			const canEdit = await requireProjectAccess(event, projectId, 'write').then(
				() => true,
				() => false
			);
			const sent = await sendClickOnProject(
				services,
				projectId,
				actor.id,
				{
					kind: body.kind,
					page: body.page === 'retrospec' || body.page === 'drift' ? body.page : 'spec',
					anchor: str(body.anchor),
					title: str(body.title),
					...(str(body.threadId) ? { threadId: str(body.threadId) } : {}),
					...(str(body.messageId) ? { messageId: str(body.messageId) } : {}),
					...(str(body.text) ? { text: str(body.text) } : {}),
					...(str(body.featureId) ? { featureId: str(body.featureId) } : {})
				},
				canEdit
			);
			if (!sent) error(409, 'The click could not be saved: try again.');
			if (!sent.ok) return json({ ok: false, reason: sent.reason }, { status: 422 });
			return json({ ok: true, click: sent.click, inSession: !!open });
		}
		case 'withdraw': {
			if (actor.kind !== 'person') error(403, 'Only the person withdraws their click.');
			const outcome = await withdrawClickOnProject(services, projectId, actor.id, str(body.clickId));
			if (!outcome?.ok) return json({ ok: false, reason: outcome?.reason ?? 'Nothing waits for your AI.' }, { status: 422 });
			return json({ ok: true });
		}
		default:
			error(400, 'act must be start, await, say, tell, end, sessions, ask, click, withdraw or wake_wait');
	}
}

export const POST: RequestHandler = async (event) => {
	const body = ((await event.request.json().catch(() => null)) ?? {}) as Body;
	const projectId = str(body.projectId);
	const ref = str(body.requestId);
	const act = str(body.act);
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, `Project "${projectId}" does not exist.`);
	if (!ref) return projectAct(event, projectId, act, body);
	requireEvolutionAccess(services);
	const actor = await resolveEvolutionActor(services, event, projectId);
	const request = await requestOf(services, projectId, ref);
	const base = { projectId, requestId: request.id, personId: actor.id };
	// One session per person and project: a session opened on a request is the project's, started there.
	if (act === 'start') return projectAct(event, projectId, act, body, { id: request.id, href: requestPagePath(projectId, request.id) });
	// Reading the other AIs, asking one of them and speaking to the person are acts of the session of the project, wherever its AI is.
	if (act === 'sessions' || act === 'ask' || act === 'tell') return projectAct(event, projectId, act, body);
	if (act === 'await' || act === 'say' || act === 'end') {
		const draft = await services.loadEvolutionDraft.execute(projectId);
		const named = str(body.sessionId) || undefined;
		const project = act === 'end' ? lastProjectSessionOf(draft, actor.id, named) : openProjectSessionOf(draft, actor.id, named);
		const facts = { projectSessionId: project?.id ?? null, requestHasOwnSession: !!openSessionOf(request, actor.id), askedSessionId: str(body.sessionId) };
		if (sessionCallTarget(act, facts) === 'project') return projectAct(event, projectId, act, body);
	}

	switch (act) {
		// A session a request opened before the one session per project (ac-ai-session-project) still ends on the request.
		case 'end': {
			const op = { op: 'end_session', requestId: request.id, sessionId: str(body.sessionId) || undefined };
			const outcome = await guardSectionWrite('evolution', () =>
				applyEvolutionOperations(services, { projectId, operations: [op], actor, origin: event.request.headers.get('x-lyriks-client') })
			);
			if (!outcome.ok) return json({ ok: false, results: outcome.results }, { status: outcome.status });
			const ended = lastSessionOf(await requestOf(services, projectId, request.id), actor.id)!;
			sayEnded(services, { ...base, sessionId: ended.id }, 'ended_by_person');
			return json({ ok: true, ended: { sessionId: ended.id, reason: 'ended_by_person' } });
		}
		case 'await': {
			aiOnly(actor);
			const session = sessionOf(request, actor, str(body.sessionId));
			const asked = Number(body.waitSeconds);
			const waitSeconds = Number.isFinite(asked) && asked > 0 ? asked : LIVE_SESSION.platformWaitSeconds;
			let hungUp = false;
			const listeners: (() => void)[] = [];
			const hangUp = () => {
				if (hungUp) return;
				hungUp = true;
				for (const listener of listeners.splice(0)) listener();
			};
			event.request.signal?.addEventListener('abort', hangUp);
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					// JSON allows leading whitespace: the spaces keep the call alive and the answer stays one JSON value.
					controller.enqueue(encoder.encode(' '));
					const keepAlive = setInterval(() => {
						try {
							controller.enqueue(encoder.encode(' '));
						} catch {
							hangUp();
						}
					}, KEEP_ALIVE_MS);
					void awaitNextClick(
						services,
						{ ...base, sessionId: session.id, waitSeconds },
						{ aborted: () => hungUp, onAbort: (listener) => (hungUp ? listener() : listeners.push(listener)) }
					)
						.then((answer) => {
							clearInterval(keepAlive);
							if (hungUp) return;
							controller.enqueue(encoder.encode(JSON.stringify({ ok: true, sessionId: session.id, ...answer })));
							controller.close();
						})
						.catch((e) => {
							clearInterval(keepAlive);
							if (hungUp) return;
							controller.enqueue(encoder.encode(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : String(e) })));
							controller.close();
						});
				},
				cancel() {
					hangUp();
				}
			});
			return new Response(stream, { headers: { 'content-type': 'application/json', 'cache-control': 'no-cache, no-transform' } });
		}
		case 'cancel': {
			if (actor.kind !== 'person') error(403, 'Only the person whose AI took the click cancels it.');
			const session = openSessionOf(request, actor.id);
			if (!session) error(409, 'Your AI is on no request of yours right now.');
			const outcome = await guardSectionWrite('evolution', () =>
				applyEvolutionOperations(services, {
					projectId,
					operations: [{ op: 'cancel_click', requestId: request.id, ...(str(body.clickId) ? { clickId: str(body.clickId) } : {}) }],
					actor,
					origin: event.request.headers.get('x-lyriks-client')
				})
			);
			if (!outcome.ok) return json({ ok: false, results: outcome.results }, { status: outcome.status });
			sayCancelled(services, { ...base, sessionId: session.id });
			return json({ ok: true, summary: outcome.results[0]?.summary ?? 'Cancelled' });
		}
		case 'say': {
			aiOnly(actor);
			const session = sessionOf(request, actor, str(body.sessionId));
			notCancelled(request, actor);
			const text = str(body.text).trim();
			if (!text) error(400, 'text is required: one sentence on what you are doing.');
			sayDoing(services, { ...base, sessionId: session.id }, text.slice(0, SAY_MAX));
			return json({ ok: true });
		}
		default:
			error(400, 'act must be start, await, say, cancel or end');
	}
};
