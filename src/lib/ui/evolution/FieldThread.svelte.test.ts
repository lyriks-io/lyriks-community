import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { NO_SESSION_SENTENCE } from '$domain/evolution';
import FieldThread from './FieldThread.svelte';
import { relativeWhen } from './relative-when';

/** The comments of an answer read as topics, each with its replies and where it stands (ac-evo-fthread-look). */
const base = {
	label: 'Ce que le produit refuse',
	members: [
		{ id: 'ana', name: 'Ana Martin', jobs: ['Product'] },
		{ id: 'ben', name: 'Ben Roux' }
	],
	actorId: 'ana',
	canComment: true,
	onpost: async () => true,
	onrule: async () => true
};
const message = { id: 'm1', author: 'ana', authorKind: 'person', body: 'Et pour les gâteaux sans gluten ?', postedAt: '2026-10-20T10:00:00.000Z' };

describe('the comments of an answer [criterion:ac-leaf-ac-evo-fthread-look]', () => {
	it('reads each topic with its author, their job and where it stands, and offers to reply, validate or resolve it', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [message] } });
		expect(body).toContain('Et pour les gâteaux sans gluten ?');
		expect(body).toContain('Ana Martin');
		expect(body).toContain('· Product');
		expect(body).toContain('· Open');
		for (const act of ['>Reply<', '>Validate<', '>Resolve<']) expect(body).toContain(act);
		expect(body).not.toContain('No open topics.');
	});

	it('says there is no open topic when nothing is said yet', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [] } });
		expect(body).toContain('No open topics.');
		expect(body).toContain('>Send<');
	});

	it('lists the replies under their topic and counts them on its Reply button [criterion:ac-leaf-ac-evo-fthread-reply]', () => {
		const reply = { id: 'm2', author: 'ben', authorKind: 'person', body: 'Oui, sur commande.', postedAt: '2026-10-20T11:00:00.000Z', replyTo: 'm1' };
		const again = { id: 'm3', author: 'ana', authorKind: 'person', body: 'Avec quel supplément ?', postedAt: '2026-10-20T12:00:00.000Z', replyTo: 'm2' };
		const { body } = render(FieldThread, { props: { ...base, messages: [message, reply, again] } });
		expect(body).toContain('Reply (2)');
		expect(body.indexOf('Oui, sur commande.')).toBeGreaterThan(body.indexOf('Et pour les gâteaux sans gluten ?'));
		// A reply to a reply says whom it answers.
		expect(body).toContain('↳ to Ben Roux');
	});

	it('folds the resolved topics behind one link and reads a validated one as such', () => {
		const resolved = { ...message, ruling: { state: 'resolved' as const, by: 'ben', at: '2026-10-21T10:00:00.000Z' } };
		const validated = { id: 'm4', author: 'ben', authorKind: 'person', body: 'Le minimum est de 6 parts.', postedAt: '2026-10-20T13:00:00.000Z', ruling: { state: 'validated' as const, by: 'ana', at: '2026-10-21T10:00:00.000Z' } };
		const { body } = render(FieldThread, { props: { ...base, messages: [resolved, validated] } });
		expect(body).not.toContain('Et pour les gâteaux sans gluten ?');
		expect(body).toContain('Show 1 comment(s) resolved');
		expect(body).toContain('· ✓ Validated');
		expect(body).toContain('Le minimum est de 6 parts.');
	});
});

describe('Comment and Ask your AI on a new topic, one Reply on every reply [criterion:ac-leaf-ac-evo-live-one-box]', () => {
	const ask = { refusal: null, clickOf: () => null, run: async () => true };
	const noSession = { ...ask, refusal: NO_SESSION_SENTENCE };
	const question = { id: 'a1', author: 'ana', authorKind: 'ai_client', body: 'Who asks for it?', postedAt: '2026-10-20T10:00:00.000Z', awaitsAnswer: true as const };
	const colleague = { id: 'p1', author: 'ben', authorKind: 'person', body: 'Les traiteurs aussi ?', postedAt: '2026-10-20T09:00:00.000Z' };
	const exchange = { id: 'x1', author: 'ana', authorKind: 'person', body: 'Que manque-t-il ?', postedAt: '2026-10-20T08:00:00.000Z', privateTo: 'ana' };
	/** The class of the button whose text is given, read from the server render. */
	const buttonClass = (body: string, text: string) => [...body.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].find((m) => m[2].includes(text))?.[1] ?? '';

	it('in session, a new topic offers Comment, which Enter sends, and Ask your AI', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [], ask } });
		expect(body).toContain('>Comment<');
		expect(body).toContain('Ask your AI');
		expect(body).toContain('Write a comment, or ask your AI… (Enter to comment');
		expect(buttonClass(body, 'Comment')).toContain('bg-evo-ink');
		expect(body).not.toContain('Send to your AI');
	});

	it('a topic the AI opened is replied to or resolved, never validated', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [question], ask } });
		expect(body).toContain('>Reply<');
		expect(body).toContain('>Resolve<');
		expect(body).not.toContain('>Validate<');
		expect(body).toContain('Lyriks waits for your answer');
	});

	it('a conversation between people offers Reply alone, never Ask your AI beside it', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [colleague], ask } });
		expect(body).toContain('>Reply<');
		expect(body).not.toContain('Ask your AI');
		expect(body).not.toContain('>Comment<');
	});

	it('without a session, Ask your AI is still there, greyed, saying a click copies the prompt [criterion:ac-leaf-ac-evo-live-no-session]', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [], ask: noSession } });
		expect(body).toContain(`aria-label="Ask your AI: ${NO_SESSION_SENTENCE}"`);
		expect(buttonClass(body, 'Ask your AI')).toContain('text-evo-faint');
		expect(body).toContain('>Comment<');
	});

	it('a private exchange with the AI reads as such and offers to make it a comment', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [exchange], ask, onpublish: async () => true } });
		expect(body).toContain('Only you and your AI');
		expect(body).toContain('Make it a comment');
	});

	it('outside a request page there is no AI to ask: Send alone', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [] } });
		expect(body).toContain('>Send<');
		expect(body).not.toContain('Ask your AI');
	});
});

