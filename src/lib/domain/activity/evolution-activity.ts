import { REQUEST_STAGES, type ProjectEvolutionDraft, type EvolutionRequest, type FieldValidation, type FieldThreadMessage } from '$domain/evolution';
import { membersNamedIn, requestKeyOf } from '$domain/evolution';
import { requestPagePath } from '$domain/evolution';
import { samePerson, type ActivityActor, type ActivityEvent } from './activity';
import type { NoticePerson } from './notice';
import {
	HISTOGRAM_DAYS,
	amendedNotice,
	approvedNotice,
	breakingNotice,
	buildStartedNotice,
	cancelledNotice,
	certifiedNotice,
	createdNotice,
	impactReadyNotice,
	mentionNotice,
	replyNotice,
	type EvolutionRef
} from './evolution-notices';

/**
 * The activity an Evolution draft records: each request opened, the answers
 * people validated, the conversations held on its fields, the tasks an AI
 * client finished on a person's click, and the life of the request: its impact
 * report and coherence check, its approval into Build, its first commit, an
 * amendment while it is built, its cancellation and its certification
 * (criterion 4bf1182d of feat-feedback-docs). Read off the draft, nothing kept
 * aside.
 */

export interface ActivityMember {
	readonly id: string;
	readonly name: string;
}

/** Where an answer sits on the request's page, under the names the page gives it. */
export function dossierPlace(key: string): { readonly step: string; readonly title: string } {
	const [path] = key.split('@');
	if (path === 'request.requester' || path === 'request.origin' || path === '00-need.description') return { step: 'Briefing', title: 'Request origin' };
	if (/^00-need\.(situation|symptoms|cost)$/.test(path)) return { step: 'Briefing', title: 'Current situation' };
	if (/^00-need\.(objectives|measures)$/.test(path)) return { step: 'Briefing', title: 'Target situation' };
	if (path.startsWith('step.technical_spec.')) return { step: 'Solution', title: 'Technical requirements' };
	if (path.startsWith('step.solution.') || path.startsWith('step.functional_spec.')) return { step: 'Solution', title: 'Functional requirements' };
	if (path.startsWith('element.action:')) return { step: 'Specification', title: 'An action' };
	if (path.startsWith('element.path.')) return { step: 'Specification', title: 'A journey path' };
	if (key.includes('@')) return { step: 'Specification', title: 'A feature' };
	return { step: 'Briefing', title: 'An answer' };
}

/** The conversation a message of a request's field thread belongs to, as its events carry it. */
export function evolutionThreadKey(requestId: string, threadId: string): string {
	return `evo:${requestId}:t:${threadId}`;
}

/** Validations given within this span by the same person on the same step read as one act. */
const BURST_MS = 10 * 60 * 1000;

const actorOf = (id: string, kind: string): ActivityActor => ({ id, kind: kind === 'ai_client' ? 'ai' : 'person' });

/** A person as a notice names them: the roster's name, Lyriks for an AI client (criterion ccaa0784), else their id. */
function personOf(id: string, kind: string, members: readonly ActivityMember[]): NoticePerson {
	if (kind === 'ai_client') return { name: 'Lyriks' };
	return { id, name: members.find((m) => samePerson(m.id, id))?.name || id };
}

/** The members a message names with @ and their full name or first name, its writer aside (rule 5f1ea7b0). */
const mentionedIn = (body: string, members: readonly ActivityMember[], author: string): string[] => membersNamedIn(body, members, author);

