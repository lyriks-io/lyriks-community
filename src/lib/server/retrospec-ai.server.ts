import { json } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { isDraftLeafId } from '$domain/evolution';
import { currentRun, specState, writesHeld } from '$domain/retrospec';
import { VALIDATED_SPEC_REFUSAL } from '$application/spec360/validated-edits';
import type { Handle } from '@sveltejs/kit';
import { PROJECT_ACTIVITY_ID } from '$lib/shared/ai-activity';
import { callerKind } from './caller.server';
import { ensureDetecting } from './retrospec-detected.server';
import { publishAiActivity, subscribeAiActivity } from './sync-bus.server';
import { noteAiWork } from './ai-work.server';
import { BURST_MS, RECONNECT_MS } from '$domain/retrospec';

/**
 * The person's AI at work on a project, followed call by call: every call the
 * MCP makes to the platform names itself (`x-lyriks-actor: ai_client`, see
 * caller.server.ts) and carries the project it is about, in its query, its
 * path or its JSON body. A call that succeeded is published on the AI activity
 * channel as a project-wide activity, so an open retrospecification shows the
 * AI connected and what it is reading or writing, live, on every node.
 *
 * Each node keeps the recent calls of each project it heard of on the bus (a
 * short ring, nothing persisted): enough for a page opened mid-run to tell when
 * the AI was last seen and what it wrote, never a history.
 */

export interface AiCall {
	readonly at: string;
	readonly act: 'read' | 'write';
	readonly section: string | null;
	/** The last write of a burst folded into this one (same section, each within BURST_MS of the previous). */
	readonly until?: string;
}

/**
 * The events kept per project; older ones fall off. Only what the activity log
 * says is kept: the read that opens a visit, and one entry per burst of writes
 * to a section. Keeping every call, reads included, let an AI reading hard push
 * its own writes out of a 400-call ring, and the log erased itself as it ran.
 */
const KEPT = 1000;
/** A JSON body larger than this is not read again to find its project. */
const PEEK_LIMIT_BYTES = 8 * 1024 * 1024;

const calls = new Map<string, AiCall[]>();
/** When the AI last called about each project, any call: what "connected" reads. */
const lastSeen = new Map<string, string>();
let watching = false;

/** One call folded into a project's events: what the log will say, nothing more. */
export function foldAiCall(list: AiCall[], call: AiCall, seenBefore: string | null): void {
	const t = Date.parse(call.at);
	const opensVisit = seenBefore === null || t - Date.parse(seenBefore) > RECONNECT_MS;
	if (call.act === 'read') {
		if (opensVisit) list.push(call);
		return;
	}
	const prev = list[list.length - 1];
	if (!opensVisit && prev?.act === 'write' && prev.section === call.section && t - Date.parse(prev.until ?? prev.at) <= BURST_MS) {
		list[list.length - 1] = { ...prev, until: call.at };
		return;
	}
	list.push(call);
}

function ensureWatching(): void {
	if (watching) return;
	watching = true;
	subscribeAiActivity((activity) => {
		if (activity.requestId !== PROJECT_ACTIVITY_ID) return;
		const at = new Date().toISOString();
		const list = calls.get(activity.projectId) ?? [];
		foldAiCall(list, { at, act: activity.act, section: activity.section ?? null }, lastSeen.get(activity.projectId) ?? null);
		lastSeen.set(activity.projectId, at);
		if (list.length > KEPT) list.splice(0, list.length - KEPT);
		calls.set(activity.projectId, list);
	});
}

/** The AI's recent activity on a project as this node heard it, oldest first. */
export function aiCallsOf(projectId: string): readonly AiCall[] {
	ensureWatching();
	return calls.get(projectId) ?? [];
}

/** When this node last heard the AI call about a project, null when never. */
export function aiLastSeenOf(projectId: string): string | null {
	ensureWatching();
	return lastSeen.get(projectId) ?? null;
}

/** The project a call is about, when its address says so. */
function projectInUrl(url: URL): string | null {
	const fromQuery = url.searchParams.get('projectId');
	if (fromQuery) return fromQuery;
	const match = /^\/api\/projects\/([^/]+)\//.exec(url.pathname);
	return match ? decodeURIComponent(match[1]) : null;
}

/** The section a call reads or writes, in the words of its address. */
function sectionOf(url: URL): string | null {
	const draft = /^\/api\/draft\/([a-z-]+)/.exec(url.pathname);
	if (draft) return draft[1];
	// An index sync is told apart from a behaviour batch: the Build step says the AI synced; a reader of the first segment sees 'behavior' as before.
	if (url.pathname.startsWith('/api/behavior/implementation')) return 'behavior.implementation';
	if (url.pathname.startsWith('/api/behavior/') || url.pathname.startsWith('/api/features/')) return 'behavior';
	if (url.pathname === '/api/sections') return url.searchParams.get('section');
	if (url.pathname.endsWith('/completion')) return 'completion';
	return null;
}