describe('when a message was said', () => {
	const now = new Date('2026-10-23T15:00:00');
	it('reads like a conversation', () => {
		expect(relativeWhen('2026-10-23T14:59:40', now)).toBe('just now');
		expect(relativeWhen('2026-10-23T14:48:00', now)).toBe('12 min ago');
		expect(relativeWhen('2026-10-23T12:00:00', now)).toBe('3 h ago');
		expect(relativeWhen('2026-10-22T09:00:00', now)).toBe('yesterday');
		expect(relativeWhen('2026-10-17T09:00:00', now)).toBe('17 Oct');
	});
});

describe("the AI's question offers its answers as buttons [criterion:ac-leaf-ac-evo-live-choices]", () => {
	const ask = { refusal: null, clickOf: () => null, run: async () => true };
	const asked = { id: 'a1', author: 'ana', authorKind: 'ai_client', body: 'Does the loyalty card exist in the shop?', postedAt: '2026-10-20T10:00:00.000Z', awaitsAnswer: true as const };

	it('one answer: one button each, a click sends it', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [{ ...asked, choices: ['Yes', 'No'] }], ask } });
		expect(body).toContain('aria-label="Your answer"');
		for (const choice of ['>Yes<', '>No<']) expect(body).toContain(choice);
		expect(body).not.toContain('type="checkbox"');
	});

	it('several answers: boxes to tick and one Send', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [{ ...asked, body: 'Which channels do customers use?', choices: ['Shop', 'Phone', 'App'], multiple: true as const }], ask } });
		expect(body).toContain('aria-label="Tick your answers"');
		expect(body.match(/type="checkbox"/g)).toHaveLength(3);
		expect(body).toContain('Send');
	});

	it('a reply always says whom it answers, the reader’s as the AI’s [criterion:ac-leaf-ac-evo-fthread-reply]', () => {
		const reply = { id: 'p1', author: 'ana', authorKind: 'person', body: 'Yes', postedAt: '2026-10-20T10:01:00.000Z', replyTo: 'a1' };
		const { body } = render(FieldThread, { props: { ...base, messages: [asked, reply], ask } });
		expect(body).toContain('↳ to the AI assistant');
	});
});

describe("the AI's suggestion, shaped like its place [criterion:ac-evo-live-comment-suggests]", () => {
	const offer = {
		id: 'ai1',
		author: 'ana',
		authorKind: 'ai_client',
		body: 'Voici la course au score, telle que décidée.',
		postedAt: '2026-10-30T09:00:00.000Z',
		suggests: [
			{ fieldPath: 'step.functional_spec.description', value: 'Les joueurs choisissent « 2 joueurs ».\nChacun pilote sa pièce.' },
			{ fieldPath: 'step.technical_spec.description', value: 'Tout reste dans le navigateur.' }
		]
	};

	it('reads each line with its kind under the section it would write, with a link to individual review in Solution', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [offer], ondecide: async () => true } });
		expect(body).toContain('2.1 Functional requirements');
		expect(body).toContain('2.2 Technical requirements');
		expect(body).toContain('>Journey<');
		expect(body).toContain('>Constraint<');
		expect(body).toContain('Chacun pilote sa pièce.');
		expect(body).toContain('Review each proposed requirement in its category in Solution.');
		expect(body).not.toContain('> Accept');
		expect(body).not.toContain('> Refuse');
	});

	it('offers no decision to who may not write', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [offer], ondecide: null } });
		expect(body).toContain('Tout reste dans le navigateur.');
		expect(body).not.toContain('> Accept');
	});

	it('reads who decided it once decided', () => {
		const accepted = { ...offer, suggestion: { state: 'accepted' as const, by: 'ana', at: '2026-10-30T09:05:00.000Z' } };
		const { body } = render(FieldThread, { props: { ...base, messages: [accepted], ondecide: async () => true } });
		expect(body).toContain('Review each proposed requirement in its category in Solution.');
		expect(body).not.toContain('Writes nothing');
	});
});

describe('comments that hold a topic keep the box to start another behind Add a comment [criterion:6ef1230e]', () => {
	const ask = { refusal: null, clickOf: () => null, run: async () => true };

	it('a thread with a topic shows Add a comment where the box was', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [message], ask } });
		expect(body).toContain('>Add a comment<');
		expect(body).not.toContain('aria-label="Open a new topic"');
		expect(body).not.toContain('Ask your AI');
	});

	it('a thread with a resolved topic only keeps it behind the link too', () => {
		const resolved = { ...message, ruling: { state: 'resolved' as const, by: 'ben', at: '2026-10-21T10:00:00.000Z' } };
		const { body } = render(FieldThread, { props: { ...base, messages: [resolved] } });
		expect(body).toContain('>Add a comment<');
		expect(body).not.toContain('aria-label="Open a new topic"');
	});

	it('empty comments open on the box at once, with no link', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [], ask } });
		expect(body).toContain('aria-label="Open a new topic"');
		expect(body).not.toContain('>Add a comment<');
		// Cancel stands only beside a box Add a comment opened.
		expect(body).not.toContain('>Cancel<');
	});

	it('who may not comment sees no link', () => {
		const { body } = render(FieldThread, { props: { ...base, messages: [message], canComment: false } });
		expect(body).not.toContain('Add a comment');
	});
});