function validationEvents(projectId: string, r: EvolutionRequest, key: string): ActivityEvent[] {
	const given = (r.fieldValidations ?? [])
		.filter((v) => v.verdict !== 'refused')
		.slice()
		.sort((a, b) => a.at.localeCompare(b.at));
	const bursts: FieldValidation[][] = [];
	for (const v of given) {
		const last = bursts.at(-1);
		const head = last?.[0];
		const tail = last?.at(-1);
		if (
			last && head && tail &&
			head.by === v.by &&
			head.byKind === v.byKind &&
			dossierPlace(head.key).step === dossierPlace(v.key).step &&
			Date.parse(v.at) - Date.parse(tail.at) <= BURST_MS
		) last.push(v);
		else bursts.push([v]);
	}
	return bursts.map((burst) => {
		const first = burst[0];
		const titles = [...new Set(burst.map((v) => dossierPlace(v.key).title))];
		const place = dossierPlace(first.key);
		return {
			id: `evo:${r.id}:val:${first.key}:${first.at}`,
			projectId,
			at: burst.at(-1)?.at ?? first.at,
			actor: { id: first.by, kind: first.byKind === 'ai_client' && !first.delegated ? 'ai' : 'person' },
			kind: 'validated',
			line: titles.length === 1 ? `validated “${titles[0]}”` : `validated ${burst.length} answers`,
			text: '',
			where: `${key} · ${place.step}`,
			href: requestPagePath(projectId, r.id),
			to: []
		};
	});
}

function threadEvents(projectId: string, r: EvolutionRequest, key: string, members: readonly ActivityMember[]): ActivityEvent[] {
	const out: ActivityEvent[] = [];
	for (const thread of r.fieldThreads ?? []) {
		const place = dossierPlace(thread.key);
		const byId = new Map<string, FieldThreadMessage>(thread.messages.map((m) => [m.id, m]));
		const href = requestPagePath(projectId, r.id);
		const where = `${key} · ${place.title}`;
		for (const m of thread.messages) {
			// An exchange with one's own AI is read by nobody else until it is published.
			if (m.privateTo) continue;
			const actor = actorOf(m.author, m.authorKind);
			const base = { projectId, at: m.postedAt, actor, text: m.body, where, href, thread: evolutionThreadKey(r.id, thread.id) };
			const who = personOf(m.author, m.authorKind, members);
			const ref = { key, title: r.title };
			const mentioned = mentionedIn(m.body, members, m.author);
			if (mentioned.length) out.push({ ...base, id: `evo:${r.id}:msg:${m.id}:m`, kind: 'mention', line: `wrote on “${place.title}”`, to: mentioned, notice: mentionNotice(ref, place.title, who, m.body) });
			const answered = m.replyTo ? byId.get(m.replyTo) : undefined;
			if (answered && answered.author !== m.author && !mentioned.includes(answered.author)) {
				const earlier = { person: personOf(answered.author, answered.authorKind, members), text: answered.body };
				out.push({ ...base, id: `evo:${r.id}:msg:${m.id}:r`, kind: 'reply', line: `replied on “${place.title}”`, to: [answered.author], notice: replyNotice(ref, place.title, who, m.body, earlier) });
			} else if (!m.replyTo && !mentioned.length) {
				out.push({ ...base, id: `evo:${r.id}:msg:${m.id}`, kind: 'comment', line: `opened a discussion on “${place.title}”`, to: [] });
			}
		}
	}
	return out;
}

const TASK_VERB: Readonly<Record<string, string>> = { prefill: 'Prefilled', ask: 'Answered your question on', draw: 'Drew' };

function aiTaskEvents(projectId: string, r: EvolutionRequest, key: string): ActivityEvent[] {
	return (r.aiClicks ?? [])
		.filter((c) => c.state === 'answered' && c.answeredAt && !c.answeredNothing && !c.cancellation)
		.map((c) => {
			const place = dossierPlace(c.fieldPath ?? '');
			return {
				id: `evo:${r.id}:ai:${c.id}`,
				projectId,
				at: c.answeredAt ?? c.at,
				actor: { id: c.personId, kind: 'ai' as const },
				kind: 'ai_done' as const,
				line: 'finished a task',
				text: `${TASK_VERB[c.kind] ?? 'Worked on'} “${place.title}” of ${key}.`,
				where: `${key} · ${place.step}`,
				href: requestPagePath(projectId, r.id),
				to: [c.personId]
			};
		});
}

