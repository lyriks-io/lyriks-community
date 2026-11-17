import type { ActivityNotice } from '../activity/notice';
import { anchorDomId, placeOfAnchor } from '../discussions/anchors';
import { currentRun, type PersonRef, type RetrospecDocument, type RetrospecRun } from './document';
import { closedNotice, fullyValidatedNotice, readyNotice, rejectedNotice, reminderNotice, revalidationNotice, startedNotice, stoppedNotice, validationRequestNotice } from './notices';
import { CONNECTED_MS, runPaused } from './presence';
import { tabOfItem } from './reading';
import { samePersonRef } from './spec-validators';

/**
 * What happened on a retrospecification that is worth telling someone, newest
 * first: a run started, the AI finished its analysis, a person validated,
 * rejected, set aside or shared an item, commented, published. Read from the
 * stored document and the completion audits, so the notifications and the home
 * page's feed say exactly what the page shows.
 */
export type RetrospecEventKind =
	| 'run_started'
	| 'analysis_finished'
	| 'item_validated'
	| 'item_rejected'
	| 'item_set_aside'
	| 'item_shared'
	| 'comment'
	| 'published'
	/** Someone reminded a validator an element of the Specification 360° waits on them. */
	| 'reminder'
	| 'validation_requested'
	/** An element someone validated changed in the draft: they are asked to validate it again (criterion e6029af6). */
	| 'revalidation_asked'
	/** The run's LLM went silent while it read: the run stopped, for the person who started it (criterion fcd8a267). */
	| 'analysis_stopped';

export interface RetrospecEvent {
	readonly kind: RetrospecEventKind;
	/** The person behind it; absent for the AI's own work when no person is known. */
	readonly authorEmail?: string;
	readonly authorName?: string;
	/** For a share or a reminder: who it concerns, the person to notify. */
	readonly toEmail?: string;
	/** For a validation of the specification or a rejection: the people it is told to. */
	readonly toEmails?: readonly string[];
	readonly toName?: string;
	readonly at: string;
	readonly text: string;
	/** Where the event opens. */
	readonly href: string;
	/** Everyone on the project hears it, but the person who did it (criteria 3fccc273, f04182b8). */
	readonly team?: boolean;
	/** What its notification card says, in the card's reading order (criterion 65fdff0a of feat-feedback-docs). */
	readonly notice?: ActivityNotice;
}

export interface AuditEntryFact {
	readonly performedAt: string;
	/** An email, or 'local' when the install runs without accounts. */
	readonly actor: string;
}

/** What the specification holds, said when the AI finishes (criterion f04182b8). */
export interface BuiltFigures {
	readonly cores: number;
	readonly features: number;
	readonly rules: number;
	readonly users: number;
	/** The features by name, the core ones first: the picture of a specification ready to review (criterion f04182b8). */
	readonly names?: readonly { readonly name: string; readonly core: boolean }[];
}

export interface RetrospecEventInput {
	readonly projectId: string;
	readonly productName: string;
	readonly auditEntries: readonly AuditEntryFact[];
	/** What the specification holds now; without it the AI's notification names no figure. */
	readonly figures?: BuiltFigures;
	/** At most this many events, newest first. */
	readonly limit?: number;
	/**
	 * The current run while its analysis runs: the share read, when its LLM last
	 * called (null when this node never heard it) and the time it is read at. The
	 * run's start shows the share; a silent LLM stops it (criterion fcd8a267).
	 */
	readonly underWay?: { readonly pct: number; readonly seenAt: string | null; readonly now: number; readonly phase?: string | null };
}

/** The input with what the document itself holds, read once for every run. */
interface RunEventInput extends RetrospecEventInput {
	readonly runs?: readonly RetrospecRun[];
	readonly comments?: RetrospecDocument['comments'];
}

const author = (p: PersonRef) => ({ authorEmail: p.id.includes('@') ? p.id : undefined, authorName: p.name });
/** An address for the activity: an email, or the one operator of an install without accounts. */
const address = (p: PersonRef) => (p.id.includes('@') || p.id === 'local-operator' ? p.id : undefined);
/** Verdicts given on the Specification 360° carry this tab: their link opens the element there. */
export const SPEC360_TAB = 'spec360';
/** The page that holds an element of the Specification 360°, scrolled to it. */
export function specElementHref(projectId: string, itemId: string): string {
	const place = placeOfAnchor(itemId);
	return `/projects/${encodeURIComponent(projectId)}/spec${place ? `/${place}` : ''}#${anchorDomId(itemId)}`;
}
const quoted = (title: string) => (title ? `“${title}”` : 'an item');
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** "9 core features, 17 features, 296 rules, 11 users": a figure the specification does not hold is left out. */
export function figuresLine(f: BuiltFigures | undefined): string {
	if (!f) return '';
	const parts: [number, string][] = [
		[f.cores, 'core feature'],
		[f.features, 'feature'],
		[f.rules, 'rule'],
		[f.users, 'user']
	];
	return parts
		.filter(([n]) => n > 0)
		.map(([n, one]) => plural(n, one))
		.join(', ');
}

