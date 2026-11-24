import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { answerStepAct, decideThreadSuggestionAct, postOnFieldAct, updateStepDescriptionAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest, type FieldThreadMessage } from './draft';
import { latestThread } from './field-thread';
import { latestVersion } from './field-versions';
import { canDecideSuggestion, suggestionPlaceOf, suggestionPlaces, suggestionStateOf, requirementCandidates } from './thread-suggestion';
import { waitingQuestionOf } from './live-exchange';

/**
 * A comment is text only (rule 5f9257fe): the AI writes a text of a step at
 * its place in any workspace, as a version a person validates. The texts an
 * earlier AI message offered (ac-evo-live-comment-suggests) are still decided
 * line by line. Owner feedback of 2026-11-23, replacing that of 2026-10-30.
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

const OFFERED = [
	{ fieldPath: 'step.functional_spec.description', value: JOURNEY },
	{ fieldPath: 'step.functional_spec.refusals', value: RULES }
];
const TEXT_ONLY = 'A comment is text only: write the text of a step at its place (update_step_description, answer_step), or say what you suggest in plain words.';

/** An earlier AI reply in the thread of 2.1, stored with the journey and the rules of the Functional spec it offered. */
function suggested(): { request: EvolutionRequest; message: FieldThreadMessage } {
	const posted = ok(postOnFieldAct(ctxFor(ai), createEvolutionRequest(), 'step.functional_spec.description', null, 'Voici la course au score, telle que décidée.'));
	const request = { ...posted, fieldThreads: posted.fieldThreads.map((t) => ({ ...t, messages: t.messages.map((m) => ({ ...m, suggests: OFFERED })) })) };
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

});

describe('a comment is text only [rule:5f9257fe]', () => {
	it('a comment that offers texts to accept is refused, from the AI or a person, alone or in a team [unspa:4cf8fde8:1f059d7f:cf6bcd13]', () => {
		const request = createEvolutionRequest();
		for (const ctx of [ctxFor(ai), ctxFor(ai, true), ctxFor(dylan)])
			expect(reasonOf(postOnFieldAct(ctx, request, 'step.solution.description', null, 'Voici le texte', null, { offersTexts: true }))).toBe(TEXT_ONLY);
	});

	it('a comment in plain words is posted', () => {
		const posted = ok(postOnFieldAct(ctxFor(ai), createEvolutionRequest(), 'step.solution.description', null, 'Je propose de limiter les projets actifs.'));
		expect(latestThread(posted, 'step.solution.description')!.messages.at(-1)!.suggests).toBeUndefined();
	});
});

describe('the texts an earlier AI message offered (ac-evo-live-comment-suggests)', () => {
	it('carry its texts, each at its place, waiting for a person', () => {
		const { message } = suggested();
		expect(message.suggests).toHaveLength(2);
		expect(suggestionStateOf(message)).toBe('waiting');
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
  expect(reasonOf(postOnFieldAct(ctxFor(ai), read, 'step.functional_spec.description', null, 'Again', null, { offersTexts: true }))).toBe(TEXT_ONLY);
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
 it('a normal human reply is never deduplicated as a requirement', () => {
  const { request, message } = suggested();
  const replied = ok(postOnFieldAct(ctxFor(dylan), request, 'step.functional_spec.description', null, 'Again', message.id));
  expect(replied.fieldThreads[0].messages).toHaveLength(2);
 });
});

describe('in any workspace the AI writes a step at its place', () => {
	it('in a team it writes the version a person validates [unspa:280520a6:d1003cef:3f1452a8]', () => {
		const request = createEvolutionRequest();
		expect(ok(updateStepDescriptionAct(ctxFor(ai), request, { step: 'technical_spec', description: 'Tout dans le navigateur.' })).stepDescriptions.technical_spec).toBe('Tout dans le navigateur.');
		expect(ok(answerStepAct(ctxFor(ai), request, { step: 'functional_spec', question: 'refusals', answer: RULES })).stepAnswers.functional_spec.refusals).toBe(RULES);
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
