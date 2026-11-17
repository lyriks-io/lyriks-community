import type { ActContext, ActOutcome } from './acts';
import type { EvolutionRequest } from './draft';
import type { AuthorKind } from './enums';
import { firstRefusal, guard } from './guard';
import { personKey } from './named-validators';
import { sendClick, TICKET_FIELD, type AiClick } from './live-session';

/**
 * Telling the ticket a closed evolution came from (the design's closing
 * block). The platform calls no tracker: the person's own AI does, through the
 * tracker connector the person gave it. The page hands it the message (a
 * ticket click, or a prompt to paste without a session), and the AI reports
 * what it did, which is all the request keeps: whether the comment was posted,
 * whether the ticket moved to done, on which tool, and what went wrong.
 */
export interface TicketPost {
	readonly at: string;
	/** Who reported it, and whether through their AI client. */
	readonly by: string;
	readonly byKind: AuthorKind;
	readonly ticketKey: string;
	/** The tracker, as the AI names it (Jira, Linear, GitHub...). */
	readonly tool: string;
	readonly commented: boolean;
	readonly movedToDone: boolean;
	/** What went wrong, in the AI's words; empty when nothing did. */
	readonly note: string;
}

const closedOnly = (request: EvolutionRequest) =>
	guard(request.status !== 'closed', 'The ticket is told once the evolution is closed.', 'The message says the evolution is closed and how it complies; before the close it would say what is not true yet.');

/** The person hands their AI the message to post on the ticket; it waits for their session like any click. */
export function sendTicketClickAct(ctx: ActContext, request: EvolutionRequest, input: { readonly ticketKey: string; readonly message: string }): ActOutcome {
	const allowed = firstRefusal(
		guard(ctx.actor.kind !== 'person', 'Only a person sends their AI to the ticket.', 'An AI client answers the clicks; it never sends one.'),
		closedOnly(request)
	);
	if (!allowed.ok) return allowed;
	const sent = sendClick(
		request,
		ctx.actor.id,
		{ kind: 'ticket', fieldPath: TICKET_FIELD, leafId: null, ticket: { key: input.ticketKey, message: input.message } },
		ctx.actor.role !== 'viewer',
		ctx.newId(),
		ctx.at
	);
	if (!sent.ok) return sent;
	return { ok: true, request: sent.request, summary: `Click ${sent.click.id} (ticket ${sent.click.ticket?.key}) waits for ${ctx.actor.id}'s AI` };
}

export interface TicketReport {
	readonly ticketKey: string;
	readonly tool: string;
	readonly commented: boolean;
	readonly movedToDone: boolean;
	readonly note?: string;
}

/** A ticket click of the reporter's still waiting or in hand: the report answers it. */
const settles = (c: AiClick, personId: string) => c.kind === 'ticket' && personKey(c.personId) === personKey(personId) && (c.state === 'waiting' || c.state === 'taken');

/**
 * What the AI did on the ticket, reported once it did it: kept on the request,
 * and the ticket click it answers, waiting or in hand, is answered.
 */
export function reportTicketPostAct(ctx: ActContext, request: EvolutionRequest, input: TicketReport): ActOutcome {
	const note = (input.note ?? '').trim();
	const allowed = firstRefusal(
		guard(ctx.actor.role === 'viewer', 'A viewer does not report on the ticket.', 'The report speaks for the team on the request.'),
		closedOnly(request),
		guard(!input.ticketKey.trim(), 'Name the ticket you posted on (ticketKey).', 'The page shows the ticket the message went to.'),
		guard(!input.tool.trim(), 'Name the tracker you posted through (tool), as you know it: Jira, Linear, GitHub...', 'The page says where the message was posted.'),
		guard(!input.commented && note === '', 'Say why the message was not posted (note).', 'A person reads the reason and posts it another way.')
	);
	if (!allowed.ok) return allowed;
	const post: TicketPost = {
		at: ctx.at,
		by: ctx.actor.id,
		byKind: ctx.actor.kind,
		ticketKey: input.ticketKey.trim(),
		tool: input.tool.trim(),
		commented: input.commented,
		movedToDone: input.movedToDone,
		note
	};
	const aiClicks = (request.aiClicks ?? []).map((c): AiClick => (settles(c, ctx.actor.id) ? { ...c, state: 'answered', answeredAt: ctx.at } : c));
	const said = input.commented ? `Message posted on ${post.ticketKey} (${post.tool})${input.movedToDone ? ', ticket moved to done' : ''}` : `Not posted on ${post.ticketKey}: ${note}`;
	return { ok: true, request: { ...request, ticketPost: post, aiClicks }, summary: said };
}

export interface TicketPostTarget {
	readonly projectId: string;
	readonly requestId: string;
	readonly ticketKey: string;
}

/** The one operation that reports what the AI did on the ticket, as it sends it. */
const reportOp = (t: TicketPostTarget) =>
	`{ op: "report_ticket_post", requestId: "${t.requestId}", ticketKey: "${t.ticketKey}", tool: <your tracker's name>, commented: true|false, movedToDone: true|false, note? }`;

/** What the person's AI does with a ticket click, in the words it reads with the click. */
export function ticketPostInstruction(t: TicketPostTarget): string {
	return `Post \`ticket.message\` as a comment on ticket ${t.ticketKey} with your own tracker connector (Jira, Linear, GitHub, or the one the person connected to you), then move the ticket to its done status. Then report what happened: apply_evolution_batch [${reportOp(t)}]. When no tracker connector is connected to you, or the ticket cannot be found or moved, report it with commented or movedToDone false and the reason in note: never report what did not happen.`;
}

/** The same instruction as a prompt the person pastes into their AI when no session waits on the page. */
export function ticketPostPrompt(t: TicketPostTarget & { readonly message: string }): string {
	return [
		`With my ticketing tool's connector and the Lyriks MCP: post the message below as a comment on ticket ${t.ticketKey}, then move the ticket to its done status.`,
		`Then report it to Lyriks with apply_evolution_batch on project ${t.projectId}: [${reportOp(t)}]. When something could not be done, report it with the reason in note; never report what did not happen.`,
		'',
		'Message:',
		t.message
	].join('\n');
}