/**
 * The run whose LLM went silent past the time it still reads connected, dated
 * when it went silent and told to the person who started it (criterion
 * fcd8a267). Read from the run, never stored: once the LLM calls again or the
 * analysis ends, it is gone.
 */
function stoppedEvent(run: RetrospecRun, input: RunEventInput, href: string): RetrospecEvent | null {
	const live = input.underWay;
	if (!live || run.implicit || !runPaused(live.seenAt, live.now)) return null;
	const to = address(run.startedBy);
	if (!to) return null;
	const silentFrom = Date.parse(live.seenAt ?? run.launchedAt ?? run.startedAt);
	const figures = run.complementary ? null : (input.figures ?? null);
	return {
		kind: 'analysis_stopped',
		toEmail: to,
		toName: run.startedBy.name,
		at: new Date(silentFrom + CONNECTED_MS).toISOString(),
		text: `The Reverse-Specification of ${input.productName.trim() || 'this product'} stopped at ${live.pct} %: its AI went silent.`,
		href,
		notice: stoppedNotice(live.pct, figures, input.productName.trim() || 'this product')
	};
}

/** The people who validated an element of the run, each once, in the order they first did. */
function validatorsOf(run: RetrospecRun): PersonRef[] {
	const out: PersonRef[] = [];
	for (const verdict of Object.values(run.verdicts)) for (const v of verdict.validatedBy) if (!out.some((p) => samePersonRef(p, v.person))) out.push(v.person);
	return out;
}

/** When the analysis a later run updates was done: the run before it, validated, closed or else started. */
function earlierAnalysisOf(runs: readonly RetrospecRun[], run: RetrospecRun): string | null {
	const at = runs.indexOf(run);
	const before = at > 0 ? runs[at - 1] : null;
	return before ? (before.publishedAt ?? before.analysisEndedAt ?? before.startedAt) : null;
}

/** What the person who rejected an element said on it, at the moment or after: the reason a rejection quotes. */
function reasonOf(comments: readonly { readonly by: PersonRef; readonly at: string; readonly text: string }[] | undefined, by: PersonRef, at: string): string | null {
	const theirs = (comments ?? []).filter((c) => samePersonRef(c.by, by) && c.at >= at && c.text.trim());
	const said = theirs.sort((a, b) => a.at.localeCompare(b.at))[0];
	return said ? said.text.trim() : null;
}

