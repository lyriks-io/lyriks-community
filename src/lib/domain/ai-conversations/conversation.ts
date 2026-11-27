import { messageWords } from './message-links';
import { personKey } from '../evolution';
import { isAnchor } from '../discussions';

/**
 * Ask my AI (feat-lyriks-copy-a52881-11, surface cf20b92c "My conversations
 * with my AI"): a person's private conversations with their own AI on a
 * project. Each reads as a chat; nobody else reads it, an owner included
 * (criterion 13235e8e). A question asked from the box at the foot of the
 * navigation opens one carrying the page it was asked from as its context
 * (criterion cc5f46cb); the AI weighs that page and asks back when it cannot
 * tell what the person means (criterion 8fe54838); a message worth deciding is
 * published as a topic on the closest block (criterion bbab6a2f); a change of
 * the specification the AI proposes is written only once a person who may edit
 * validates it, after a clean dry run (criterion 8ec8310b). Pure.
 */

export const AI_CONVERSATIONS_VERSION = 1;
export const MAX_CHAT_MESSAGE_LENGTH = 8000;
const MAX_TITLE = 80;
/** A conversation keeps its latest messages; older ones leave so the document stays small. */
const KEPT_MESSAGES = 200;
/** A person keeps their latest conversations. */
const KEPT_CONVERSATIONS = 100;

/** The page a conversation was asked from: a block of Knowledge (anchor), or another page of the project (href alone). */
export interface AiChatContext {
	readonly anchor?: string;
	readonly title: string;
	readonly href: string;
}

/** A block of Knowledge a message can be published on. */
export interface AiChatPlace {
	readonly anchor: string;
	readonly title: string;
}

export const PROPOSAL_STATES = ['proposed', 'applied', 'rejected', 'no_longer_lands'] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/** A change of the specification the AI prepared as behaviour operations on one feature, checked by a dry run. */
export interface AiChatProposal {
	readonly featureId: string;
	/** What it changes, in the person's words. */
	readonly summary: string;
	readonly operations: readonly Record<string, unknown>[];
	readonly state: ProposalState;
	/** What the last dry run refused, when it no longer lands. */
	readonly errors?: readonly string[];
	readonly decidedAt?: string;
}

export interface AiChatPublished {
	readonly anchor: string;
	readonly title: string;
	readonly threadId: string;
	readonly at: string;
}

/** person: the reader; ai: their AI, signed Lyriks · for <reader>; lyriks: what Lyriks itself tells the AI (a change to correct). */
export type AiChatRole = 'person' | 'ai' | 'lyriks';

export interface AiChatMessage {
	readonly id: string;
	readonly role: AiChatRole;
	readonly text: string;
	readonly at: string;
	/** The AI asks the person what they mean (criterion 8fe54838), or asks them on its own (action 385983f9). */
	readonly asks?: true;
	/** The AI says why it stopped working on the project (action 559ba487). */
	readonly stopped?: true;
	/** Where the AI suggests the message belongs, for Publish. */
	readonly place?: AiChatPlace;
	readonly proposal?: AiChatProposal;
	readonly published?: AiChatPublished;
	/** Taken back before the AI took it. */
	readonly withdrawn?: true;
}

export interface AiConversation {
	readonly id: string;
	readonly personId: string;
	readonly title: string;
	readonly context: AiChatContext | null;
	readonly startedAt: string;
	readonly updatedAt: string;
	readonly messages: readonly AiChatMessage[];
	/** The AI opened it on its own, to ask the person something or say why it stopped (state conversation.openedBy). */
	readonly openedBy?: 'ai';
	/** When the person last opened it: why the AI stopped is settled once read (rule fc2ad132). */
	readonly seenAt?: string;
}

export interface AiConversationsDocument {
	readonly version: number;
	readonly conversations: readonly AiConversation[];
}

export type Refusal = { readonly ok: false; readonly reason: string; readonly notFound?: true };
export type Outcome<T> = ({ readonly ok: true; readonly document: AiConversationsDocument } & T) | Refusal;

