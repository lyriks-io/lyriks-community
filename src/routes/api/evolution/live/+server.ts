import type { AppServices } from '$composition/container.server';
import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { guardSectionWrite } from '$lib/server/section-save.server';
import { resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import { awaitNextClick, presenceOf, PROJECT_SESSION_KEY, sayCancelled, sayDoing, sayEnded } from '$lib/server/evolution-live.server';
import { awaitProjectEvent, closeProjectSession, openProjectSession, projectSessionReading, sendClickOnProject, settleProjectSession, withdrawClickOnProject } from '$lib/server/ai-session.server';
import {
	aiMayAct,
	findRequestByRef,
	lastSessionOf,
	isProjectClickKind,
	lastProjectSessionOf,
	LIVE_SESSION,
	NO_SESSION_FOR_AI,
	openProjectSessionOf,
	openSessionOf,
	requestPagePath,
	sessionCallTarget,
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
 *        act start | await | say | end, as below, on the whole project;
 *        act click (person) { kind reread, page, anchor, title, ... } (a question goes through Ask my AI)
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
 * The session and the clicks are on the request; what the AI does now reaches
 * only the pages of the person whose session it is (ac-evo-live-one-agent).
 */

/** How often the waiting call writes a space; well under every proxy's idle timeout. */
const KEEP_ALIVE_MS = 15_000;
const SAY_MAX = 200;

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
	const actor = await resolveEvolutionActor(services, event);
	// A session its AI left never reads in session: it ends here when it is over (ac-ai-session-end).
	await settleProjectSession(services, projectId, actor.id);
	const draft = await services.loadEvolutionDraft.execute(projectId);
	if (!ref) return json(projectSessionReading(draft, projectId, actor.id));
	// The session of the whole project stays on Community; a request's session is an Evolution operation.
	requireEvolutionAccess(services);
	const request = await requestOf(services, projectId, ref);
	const last = lastSessionOf(request, actor.id);
	const project = openProjectSessionOf(draft, actor.id);
	// The session of the whole project covers the request even before it reached it (ac-ai-session-project).
	if (project && last?.id !== project.id) {
		const now = presenceOf(projectId, PROJECT_SESSION_KEY, actor.id);
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

/** The session of the whole project (feat-ai-session): the acts of the band, of its AI, and the clicks made outside a request. */
/**
 * The person's one session on the project (ac-ai-session-project): opening it
 * on a request starts it there, and every later call naming that request with
 * the project session's id is the project session's.
 */
async function projectAct(
	event: Parameters<RequestHandler>[0],
	projectId: string,
	act: string,
	body: Body,
	startsOn: { readonly id: string; readonly href: string } | null = null
): Promise<Response> {
	const services = event.locals.services;
	const actor = await resolveEvolutionActor(services, event);
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const open = openProjectSessionOf(draft, actor.id);
	const mine = (sessionId: string) => {
		if (!open || (sessionId && open.id !== sessionId)) error(409, 'No session is open on this project: open one with start_evolution_session given the project alone.');
		return open;
	};
	switch (act) {
		case 'start': {
			aiOnly(actor);
			const opened = await openProjectSession(services, projectId, actor.id);
			return json({
				ok: true,
				session: { id: opened.session.id, projectId, startedAt: opened.session.startedAt, ...(startsOn ? { requestId: startsOn.id } : {}) },
				waitingClicks: opened.waiting,
				...(startsOn ? { href: startsOn.href, startsOn: startsOn.id } : {}),
				covers: 'every page of the project: the Specification 360°, the Reverse-Specification, the Evolution board and every request',
				limits: LIVE_SESSION
			});
		}
		case 'end': {
			const ended = await closeProjectSession(services, projectId, actor.id, 'ended_by_person', str(body.sessionId) || undefined);
			if (!ended) error(409, 'There is no session to end.');
			return json({ ok: true, ended: { sessionId: ended.id, reason: 'ended_by_person' } });
		}
		case 'await': {
			aiOnly(actor);
			// A wait after the end answers the end and its reason, never "no session open": the AI stops instead of opening another (criterion 45933ee4).
			const askedId = str(body.sessionId);
			if (!open || (askedId && open.id !== askedId)) {
				const last = lastProjectSessionOf(draft, actor.id);
				if (!askedId && !last) mine(askedId);
				const reason = last && (!askedId || last.id === askedId) ? (last.endReason ?? 'ended_by_person') : 'replaced';
				return json({ ok: true, kind: 'ended', sessionId: askedId || last?.id || '', reason });
			}
			const session = mine(askedId);
			const asked = Number(body.waitSeconds);
			const waitSeconds = Number.isFinite(asked) && asked > 0 ? asked : LIVE_SESSION.platformWaitSeconds;
			return holdOpen(event, session.id, (hooks) => awaitProjectEvent(services, { projectId, personId: actor.id, sessionId: session.id, waitSeconds }, hooks));
		}
		case 'say': {
			aiOnly(actor);
			const session = mine(str(body.sessionId));
			const text = str(body.text).trim();
			if (!text) error(400, 'text is required: one sentence on what you are doing.');
			sayDoing(services, { projectId, requestId: PROJECT_SESSION_KEY, personId: actor.id, sessionId: session.id }, text.slice(0, SAY_MAX));
			return json({ ok: true });
		}
		case 'click': {
			if (actor.kind !== 'person') error(403, 'Only the person clicks on the page.');
			// A question to the AI is a message of Ask my AI, sent through its own page (criterion f7249f99).
			if (!isProjectClickKind(body.kind) || body.kind !== 'reread') error(400, 'kind is reread: a question to your AI goes through Ask my AI (/projects/:projectId/ask).');
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
					page: body.page === 'retrospec' ? 'retrospec' : 'spec',
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
			error(400, 'act must be start, await, say, end, click or withdraw');
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
	const actor = await resolveEvolutionActor(services, event);
	const request = await requestOf(services, projectId, ref);
	const base = { projectId, requestId: request.id, personId: actor.id };
	// One session per person and project: a session opened on a request is the project's, started there.
	if (act === 'start') return projectAct(event, projectId, act, body, { id: request.id, href: requestPagePath(projectId, request.id) });
	if (act === 'await' || act === 'say' || act === 'end') {
		const draft = await services.loadEvolutionDraft.execute(projectId);
		const project = act === 'end' ? lastProjectSessionOf(draft, actor.id) : openProjectSessionOf(draft, actor.id);
		const facts = { projectSessionId: project?.id ?? null, requestHasOwnSession: !!openSessionOf(request, actor.id), askedSessionId: str(body.sessionId) };
		if (sessionCallTarget(act, facts) === 'project') return projectAct(event, projectId, act, body);
	}

	switch (act) {
		// A session a request opened before the one session per project (ac-ai-session-project) still ends on the request.
		case 'end': {
			const op = { op: 'end_session', requestId: request.id, sessionId: str(body.sessionId) || undefined };
			const outcome = await guardSectionWrite('evolution', () =>
				applyEvolutionOperations(services, { projectId, operations: [op], actor, origin: event.request.headers.get('x-lyriks-client'), activeWorkspaceId: event.cookies.get('lyriks_active_ws') })
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
					origin: event.request.headers.get('x-lyriks-client'),
					activeWorkspaceId: event.cookies.get('lyriks_active_ws')
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