function runEvents(run: RetrospecRun, input: RunEventInput, href: string, itemHref: (itemId: string, tab: string) => string, current: boolean): RetrospecEvent[] {
	const out: RetrospecEvent[] = [];
	const product = input.productName.trim() || 'this product';
	const specHref = `/projects/${encodeURIComponent(input.projectId)}/spec`;
	const delta = run.complementary?.scope === 'delta';
	const live = current ? input.underWay : undefined;
	if (!run.implicit) {
		out.push({
			kind: 'run_started',
			...author(run.startedBy),
			at: run.startedAt,
			text: `started the Reverse-Specification of ${product}`,
			href,
			team: true,
			notice: startedNotice({
				name: run.startedBy.name,
				product,
				delta,
				since: delta ? earlierAnalysisOf(input.runs ?? [], run) : null,
				progress: live ? live.pct : null,
				phase: live?.phase ?? null,
				docs: run.mode === 'docs'
			})
		});
	}
	const stopped = current ? stoppedEvent(run, input, href) : null;
	if (stopped) out.push(stopped);
	// The AI's final check, the first one of the run: the analysis is ready.
	const finished = input.auditEntries
		.filter((e) => run.implicit || e.performedAt >= run.startedAt)
		.sort((a, b) => a.performedAt.localeCompare(b.performedAt))[0];
	if (finished) {
		const actor = finished.actor && finished.actor !== 'local' ? finished.actor : undefined;
		// What it built, and the way to it: the Specification 360° (criterion f04182b8).
		const figures = figuresLine(input.figures);
		out.push({
			kind: 'analysis_finished',
			authorEmail: actor,
			at: finished.performedAt,
			// Lyriks did the work, whoever's AI ran it (criteria f04182b8, ccaa0784).
			text: `Lyriks rebuilt the specification of ${product}${figures ? `: ${figures}` : ''}. See the result in the Specification 360°.`,
			href: specHref,
			team: true,
			notice: readyNotice(input.figures, delta, product, !!run.holds)
		});
	} else if (run.analysisEndedAt && run.analysisEndedBy) {
		out.push({
			kind: 'analysis_finished',
			...author(run.analysisEndedBy),
			at: run.analysisEndedAt,
			text: `closed the analysis of ${product}. Ready for validation.`,
			href: specHref,
			team: true,
			notice: closedNotice(run.analysisEndedBy.name, input.figures)
		});
	}
	// Everyone on the project hears the analysis is ready, so a person who asked to be told hears it once (criterion f04182b8).
	for (const [itemId, verdict] of Object.entries(run.verdicts)) {
		const at = itemHref(itemId, verdict.tab);
		for (const v of verdict.validatedBy) out.push({ kind: 'item_validated', ...author(v.person), at: v.at, text: `validated ${quoted(verdict.title)}`, href: at });
		const flag = verdict.flag;
		if (flag?.kind === 'rejected') {
			// Told to the person who leads the validation, never to the one who rejected it (criterion 4fce1259).
			const lead = address(run.startedBy);
			out.push({
				kind: 'item_rejected',
				...author(flag.by),
				toEmails: lead && !samePersonRef(run.startedBy, flag.by) ? [lead] : [],
				at: flag.at,
				text: `rejected ${quoted(verdict.title)}`,
				href: at,
				notice: rejectedNotice(flag.by, verdict.title, reasonOf(input.comments?.[itemId], flag.by, flag.at))
			});
		}
		if (flag?.kind === 'later') out.push({ kind: 'item_set_aside', ...author(flag.by), at: flag.at, text: `set ${quoted(verdict.title)} aside to review later`, href: at });
		if (flag?.kind === 'shared') {
			out.push({
				kind: 'item_shared',
				...author(flag.by),
				toEmail: flag.to.id.includes('@') ? flag.to.id : undefined,
				toName: flag.to.name,
				at: flag.at,
				text: `shared ${quoted(verdict.title)} with ${flag.to.name}`,
				href: at
			});
		}
	}
	for (const r of run.reminders ?? []) {
		out.push({
			kind: 'reminder',
			...author(r.by),
			toEmail: address(r.to),
			toName: r.to.name,
			at: r.at,
			text: `Your validation of ${quoted(r.title)} is awaited in the Specification 360°.`,
			href: specElementHref(input.projectId, r.itemId),
			notice: reminderNotice(r.by, r.to, r.title)
		});
	}
	if (run.publishedAt && run.publishedBy) {
		out.push({
			kind: 'published',
			...author(run.publishedBy),
			toEmails: (run.publishNotified ?? []).flatMap((p) => address(p) ?? []),
			at: run.publishedAt,
			text: `validated the Specification 360° of ${product}`,
			href: `/projects/${encodeURIComponent(input.projectId)}/evolution`,
			notice: fullyValidatedNotice(run.publishedBy, validatorsOf(run), input.figures?.features ?? 0, product)
		});
	}
	return out;
}

export function retrospecEvents(doc: RetrospecDocument, input: RetrospecEventInput): RetrospecEvent[] {
	const base = `/projects/${encodeURIComponent(input.projectId)}/retrospec`;
	// The review lives in the Specification 360°: an element of it opens there; an older review item keeps its tab.
	const itemHref = (itemId: string, tab: string) =>
		tab === SPEC360_TAB || !tabOfItem(itemId)
			? specElementHref(input.projectId, itemId)
			: `${base}?step=validation&tab=${encodeURIComponent(tab || tabOfItem(itemId) || '')}&item=${encodeURIComponent(itemId)}`;
	const current = currentRun(doc);
	const full = { ...input, runs: doc.runs, comments: doc.comments };
	const out = doc.runs.flatMap((run) => runEvents(run, full, base, itemHref, run === current));
	for (const [itemId, requests] of Object.entries(doc.validationRequests ?? {})) {
		for (const request of requests) out.push({
			kind: 'validation_requested',
			...author(request.by),
			toEmail: address(request.to),
			toName: request.to.name,
			at: request.at,
			text: `${request.by.name} requested your validation of ${quoted(request.title)}.`,
			href: specElementHref(input.projectId, itemId),
			notice: validationRequestNotice(request.by, request.to, request.title)
		});
	}
	for (const record of Object.values(doc.revalidations ?? {})) {
		const removed = record.proposed === null;
		for (const person of record.asked) out.push({
			kind: 'revalidation_asked',
			...author(record.by),
			toEmail: address(person),
			toName: person.name,
			at: record.at,
			text: removed ? `${record.by.name} removed ${quoted(record.title)}, which you had validated.` : `${record.by.name} changed ${quoted(record.title)} you had validated: validate it again.`,
			href: removed ? `/projects/${encodeURIComponent(input.projectId)}/spec` : specElementHref(input.projectId, record.itemId),
			notice: revalidationNotice(record.by, person, record.title, removed)
		});
	}
	for (const [itemId, list] of Object.entries(doc.comments)) {
		const href = itemHref(itemId, tabOfItem(itemId) ?? '');
		for (const c of list) out.push({ kind: 'comment', ...author(c.by), at: c.at, text: `commented: ${c.text.length > 140 ? `${c.text.slice(0, 139)}…` : c.text}`, href });
	}
	out.sort((a, b) => b.at.localeCompare(a.at));
	return out.slice(0, input.limit ?? 50);
}