/** A JSON body's `projectId` and `act`, read from a copy so the route still reads the original. */
async function peekBody(request: Request, limit = PEEK_LIMIT_BYTES): Promise<{ projectId: string | null; act: string | null; featureId: string | null }> {
	const none = { projectId: null, act: null, featureId: null };
	if (!(request.headers.get('content-type') ?? '').includes('application/json')) return none;
	const length = Number(request.headers.get('content-length') ?? '0');
	if (length > limit) return none;
	try {
		const body = (await request.clone().json()) as { projectId?: unknown; act?: unknown; featureId?: unknown } | null;
		return {
			projectId: typeof body?.projectId === 'string' && body.projectId ? body.projectId : null,
			act: typeof body?.act === 'string' ? body.act : null,
			featureId: typeof body?.featureId === 'string' ? body.featureId : null
		};
	} catch {
		return none;
	}
}

/** Sentence the AI reads when the run under way holds what it finds (rule 35bf88ae): before the writing and during it alike. */
export const WRITES_HELD = 'This Reverse-Specification writes nothing until it is validated: report each difference with report_retrospec_reading (changes), with the writes it takes. Lyriks writes what a person validates on Mismatch.';

/** What writes the specification itself: the sources an AI registers and the implementation index are not it. */
export function writesTheSpecification(url: URL): boolean {
	const path = url.pathname;
	if (path === '/api/behavior/apply' || path === '/api/behavior/project') return true;
	return path.startsWith('/api/draft/') && !path.startsWith('/api/draft/documents');
}

/**
 * What a validated specification refuses an AI client, as its page refuses the
 * same change in place (rule aa96a75b, 1e614a44, 331b7c1f): the parts that say
 * what the product does, and the behaviour. The rules and their register, the
 * scope, the operations target, the sources, the approvals and the baselines
 * stay writable; a change of the rest goes through an evolution.
 */
const FROZEN_ONCE_VALIDATED = /^\/api\/draft\/(foundation(\/(identity|definition))?|users(\/[a-z-]+)?|features|experience|data(\/links)?|architecture|glossary)$/;

export function frozenOnceValidated(url: URL): boolean {
	const path = url.pathname;
	return path === '/api/behavior/apply' || path === '/api/behavior/project' || FROZEN_ONCE_VALIDATED.test(path);
}

/**
 * Why the AI client's write into the specification does not go through, or
 * null when it does: a later run holds its changes until a person validates
 * them (criterion 50b00229), or the specification is validated and the write
 * changes what the product does (criterion 3b0446d2). The writing of the
 * validated changes lifts nothing: Lyriks writes them itself (point 214).
 */
async function aiWriteRefusal(services: AppServices, projectId: string, url: URL): Promise<string | null> {
	const read = await loadRetrospecDocument(services.sectionDocuments, projectId).catch(() => null);
	if (!read) return null;
	if (writesHeld(currentRun(read.doc))) return WRITES_HELD;
	return frozenOnceValidated(url) && specState(read.doc) === 'validated' ? VALIDATED_SPEC_REFUSAL : null;
}

/** The live session's wait for the next click: the AI is there, it does not act (criterion 122ab5c8). */
const isWait = (url: URL, act: string | null) => url.pathname === '/api/evolution/live' && act === 'await';

/**
 * Wrap the app's request handler: an MCP call that succeeded on a project is
 * announced as the AI's activity there. A person's calls pass straight through.
 */
export async function followAiProjectCalls(input: Parameters<Handle>[0], handle: Handle): Promise<Response> {
	const { event } = input;
	if (callerKind(event.request) !== 'ai_client' || !event.url.pathname.startsWith('/api/')) return handle(input);
	const write = event.request.method !== 'GET' && event.request.method !== 'HEAD';
	const held = write && writesTheSpecification(event.url);
	// A write into the specification is read whole, however long: its project decides whether it may go through.
	const body = write ? await peekBody(event.request, held ? Infinity : PEEK_LIMIT_BYTES) : { projectId: null, act: null, featureId: null };
	const projectId = projectInUrl(event.url) ?? body.projectId;
	const refusal = held && projectId && !(body.featureId && isDraftLeafId(body.featureId)) ? await aiWriteRefusal(event.locals.services, projectId, event.url) : null;
	if (refusal) return json({ message: refusal }, { status: 409 });
	const response = await handle(input);
	// Its act counts for its session whatever the answer, read once the request knows whose AI it is (criterion 122ab5c8).
	if (projectId && !isWait(event.url, body.act)) noteAiWork(projectId, event.locals?.session?.email ?? 'local-operator');
	if (projectId && response.ok) {
		ensureWatching();
		ensureDetecting(event.locals.services);
		const section = sectionOf(event.url);
		publishAiActivity({ projectId, requestId: PROJECT_ACTIVITY_ID, act: write ? 'write' : 'read', ...(section ? { section } : {}) });
	}
	return response;
}