const stageLabel = (r: EvolutionRequest) => REQUEST_STAGES.find((s) => s.code === r.stage)?.label ?? r.stage;

function createdEvent(projectId: string, r: EvolutionRequest, key: string, members: readonly ActivityMember[]): ActivityEvent[] {
	// The request does not name who opened it: its first recorded act does.
	const first = (r.history ?? []).slice().sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
	if (!r.createdAt || !first) return [];
	return [
		{
			id: `evo:${r.id}:created`,
			projectId,
			at: r.createdAt,
			actor: actorOf(first.authorId, first.authorKind),
			kind: 'created',
			line: `created the evolution ${key} · ${r.title.trim() || 'Untitled'}`,
			text: '',
			where: 'Evolutions',
			href: requestPagePath(projectId, r.id),
			to: [],
			// Everyone on the project hears a new evolution, but its author (criterion 4bf1182d).
			team: true,
			notice: createdNotice({ key, title: r.title }, personOf(first.authorId, first.authorKind, members), {
				stage: stageLabel(r),
				features: r.leafIds.length,
				impactRan: r.impactReport?.status === 'ready'
			})
		}
	];
}

/** The people who work on a request: its requester when the roster knows them, whoever validated, signed or wrote on it. */
export function workingOn(r: EvolutionRequest, members: readonly ActivityMember[]): string[] {
	const ids = [
		...(members.some((m) => samePerson(m.id, r.requester)) || r.requester.includes('@') ? [r.requester] : []),
		...(r.history ?? []).filter((h) => h.authorKind === 'person').map((h) => h.authorId),
		...(r.fieldValidations ?? []).filter((v) => v.byKind === 'person' || v.delegated).map((v) => v.by),
		...(r.fieldSignatures ?? []).map((f) => f.signerId),
		...(r.stepValidations ?? []).flatMap((v) => v.validations.filter((x) => x.kind === 'person').map((x) => x.by)),
		...(r.fieldThreads ?? []).flatMap((t) => t.messages.filter((m) => m.authorKind === 'person' && !m.privateTo).map((m) => m.author))
	];
	const out: string[] = [];
	for (const id of ids) if (id.trim() && !out.some((o) => samePerson(o, id))) out.push(id);
	return out;
}

/** The people who validated its steps, then the person named last when they did not: who a stamp shows. */
function signersOf(r: EvolutionRequest, members: readonly ActivityMember[], last: NoticePerson): NoticePerson[] {
	const out: NoticePerson[] = [];
	for (const v of (r.stepValidations ?? []).flatMap((s) => s.validations)) {
		if (v.kind !== 'person' || out.some((p) => p.id && samePerson(p.id, v.by))) continue;
		out.push(personOf(v.by, 'person', members));
	}
	if (!out.some((p) => p.id && last.id && samePerson(p.id, last.id))) out.push(last);
	return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);

