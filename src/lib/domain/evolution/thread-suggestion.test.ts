import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { answerStepAct, decideThreadSuggestionAct, postOnFieldAct, updateStepDescriptionAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest, type FieldThreadMessage } from './draft';
import { latestThread } from './field-thread';
import { latestVersion } from './field-versions';
import { canDecideSuggestion, suggestionAllowed, suggestionPlaceOf, suggestionPlaces, suggestionStateOf, requirementCandidates } from './thread-suggestion';
import { waitingQuestionOf } from './live-exchange';

/**
 * The AI offers its texts in a message, shaped like the place it would write,
 * and a person accepts them in one click (ac-evo-live-comment-suggests); in a
 * workspace of several members it writes no version of a step itself
 * (ac-evo-live-shared-writes). Owner feedback of 2026-10-30.
 */

const dylan: Actor = { id: 'dylan@team.test', kind: 'person', role: 'admin', channel: 'page' };
const viewer: Actor = { id: 'vic@team.test', kind: 'person', role: 'viewer', channel: 'page' };
const ai: Actor = { id: 'dylan@team.test', kind: 'ai_client', role: 'admin', channel: 'ai_client' };

let counter = 0;
let minute = 0;
const ctxFor = (actor: Actor, soloWorkspace = false): ActContext => ({
	actor,
	at: `2026-10-30T09:${String(++minute).padStart(2, '0')}:00.000Z`,
	newId: () => `id-${++counter}`,
	soloWorkspace,
	validators: null
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome) => (outcome.ok ? null : outcome.reason);

const JOURNEY = 'Sur l\'accueil, les joueurs choisissent « 2 joueurs ».\nChacun pilote sa pièce avec ses touches.';
const RULES = 'Une touche d\'un joueur ne fait jamais bouger la pièce de l\'autre.';

/** The AI's reply in the thread of 2.1, offering the journey and the rules of the Functional spec. */
function suggested(): { request: EvolutionRequest; message: FieldThreadMessage } {
	const request = ok(
		postOnFieldAct(ctxFor(ai), createEvolutionRequest(), 'step.functional_spec.description', null, 'Voici la course au score, telle que décidée.', null, {
			writes: [
				{ fieldPath: 'step.functional_spec.description', value: JOURNEY },
				{ fieldPath: 'step.functional_spec.refusals', value: RULES }
			]
		})
	);
	const message = latestThread(request, 'step.functional_spec.description')!.messages.at(-1)!;
	return { request, message };
}

describe('the places a suggestion writes', () => {
	it('are the texts of a step: a description or a question, never a diagram', () => {
		expect(suggestionPlaceOf('step.technical_spec.description')).toEqual({ kind: 'description', step: 'technical_spec' });
		expect(suggestionPlaceOf('step.functional_spec.refusals')).toEqual({ kind: 'question', step: 'functional_spec', key: 'refusals' });
		expect(suggestionPlaceOf('step.functional_spec.diagram')).toBeNull();
		expect(suggestionPlaceOf('00-need.description')).toBeNull();
		expect(suggestionPlaces().map((p) => p.fieldPath)).toContain('step.solution.out_of_scope');
		expect(suggestionPlaces().some((p) => p.fieldPath.endsWith('.diagram'))).toBe(false);
	});

	it('are refused with the sentence the spec chose', () => {
		expect(suggestionAllowed([])).toMatchObject({ ok: false, reason: 'Name each place your text goes: writes [{ fieldPath, value }].' });
		expect(suggestionAllowed([{ fieldPath: '00-need.description', value: 'x' }])).toMatchObject({
			ok: false,
			reason: "The Need's verbatim stays the requester's words and a diagram is drawn: suggest a text of a step."
		});
		expect(suggestionAllowed([{ fieldPath: 'step.functional_spec.diagram', value: 'use case X' }]).ok).toBe(false);
		expect(suggestionAllowed([{ fieldPath: '01-origin.objective', value: 'x' }])).toMatchObject({ ok: false, reason: 'A field of a block takes a proposal: propose it there.' });
		expect(suggestionAllowed([{ fieldPath: 'step.solution.description', value: '' }])).toMatchObject({ ok: false, reason: 'Each place of a suggestion needs its value.' });
		expect(suggestionAllowed([{ fieldPath: 'step.solution.description', value: 'a' }, { fieldPath: 'step.solution.description', value: 'b' }]).ok).toBe(false);
	});
});

describe('the AI suggests in its message (ac-evo-live-comment-suggests)', () => {
	it('carries its texts, each at its place, waiting for a person', () => {
		const { message } = suggested();
		expect(message.suggests).toHaveLength(2);
		expect(suggestionStateOf(message)).toBe('waiting');
	});

	it('only the AI offers a suggestion; a person writes the step itself', () => {
		const outcome = postOnFieldAct(ctxFor(dylan), createEvolutionRequest(), 'step.solution.description', null, 'Ma version', null, {
			writes: [{ fieldPath: 'step.solution.description', value: 'x' }]
		});
		expect(reasonOf(outcome)).toBe('Only an AI offers its text as a suggestion: write it at its place.');
	});

	it('survives a save and a read', () => {
		const { request } = suggested();
		const read = parseEvolutionDraft({ requests: [request] }, 'tetris').requests[0];
		expect(latestThread(read, 'step.functional_spec.description')!.messages.at(-1)!.suggests).toEqual([
			{ fieldPath: 'step.functional_spec.description', value: JOURNEY },
			{ fieldPath: 'step.functional_spec.refusals', value: RULES }
		]);
	});
});

describe('requirements are decided individually [criterion:757c9f25]', () => {
 const choose = (request: EvolutionRequest, message: FieldThreadMessage, decision: 'accept' | 'refuse', fieldPath = 'step.functional_spec.description', line = JOURNEY.split('\n')[0], actor = dylan) => decideThreadSuggestionAct(ctxFor(actor), request, { messageId: message.id, decision, fieldPath, line });
 const candidates = (request: EvolutionRequest) => requirementCandidates(request.fieldThreads.flatMap((t) => t.messages));
 it('accepts only one chosen requirement, preserving written text and pending siblings [unspa:4cf8fde8:20ba1d64:a673a4ff]', () => {
  const { request, message } = suggested();
  const held = ok(updateStepDescriptionAct(ctxFor(dylan), request, { step: 'functional_spec', description: 'Already written.' }));
  const accepted = ok(choose(held, message, 'accept'));
  expect(accepted.stepDescriptions.functional_spec).toBe('Already written.\n' + JOURNEY.split('\n')[0]);
  expect(accepted.stepAnswers.functional_spec.refusals).toBe('');
  expect(accepted.fieldValidations).toEqual([]);
  expect(candidates(accepted).map((c) => c.state)).toEqual(['accepted', 'waiting', 'waiting']);
 });
 it('rejects one line, writes nothing and leaves siblings waiting [unspa:4cf8fde8:20ba1d64:bdcccdc8]', () => {
  const { request, message } = suggested();
  const refused = ok(choose(request, message, 'refuse'));
  expect(refused.stepDescriptions.functional_spec).toBe('');
  expect(candidates(refused).map((c) => c.state)).toEqual(['refused', 'waiting', 'waiting']);
 });
 it('a partial decision survives save/read and is never reset by an identical new message [unspa:4cf8fde8:20ba1d64:78142694]', () => {
  const { request, message } = suggested();
  const refused = ok(choose(request, message, 'refuse'));
  const read = parseEvolutionDraft({ requests: [refused] }, 'p').requests[0];
  expect(candidates(read)[0].state).toBe('refused');
  const replay = ok(postOnFieldAct(ctxFor(ai), read, 'step.functional_spec.description', null, 'Again', null, { writes: message.suggests }));
  expect(replay).toBe(read);
  const legacyReplay = { ...read, fieldThreads: read.fieldThreads.map((t) => ({ ...t, messages: [...t.messages, { ...message, id: 'replay', replyTo: message.id }] })) };
  expect(candidates(legacyReplay)[0].state).toBe('refused');
  expect(reasonOf(decideThreadSuggestionAct(ctxFor(dylan), legacyReplay, { messageId: 'replay', fieldPath: 'step.functional_spec.description', line: JOURNEY.split('\n')[0], decision: 'accept' }))).toBe('This requirement is already decided.');
 });
 it('never decides a whole bundle [unspa:4cf8fde8:20ba1d64:c23bfde2]', () => {
  const { request, message } = suggested();
  expect(reasonOf(decideThreadSuggestionAct(ctxFor(dylan), request, { messageId: message.id, decision: 'accept' }))).toBe('Choose one requirement to accept or reject.');
 });
 it('refuses a line not offered by that message [unspa:4cf8fde8:20ba1d64:0c8b094d]', () => {
  const { request, message } = suggested();
  expect(reasonOf(choose(request, message, 'accept', 'step.functional_spec.description', 'Invented.'))).toBe('This requirement is not offered by this message.');
 });
 it('the AI and a viewer decide nothing, including when alone', () => {
  const { request, message } = suggested();
  expect(reasonOf(choose(request, message, 'accept', undefined, undefined, ai))).toBe('A suggestion is accepted by a person: the AI never decides its own.');
  expect(reasonOf(choose(request, message, 'refuse', undefined, undefined, viewer))).toBe('A viewer reads and comments, but does not write.');
 });
 it('acceptance of another category changes only that answer', () => {
  const { request, message } = suggested();
  const accepted = ok(choose(request, message, 'accept', 'step.functional_spec.refusals', RULES));
  expect(accepted.stepAnswers.functional_spec.refusals).toBe(RULES);
  expect(accepted.stepDescriptions.functional_spec).toBe('');
  expect(latestVersion(accepted, 'step.functional_spec.refusals')?.by).toBe(dylan.id);
 });
 it('a legacy suggestion whose place was removed can still be rejected, while acceptance is refused', () => {
  const { request, message } = suggested();
  const retiredPath = 'step.solution.retired_kind';
  const legacy = { ...request, fieldThreads: request.fieldThreads.map((t) => ({ ...t, messages: [{ ...message, suggests: [{ fieldPath: retiredPath, value: 'Earlier requirement.' }] }] })) };
  expect(reasonOf(choose(legacy, message, 'accept', retiredPath, 'Earlier requirement.'))).toContain('No text of a step is named');
  const rejected = ok(choose(legacy, message, 'refuse', retiredPath, 'Earlier requirement.'));
  expect(candidates(rejected)[0].state).toBe('refused');
  expect(rejected.stepDescriptions.solution).toBe('');
 });

 it('a frozen write fails before storing a decision, but rejecting remains possible', () => {
  const { request, message } = suggested();
  expect(choose({ ...request, frozen: true, specVersion: 1 }, message, 'accept').ok).toBe(false);
  expect(choose({ ...request, frozen: true, specVersion: 1 }, message, 'refuse').ok).toBe(true);
  expect(message.requirementDecisions).toBeUndefined();
 });
 it('an accepted exact line is appended only once and all decisions settle their message', () => {
  const { request, message } = suggested();
  let next = ok(choose(request, message, 'accept'));
  next = ok(choose(next, message, 'refuse', 'step.functional_spec.description', JOURNEY.split('\n')[1]));
  next = ok(choose(next, message, 'refuse', 'step.functional_spec.refusals', RULES));
  expect(next.fieldThreads[0].messages[0].suggestion?.state).toBe('accepted');
  expect(next.stepDescriptions.functional_spec).toBe(JOURNEY.split('\n')[0]);
  expect(choose(next, message, 'accept').ok).toBe(false);
 });
 it('an identical AI replay leaves its decided discussion and message count untouched [unspa:4cf8fde8:1f059d7f:ac34a8b1]', () => {
  const { request, message } = suggested();
  const closed = { ...request, fieldThreads: request.fieldThreads.map((t) => ({ ...t, state: 'turned_into_change' as const, messages: [
   { ...message, ruling: { state: 'validated' as const, by: dylan.id, at: 'now' } },
   { id: 'reply', author: dylan.id, authorKind: 'person' as const, body: 'Already discussed.', postedAt: 'now', replyTo: message.id }
  ] })) };
  const replay = ok(postOnFieldAct(ctxFor(ai), closed, 'step.functional_spec.description', null, 'Retry', null, { writes: message.suggests }));
  expect(replay).toBe(closed);
  expect(replay.fieldThreads[0].messages).toHaveLength(2);
  expect(replay.fieldThreads[0].messages[0].ruling?.state).toBe('validated');
  expect(replay.fieldThreads[0].state).toBe('turned_into_change');
 });

 it('another persons private requirement never suppresses a public candidate', () => {
  const { request, message } = suggested();
  const hidden = { ...request, fieldThreads: request.fieldThreads.map((t) => ({ ...t, messages: t.messages.map((m) => ({ ...m, privateTo: 'other@team.test' })) })) };
  const posted = ok(postOnFieldAct(ctxFor(ai), hidden, 'step.functional_spec.description', null, 'Public candidate', null, { writes: message.suggests }));
  expect(posted.fieldThreads[0].messages).toHaveLength(2);
  expect(posted.fieldThreads[0].messages[1].suggests).toEqual(message.suggests);
 });

 it('a normal human reply is never deduplicated as a requirement', () => {
  const { request, message } = suggested();
  const replied = ok(postOnFieldAct(ctxFor(dylan), request, 'step.functional_spec.description', null, 'Again', message.id));
  expect(replied.fieldThreads[0].messages).toHaveLength(2);
 });
});

describe('in a workspace of several members the AI suggests a step (ac-evo-live-shared-writes)', () => {
	const SUGGEST = 'In a workspace of several members your text on a step is a suggestion the person accepts: post it with post_on_field and writes [{ fieldPath, value }].';

	it('its direct write on a step is refused with the sentence saying to suggest it', () => {
		const request = createEvolutionRequest();
		expect(reasonOf(updateStepDescriptionAct(ctxFor(ai), request, { step: 'technical_spec', description: 'Tout dans le navigateur.' }))).toBe(SUGGEST);
		expect(reasonOf(answerStepAct(ctxFor(ai), request, { step: 'functional_spec', question: 'refusals', answer: RULES }))).toBe(SUGGEST);
	});

	it('alone, it writes the version the person validates', () => {
		const wrote = ok(updateStepDescriptionAct(ctxFor(ai, true), createEvolutionRequest(), { step: 'technical_spec', description: 'Tout dans le navigateur.' }));
		expect(wrote.stepDescriptions.technical_spec).toBe('Tout dans le navigateur.');
	});

	it('a person writes a step in any workspace', () => {
		expect(ok(updateStepDescriptionAct(ctxFor(dylan), createEvolutionRequest(), { step: 'solution', description: 'Mode 2 joueurs.' })).stepDescriptions.solution).toBe(
			'Mode 2 joueurs.'
		);
	});
});

describe('a resolved topic asks nothing any more (ac-evo-fthread-resolved-closed)', () => {
	it("the AI's question in a resolved topic no longer waits", () => {
		const asked = ok(
			postOnFieldAct(ctxFor(ai), createEvolutionRequest(), 'step.solution.description', null, 'Même clavier ou en ligne ?', null, { asks: true, choices: ['Même clavier', 'En ligne'] })
		);
		const thread = latestThread(asked, 'step.solution.description')!;
		expect(waitingQuestionOf(thread.messages, dylan.id)?.body).toBe('Même clavier ou en ligne ?');
		const resolved = thread.messages.map((m) => ({ ...m, ruling: { state: 'resolved' as const, by: dylan.id, at: '2026-10-30T10:00:00.000Z' } }));
		expect(waitingQuestionOf(resolved, dylan.id)).toBeNull();
	});
});