const refuse = (reason: string, notFound = false): Refusal => ({ ok: false, reason, ...(notFound ? { notFound: true as const } : {}) });
const NOT_FOUND = 'Conversation not found';
const same = (a: string, b: string) => personKey(a) === personKey(b);

export const emptyAiConversations = (): AiConversationsDocument => ({ version: AI_CONVERSATIONS_VERSION, conversations: [] });

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function parseContext(v: unknown): AiChatContext | null {
	const r = rec(v);
	if (!r || !str(r.href)) return null;
	return { ...(isAnchor(r.anchor) ? { anchor: r.anchor } : {}), title: str(r.title), href: str(r.href) };
}

function parsePlace(v: unknown): AiChatPlace | undefined {
	const r = rec(v);
	return r && isAnchor(r.anchor) ? { anchor: r.anchor, title: str(r.title) || r.anchor } : undefined;
}

function parseProposal(v: unknown): AiChatProposal | undefined {
	const r = rec(v);
	if (!r || !str(r.featureId) || !Array.isArray(r.operations)) return undefined;
	const state = (PROPOSAL_STATES as readonly string[]).includes(str(r.state)) ? (r.state as ProposalState) : 'proposed';
	return {
		featureId: str(r.featureId),
		summary: str(r.summary),
		operations: r.operations.filter((o): o is Record<string, unknown> => !!rec(o)),
		state,
		...(Array.isArray(r.errors) ? { errors: r.errors.map(String) } : {}),
		...(str(r.decidedAt) ? { decidedAt: str(r.decidedAt) } : {})
	};
}

function parseMessage(v: unknown): AiChatMessage | null {
	const r = rec(v);
	if (!r || !str(r.id) || !str(r.at)) return null;
	const role: AiChatRole = r.role === 'ai' || r.role === 'lyriks' ? r.role : 'person';
	const place = parsePlace(r.place);
	const proposal = parseProposal(r.proposal);
	const pub = rec(r.published);
	return {
		id: str(r.id),
		role,
		text: str(r.text),
		at: str(r.at),
		...(r.asks === true ? { asks: true as const } : {}),
		...(r.stopped === true ? { stopped: true as const } : {}),
		...(place ? { place } : {}),
		...(proposal ? { proposal } : {}),
		...(pub && isAnchor(pub.anchor) && str(pub.threadId)
			? { published: { anchor: pub.anchor, title: str(pub.title), threadId: str(pub.threadId), at: str(pub.at) } }
			: {}),
		...(r.withdrawn === true ? { withdrawn: true as const } : {})
	};
}

/** The stored document, whatever shape it was saved in; anything unreadable is left out. */
export function parseAiConversations(raw: unknown): AiConversationsDocument {
	const r = rec(raw);
	if (!r || !Array.isArray(r.conversations)) return emptyAiConversations();
	const conversations: AiConversation[] = [];
	for (const c of r.conversations) {
		const o = rec(c);
		if (!o || !str(o.id) || !str(o.personId)) continue;
		conversations.push({
			id: str(o.id),
			personId: str(o.personId),
			title: str(o.title),
			context: parseContext(o.context),
			startedAt: str(o.startedAt),
			updatedAt: str(o.updatedAt) || str(o.startedAt),
			messages: Array.isArray(o.messages) ? o.messages.map(parseMessage).filter((m): m is AiChatMessage => m !== null) : [],
			...(o.openedBy === 'ai' ? { openedBy: 'ai' as const } : {}),
			...(str(o.seenAt) ? { seenAt: str(o.seenAt) } : {})
		});
	}
	return { version: AI_CONVERSATIONS_VERSION, conversations };
}