/** The life of a request worth telling the people who work on it (criterion 4bf1182d). */
function lifecycleEvents(projectId: string, r: EvolutionRequest, key: string, members: readonly ActivityMember[]): ActivityEvent[] {
	const ref: EvolutionRef = { key, title: r.title };
	const href = requestPagePath(projectId, r.id);
	const to = workingOn(r, members);
	const out: ActivityEvent[] = [];
	const event = (id: string, at: string, actor: ActivityActor, line: string, notice: ActivityEvent['notice'], extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
		id: `evo:${r.id}:${id}`,
		projectId,
		at,
		actor,
		kind: 'progressed',
		line,
		text: '',
		where: key,
		href,
		to,
		notice,
		...extra
	});
	const lyriks: ActivityActor = { id: 'lyriks', kind: 'lyriks' };

	const impact = r.impactReport;
	if (impact?.status === 'ready' && impact.ranAt) {
		const features = [
			...new Set(
				(r.impactFindings ?? [])
					.map((f) => (f.nodeKind === 'feature' ? f.nodeLabel : (f.groupPath ?? []).at(-1) ?? ''))
					.filter((n) => n.trim())
			)
		];
		const count = Math.max(r.leafIds.length, features.length);
		out.push(event(`impact:${impact.ranAt}`, impact.ranAt, lyriks, `simulated ${key}`, impactReadyNotice(ref, features, count, (r.impactFindings ?? []).length)));
	}

	const coherence = r.coherenceReport;
	if (coherence?.status === 'ready' && coherence.ranAt) {
		// What the request caused and nobody accepted as a known risk; a note only says how the change is proved.
		const own = (r.coherenceFindings ?? []).filter((f) => f.scope !== 'inherited' && !f.risk && !f.note);
		const blocking = own.filter((f) => f.severity === 'blocking');
		if (blocking.length > 0) {
			const counts = { blocking: blocking.length, major: own.filter((f) => f.severity === 'major').length, minor: own.filter((f) => f.severity !== 'blocking' && f.severity !== 'major').length };
			out.push(event(`coherence:${coherence.ranAt}`, coherence.ranAt, lyriks, `checked ${key}`, breakingNotice(ref, counts, blocking[0].title), { kind: 'progressed' }));
		}
	}

	for (const v of r.frozenVersions ?? []) {
		const who = personOf(v.by, 'person', members);
		out.push(event(`freeze:${v.version}`, v.at, actorOf(v.by, 'person'), `approved ${key}`, approvedNotice(ref, who, v.version, signersOf(r, members, who))));
	}

	const history = (r.history ?? []).slice().sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
	const commits = history.filter((h) => h.type === 'code_commit');
	const firstCommit = commits[0];
	if (firstCommit) {
		const last = dayOf(firstCommit.recordedAt);
		const days = Array.from({ length: HISTOGRAM_DAYS }, (_, i) => commits.filter((c) => dayOf(c.recordedAt) === last - (HISTOGRAM_DAYS - 1 - i)).length);
		out.push(event(`build:${firstCommit.id}`, firstCommit.recordedAt, actorOf(firstCommit.authorId, firstCommit.authorKind), `started building ${key}`, buildStartedNotice(ref, firstCommit.recordedAt, days)));
	}

	for (const h of history.filter((x) => x.type === 'spec_amended')) {
		const frozen = (r.frozenVersions ?? []).filter((v) => v.at <= h.recordedAt).at(-1);
		const who = personOf(h.authorId, h.authorKind, members);
		out.push(event(`amended:${h.id}`, h.recordedAt, actorOf(h.authorId, h.authorKind), `amended ${key}`, amendedNotice(ref, who, frozen?.version ?? Math.max(1, r.specVersion), frozen?.at ?? null, h.recordedAt)));
	}

	if (r.status === 'cancelled' && r.cancellation) {
		const c = r.cancellation;
		out.push(event(`cancelled:${c.at}`, c.at, actorOf(c.by, 'person'), `cancelled ${key}`, cancelledNotice(ref, personOf(c.by, 'person', members), c.reason)));
	}

	if (r.deployment) {
		const d = r.deployment;
		const who = personOf(d.declaredBy, 'person', members);
		// The specification holds the change now: everyone on the project hears it, but the person who declared it (criterion 4bf1182d).
		out.push(event(`live:${d.declaredAt}`, d.declaredAt, actorOf(d.declaredBy, 'person'), `certified ${key}`, certifiedNotice(ref, who, r.leafIds.length, signersOf(r, members, who)), { to: [], team: true }));
	}
	return out;
}

export function evolutionActivity(projectId: string, draft: Pick<ProjectEvolutionDraft, 'requests'>, members: readonly ActivityMember[]): ActivityEvent[] {
	return draft.requests
		.filter((r) => r.status !== 'deleted')
		.flatMap((r) => {
			const key = requestKeyOf(draft.requests, r.id) ?? r.title;
			return [
				...createdEvent(projectId, r, key, members),
				...validationEvents(projectId, r, key),
				...threadEvents(projectId, r, key, members),
				...aiTaskEvents(projectId, r, key),
				...lifecycleEvents(projectId, r, key, members)
			];
		});
}