/** The person's own conversations, latest first: nobody else's ever (criterion 13235e8e). */
export function conversationsOf(document: AiConversationsDocument, personId: string): AiConversation[] {
	return document.conversations.filter((c) => same(c.personId, personId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** One conversation of the person; someone else's reads as not found, an owner included (rule 61612544). */
export function conversationOf(document: AiConversationsDocument, personId: string, conversationId: string): AiConversation | null {
	const found = document.conversations.find((c) => c.id === conversationId);
	return found && same(found.personId, personId) ? found : null;
}

/** The title of a conversation: the first line of its first question, its links read as their names (criterion 7f4690b0), cut at a word. */
export function titleOf(text: string): string {
	const line = messageWords(text).trim().split(/\r?\n/, 1)[0].trim();
	if (line.length <= MAX_TITLE) return line;
	const cut = line.slice(0, MAX_TITLE);
	const space = cut.lastIndexOf(' ');
	return `${(space > MAX_TITLE / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function textRefusal(text: string): Refusal | null {
	if (!text.trim()) return refuse('Write your message first.');
	if (text.length > MAX_CHAT_MESSAGE_LENGTH) return refuse(`A message holds at most ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
	return null;
}

function replace(document: AiConversationsDocument, conversation: AiConversation): AiConversationsDocument {
	const kept = { ...conversation, messages: conversation.messages.slice(-KEPT_MESSAGES) };
	return { ...document, conversations: document.conversations.map((c) => (c.id === conversation.id ? kept : c)) };
}

/** Only the person's latest conversations are kept: the oldest of theirs leaves first, nobody else's. */
function pruned(document: AiConversationsDocument, personId: string): AiConversationsDocument {
	const mine = conversationsOf(document, personId);
	if (mine.length <= KEPT_CONVERSATIONS) return document;
	const dropped = new Set(mine.slice(KEPT_CONVERSATIONS).map((c) => c.id));
	return { ...document, conversations: document.conversations.filter((c) => !dropped.has(c.id)) };
}

/** A question asked from the box, or a first message on the Ask my AI page: a new conversation (actions 336e9466, 341647a9). */
export function startConversation(
	document: AiConversationsDocument,
	personId: string,
	input: { readonly text: string; readonly context: AiChatContext | null },
	ids: { readonly conversationId: string; readonly messageId: string },
	at: string
): Outcome<{ readonly conversation: AiConversation; readonly message: AiChatMessage }> {
	const bad = textRefusal(input.text);
	if (bad) return bad;
	const message: AiChatMessage = { id: ids.messageId, role: 'person', text: input.text.trim(), at };
	const conversation: AiConversation = {
		id: ids.conversationId,
		personId,
		title: titleOf(input.text),
		context: input.context,
		startedAt: at,
		updatedAt: at,
		messages: [message]
	};
	return { ok: true, conversation, message, document: pruned({ ...document, conversations: [...document.conversations, conversation] }, personId) };
}

/**
 * The person's next message in their conversation (action f11314df): refused
 * while the AI has not answered the last one (rule 592df8c9), `busy` being
 * what the person's pending clicks say.
 */
export function writeInConversation(
	document: AiConversationsDocument,
	personId: string,
	conversationId: string,
	text: string,
	messageId: string,
	at: string,
	busy: boolean
): Outcome<{ readonly conversation: AiConversation; readonly message: AiChatMessage }> {
	const bad = textRefusal(text);
	if (bad) return bad;
	const conversation = conversationOf(document, personId, conversationId);
	if (!conversation) return refuse(NOT_FOUND, true);
	if (busy) return refuse('Your AI is still on your last message.');
	const message: AiChatMessage = { id: messageId, role: 'person', text: text.trim(), at };
	const next = { ...conversation, updatedAt: at, messages: [...conversation.messages, message] };
	return { ok: true, conversation: next, message, document: replace(document, next) };
}

/** What Lyriks itself tells the AI in the conversation: a change that no longer lands, to correct (action 8c59300e). */
export function lyriksNote(
	document: AiConversationsDocument,
	personId: string,
	conversationId: string,
	text: string,
	messageId: string,
	at: string
): Outcome<{ readonly conversation: AiConversation; readonly message: AiChatMessage }> {
	const conversation = conversationOf(document, personId, conversationId);
	if (!conversation) return refuse(NOT_FOUND, true);
	const message: AiChatMessage = { id: messageId, role: 'lyriks', text, at };
	const next = { ...conversation, updatedAt: at, messages: [...conversation.messages, message] };
	return { ok: true, conversation: next, message, document: replace(document, next) };
}

/** What the AI says on its own: one question it waits on, or why it stopped (action cf381e92). */
export type AiTellAbout = 'question' | 'stopped';

/** The longest question or stop the AI's own conversation keeps (parameter text of action cf381e92). */
export const MAX_AI_TELL_LENGTH = 2000;

/**
 * The AI, working on the project, asks the person on its own or says why it
 * stopped (actions 385983f9, 559ba487): a new conversation of the person's,
 * opened by the AI, its words the first message, so the person reads and
 * answers it on their pages and never in the AI client's chat alone.
 */
export function startAiConversation(
	document: AiConversationsDocument,
	personId: string,
	input: { readonly text: string; readonly about: AiTellAbout; readonly context: AiChatContext | null },
	ids: { readonly conversationId: string; readonly messageId: string },
	at: string
): Outcome<{ readonly conversation: AiConversation; readonly message: AiChatMessage }> {
	const text = input.text.trim().slice(0, MAX_AI_TELL_LENGTH);
	if (!text) return refuse('text is required: the question, or why you stop, in a sentence or two.');
	const message: AiChatMessage = { id: ids.messageId, role: 'ai', text, at, ...(input.about === 'question' ? { asks: true as const } : { stopped: true as const }) };
	const conversation: AiConversation = {
		id: ids.conversationId,
		personId,
		title: titleOf(text),
		context: input.context,
		startedAt: at,
		updatedAt: at,
		messages: [message],
		openedBy: 'ai'
	};
	return { ok: true, conversation, message, document: pruned({ ...document, conversations: [...document.conversations, conversation] }, personId) };
}

/** The person opened their conversation (action f08d6986): why their AI stopped is read from then on (rule fc2ad132). */
export function markSeen(document: AiConversationsDocument, personId: string, conversationId: string, at: string): Outcome<{ readonly conversation: AiConversation }> {
	const conversation = conversationOf(document, personId, conversationId);
	if (!conversation) return refuse(NOT_FOUND, true);
	const next = { ...conversation, seenAt: at };
	return { ok: true, conversation: next, document: replace(document, next) };
}

/**
 * Whether the conversation waits on its person (state conversation.needsYou):
 * their AI's question not answered yet, or why it stopped not read since it
 * came. Writing back settles both (effect bc86331d): the last message is then
 * the person's.
 */
export function needsYou(conversation: AiConversation): boolean {
	const last = conversation.messages[conversation.messages.length - 1];
	if (!last || last.role !== 'ai') return false;
	if (last.asks) return true;
	return !!last.stopped && !(conversation.seenAt && conversation.seenAt >= last.at);
}

function updateMessage(
	document: AiConversationsDocument,
	personId: string,
	conversationId: string,
	messageId: string,
	change: (m: AiChatMessage) => AiChatMessage | Refusal,
	at?: string
): Outcome<{ readonly conversation: AiConversation; readonly message: AiChatMessage }> {
	const conversation = conversationOf(document, personId, conversationId);
	if (!conversation) return refuse(NOT_FOUND, true);
	const current = conversation.messages.find((m) => m.id === messageId);
	if (!current) return refuse('This message is not in the conversation.');
	const changed = change(current);
	if ('ok' in changed) return changed;
	const next = { ...conversation, ...(at ? { updatedAt: at } : {}), messages: conversation.messages.map((m) => (m.id === messageId ? changed : m)) };
	return { ok: true, conversation: next, message: changed, document: replace(document, next) };
}

/** The person took a waiting message back (action 2d5ce3ce); the click itself is withdrawn by the session. */
export function markWithdrawn(document: AiConversationsDocument, personId: string, conversationId: string, messageId: string) {
	return updateMessage(document, personId, conversationId, messageId, (m) =>
		m.role !== 'person' ? refuse('Only your own message is taken back.') : { ...m, withdrawn: true as const }
	);
}

/** What the AI sends with its answer in a conversation. */
export interface AiChatAnswer {
	readonly text: string;
	readonly asks?: boolean;
	readonly place?: AiChatPlace;
	readonly proposal?: Omit<AiChatProposal, 'state' | 'errors' | 'decidedAt'>;
}

/** Whether a proposal the AI sends is well formed, before any dry run. */
export function proposalShapeRefusal(proposal: AiChatAnswer['proposal']): string | null {
	if (!proposal) return null;
	if (!proposal.featureId.trim()) return 'A change names the feature it writes: proposal.featureId.';
	if (!proposal.summary.trim()) return 'Say what the change does in the person\'s words: proposal.summary.';
	if (proposal.operations.length === 0) return 'A change carries its operations: proposal.operations (the apply_behavior_batch vocabulary).';
	return null;
}

/**
 * The AI's answer reads in the conversation (actions 07f42516, 2bba8f8b,
 * 8459c0e1): an answer, a question back, and when it carries a change, the
 * card Proposed change; the dry run already passed, the caller refused it to
 * the AI otherwise (rule 45810bdd).
 */
export function addAiAnswer(
	document: AiConversationsDocument,
	personId: string,
	conversationId: string,
	answer: AiChatAnswer,
	messageId: string,
	at: string
): Outcome<{ readonly conversation: AiConversation; readonly message: AiChatMessage }> {
	const conversation = conversationOf(document, personId, conversationId);
	if (!conversation) return refuse(NOT_FOUND, true);
	if (!answer.text.trim()) return refuse('An answer says something.');
	const shape = proposalShapeRefusal(answer.proposal);
	if (shape) return refuse(shape);
	const message: AiChatMessage = {
		id: messageId,
		role: 'ai',
		text: answer.text.trim(),
		at,
		...(answer.asks ? { asks: true as const } : {}),
		...(answer.place && isAnchor(answer.place.anchor) ? { place: { anchor: answer.place.anchor, title: answer.place.title.trim() || answer.place.anchor } } : {}),
		...(answer.proposal ? { proposal: { ...answer.proposal, state: 'proposed' as const } } : {})
	};
	const next = { ...conversation, updatedAt: at, messages: [...conversation.messages, message] };
	return { ok: true, conversation: next, message, document: replace(document, next) };
}

/** The proposal a message carries, waiting for a decision (rules f0dc2fa8, 3a78bf65). */
export function waitingProposal(conversation: AiConversation, messageId: string): AiChatProposal | null {
	const proposal = conversation.messages.find((m) => m.id === messageId)?.proposal;
	return proposal && proposal.state === 'proposed' ? proposal : null;
}

/** Validate wrote it, Reject set it aside, or a new dry run found it no longer landing (actions 16be1952, f1e5e330, 8c59300e). */
export function decideProposal(
	document: AiConversationsDocument,
	personId: string,
	conversationId: string,
	messageId: string,
	state: Exclude<ProposalState, 'proposed'>,
	at: string,
	errors: readonly string[] = []
) {
	return updateMessage(
		document,
		personId,
		conversationId,
		messageId,
		(m) =>
			!m.proposal || m.proposal.state !== 'proposed'
				? refuse('Nothing waits for your validation.')
				: { ...m, proposal: { ...m.proposal, state, decidedAt: at, ...(errors.length ? { errors } : {}) } },
		at
	);
}

/** A message became a topic on a block (action deb39290); once only (rule c2de7814). */
export function markPublished(document: AiConversationsDocument, personId: string, conversationId: string, messageId: string, published: AiChatPublished) {
	return updateMessage(document, personId, conversationId, messageId, (m) => (m.published ? refuse('Already published.') : { ...m, published }));
}

/** Where a message may be published: the block Lyriks suggests, the one the conversation was asked from, the Overview (criterion bbab6a2f). */
export function publishPlaces(conversation: AiConversation, messageId: string): (AiChatPlace & { readonly suggested?: true })[] {
	const message = conversation.messages.find((m) => m.id === messageId);
	const suggested = message?.place ?? [...conversation.messages].reverse().find((m) => m.role === 'ai' && m.place)?.place;
	const places: (AiChatPlace & { suggested?: true })[] = [];
	const add = (p: AiChatPlace | undefined, flag = false) => {
		if (p && !places.some((q) => q.anchor === p.anchor)) places.push({ ...p, ...(flag ? { suggested: true as const } : {}) });
	};
	add(suggested, true);
	add(conversation.context?.anchor ? { anchor: conversation.context.anchor, title: conversation.context.title } : undefined);
	add({ anchor: 'overview:what', title: 'Overview' });
	return places;
}

/** Where the last message of a conversation stands, as the page and its list read it (state chat.turn). */
export type ChatTurn = 'none' | 'waiting' | 'taken' | 'answered' | 'asked_back' | 'answered_nothing' | 'withdrawn';

/** What the session says of the click a message waits on: its state, and whether it was let go with nothing written. */
export interface ChatClickState {
	readonly state: string;
	readonly answeredNothing?: true;
}

/**
 * The turn of a conversation, from its messages and the click its last message
 * to the AI (the person's, or a note of Lyriks) waits on.
 */
export function chatTurn(conversation: AiConversation, clickOf: (messageId: string) => ChatClickState | null): ChatTurn {
	const last = conversation.messages[conversation.messages.length - 1];
	if (!last) return 'none';
	if (last.role === 'ai') return last.asks ? 'asked_back' : 'answered';
	if (last.withdrawn) return 'withdrawn';
	const click = clickOf(last.id);
	if (!click || click.state === 'waiting') return 'waiting';
	if (click.state === 'taken') return 'taken';
	if (click.state === 'answered') return click.answeredNothing ? 'answered_nothing' : 'taken';
	return 'withdrawn';
}

/** Whether the AI still owes an answer in the conversation: the field sends nothing then (rule 592df8c9). */
export const chatBusy = (turn: ChatTurn): boolean => turn === 'waiting' || turn === 'taken';

/**
 * Whether a message of the person reached their AI, said under it (criterion
 * 03172878): waiting for an AI, taken (delivered, the AI reads it), answered,
 * let go with nothing written, withdrawn, or lost (no click holds it).
 */
export type MessageDelivery = 'waiting' | 'taken' | 'answered' | 'nothing' | 'withdrawn' | 'lost';

export function deliveryOf(message: AiChatMessage, click: ChatClickState | null): MessageDelivery {
	if (message.withdrawn) return 'withdrawn';
	if (!click) return 'lost';
	if (click.state === 'waiting') return 'waiting';
	if (click.state === 'taken') return 'taken';
	if (click.state === 'answered') return click.answeredNothing ? 'nothing' : 'answered';
	return 'withdrawn';
}

/** Whether a change of the conversation was written into the specification: it is then kept (state conversation.wroteSpec). */
export const wroteSpec = (conversation: AiConversation): boolean => conversation.messages.some((m) => m.proposal?.state === 'applied');

/**
 * The person deletes one of their conversations for good (action 98e5712a):
 * never someone else's (rule 6dfd8459), never one whose change was written
 * into the specification, kept as the trace of why it changed (rule a0fbcf19).
 * Whether the AI reads a message of it is the caller's to check (rule 6c6dcbf9).
 */
export function deleteConversation(document: AiConversationsDocument, personId: string, conversationId: string): Outcome<object> {
	const conversation = conversationOf(document, personId, conversationId);
	if (!conversation) return refuse(NOT_FOUND, true);
	if (wroteSpec(conversation)) return refuse('This conversation changed the specification: it is kept as the trace of why.');
	return { ok: true, document: { ...document, conversations: document.conversations.filter((c) => c.id !== conversationId) } };
}
