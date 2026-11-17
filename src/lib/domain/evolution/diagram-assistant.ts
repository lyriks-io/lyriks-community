import type { SpecLanguage } from '$domain/language';
import { isEmptyDiagram, PRODUCT_LANE, readFunctionalDiagram, functionalDiagramProblems, type DiagramProblem } from './functional-diagram';
import { isEmptyTechnicalDiagram, readTechnicalDiagram, technicalDiagramProblems } from './technical-diagram';
import type { PairedStep } from './functional-sync';

/**
 * What the built-in assistant is asked when a person has it draw a step's
 * diagram from the texts (ac-evo-diagram-assistant), and how its answer is
 * checked before anything is written. Reading prose takes a model; everything
 * around it is ours: the grammar it must answer in, the texts it reads, and
 * the reader that decides whether the drawing reads.
 */

const FUNCTIONAL_GRAMMAR = `actor <Name>
system <Name>
use case <Name>: <who takes part>, <who takes part>
flow <Use case name>
  <Who>: <what they do>
    refused when <condition>: <what then happens>
    goes wrong when <condition>: <what then happens>
states <Thing>
  <state> -> <state>: <what causes it>

- actor is a person who takes part; system is another system the product works with. Declare each one before it is used.
- A use case is something the product lets someone do, named with a verb; it lists everyone who takes part, by their declared names.
- A flow walks one use case through, one step per line in the order things happen. <Who> is a declared actor or system taking part in that use case, or ${PRODUCT_LANE} for what the product does itself (${PRODUCT_LANE} is never declared).
- "refused when" and "goes wrong when" lines belong to the step just above them: what the product refuses there, and what can go wrong there, each with what then happens.
- A states block lists the transitions of one thing whose state the change moves, its first state first.

Example:
actor Baker
system SMS provider

use case Mark a bag ready: Baker, SMS provider

flow Mark a bag ready
  Baker: marks the bag ready
  ${PRODUCT_LANE}: sends one text with the pickup slot
    refused when the order has no phone number: the baker sees "no number on file"
    goes wrong when the SMS provider is down: the text is retried for an hour

states Order
  placed -> ready: Mark a bag ready
  ready -> collected: the customer picks it up`;

const TECHNICAL_GRAMMAR = `component <Name>
component <Name>: new
store <Name>
store <Name>: new
system <Name>
system <Name>: new
actor <Name>
link <From> -> <To>: <what goes through it>
note <Element>: <a constraint or a risk known>
sequence <Name>
  <From> -> <To>: <a call>
  <From> --> <To>: <an answer>
    goes wrong when <condition>: <what then happens>

- component is a part of the product the change involves, store is where its data lives, system is another system it depends on, actor is a person who uses it. Add ": new" to what the change adds (never to an actor). Declare each one before it is used.
- A link is an arrow between two declared elements, saying what goes through it.
- A note carries one constraint or one risk on the element it bears on.
- A sequence is an exchange that matters, one message per line in order: -> for a call, --> for an answer. A "goes wrong when" line belongs to the message just above it.

Example:
actor Baker
component Order service
component SMS sender: new
store SMS deliveries: new
system SMS provider: new

link Order service -> SMS sender: asks for a text
link SMS sender -> SMS provider: sends the text over HTTPS
link SMS sender -> SMS deliveries: records each attempt

note SMS provider: 0.05 € per text; never more than one per order

sequence Mark a bag ready
  Baker -> Order service: marks the bag ready
  Order service -> SMS sender: asks for a text
  SMS sender -> SMS provider: sends the text
    goes wrong when no answer within 10 s: retried every 5 minutes for one hour
  SMS provider --> SMS sender: delivered`;

const LANGUAGE_WORD: Readonly<Record<SpecLanguage, string>> = { en: 'English', fr: 'French' };

const TEXT_LABELS: Readonly<Record<string, string>> = {
	description: 'How it goes (the description)',
	refusals: 'What the product refuses, and why',
	failures: 'What happens when something goes wrong'
};

/** What each text is, named for the assistant that rewrites it from the diagram. */
const TEXT_TO_REWRITE: Readonly<Record<PairedStep, Readonly<Record<string, string>>>> = {
	functional_spec: TEXT_LABELS,
	technical_spec: { description: 'The technical constraints and risks known (the description)' }
};

export interface DiagramAssistantInput {
	readonly step: PairedStep;
	/** The texts the diagram is paired with, keyed like its alignment. */
	readonly texts: Readonly<Record<string, string>>;
	/** The notation as it stands, empty when nothing is drawn yet. */
	readonly current: string;
	readonly productName: string;
	readonly lang: SpecLanguage;
}

export interface DiagramAssistantPrompt {
	readonly system: string;
	readonly prompt: string;
}

/** The instruction and the texts the assistant draws from, in one request. */
export function diagramAssistantPrompt(input: DiagramAssistantInput): DiagramAssistantPrompt {
	const functional = input.step === 'functional_spec';
	const system = [
		`You draw the UML diagram of ${functional ? "the Functional spec of a change to a software product: who takes part, what the product lets them do, how each thing goes, and the states it moves" : 'the Technical spec of a change to a software product: the parts it involves and adds, how they talk, and what can go wrong'}. You draw it from the texts a person wrote, in a short text notation that the product lays out itself.`,
		'Answer with the notation and nothing else: no introduction, no explanation, no code fence.',
		'',
		'The notation, one line per element:',
		functional ? FUNCTIONAL_GRAMMAR : TECHNICAL_GRAMMAR,
		'',
		'How to draw it:',
		'- Draw what the texts say and nothing more: no person, system, step, rule, part or state they do not imply. Where the texts are silent, leave it out.',
		'- Names are short and never contain a colon.',
		`- Write every name and every sentence in ${LANGUAGE_WORD[input.lang]}; the keywords of the notation stay in English.`,
		'- When a diagram already exists, keep its names and its order wherever the texts still agree with it, and change only what the texts changed.'
	].join('\n');
	const texts = Object.entries(input.texts)
		.filter(([, value]) => value.trim() !== '')
		.map(([key, value]) => `<${key} title="${TEXT_LABELS[key] ?? key}">\n${value.trim()}\n</${key}>`);
	const prompt = [
		`The product: ${input.productName || 'the product'}.`,
		'',
		`The texts of the ${functional ? 'Functional spec' : 'Technical spec'}:`,
		...texts,
		'',
		input.current.trim() === ''
			? 'There is no diagram yet: draw it.'
			: `The diagram as it stands, to redraw so that it follows the texts:\n<diagram>\n${input.current.trim()}\n</diagram>`
	].join('\n');
	return { system, prompt };
}

/** The same request, with the drawing that did not read and what was wrong with it. */
export function diagramAssistantRetry(first: DiagramAssistantPrompt, answer: string, problems: readonly DiagramProblem[]): DiagramAssistantPrompt {
	const listed = problems.map((p) => `- ${p.line !== null ? `line ${p.line}: ` : ''}${p.message}`).join('\n');
	return {
		system: first.system,
		prompt: `${first.prompt}\n\nYour previous answer did not read cleanly:\n<previous>\n${answer}\n</previous>\nWhat was wrong with it:\n${listed}\n\nAnswer again with the whole corrected notation, and nothing else.`
	};
}

export interface TextAssistantInput {
	readonly step: PairedStep;
	/** The text to rewrite, by its key: description, refusals or failures. */
	readonly key: string;
	/** The text as it stands, written against the earlier diagram. */
	readonly current: string;
	/** The diagram the text was written against, and the diagram as it stands. */
	readonly before: string;
	readonly diagram: string;
	/** The step's other texts, for the words the person uses. */
	readonly others: Readonly<Record<string, string>>;
	readonly productName: string;
	readonly lang: SpecLanguage;
}

/**
 * What the built-in assistant is asked when a person has it rewrite a text the
 * diagram moved past (ac-evo-diagram-assistant): the text as it stands, the
 * diagram it was written against and the diagram now, so it changes only what
 * the diagram changed and keeps the person's words everywhere else.
 */
export function textAssistantPrompt(input: TextAssistantInput): DiagramAssistantPrompt {
	const functional = input.step === 'functional_spec';
	const listed = input.key === 'refusals' || input.key === 'failures';
	const shape = listed
		? '- One statement per line: the situation, then what then happens.'
		: functional
			? '- A few short paragraphs: who takes part, then how each thing goes, then what each thing goes through.'
			: '- A few short paragraphs: the parts involved and what is new, how they talk, what can go wrong, then the constraints and risks known.';
	const system = [
		`You rewrite one text of the ${functional ? 'Functional' : 'Technical'} spec of a change to a software product so that it says what the spec's UML diagram now says. The diagram is kept in a short text notation, one line per element:`,
		functional ? FUNCTIONAL_GRAMMAR : TECHNICAL_GRAMMAR,
		'',
		'Answer with the text and nothing else: no introduction, no explanation, no heading, no code fence.',
		'',
		'How to write it:',
		`- Write in ${LANGUAGE_WORD[input.lang]}, in plain prose a person reads, never in the notation.`,
		shape,
		"- Keep the person's words, sentences and order wherever the diagram still says the same thing; change only what the diagram changed, add what it adds, and drop what it no longer says.",
		'- Say nothing the diagram does not say.'
	].join('\n');
	const others = Object.entries(input.others)
		.filter(([, value]) => value.trim() !== '')
		.map(([key, value]) => `<${key} title="${TEXT_TO_REWRITE[input.step][key] ?? key}">\n${value.trim()}\n</${key}>`);
	const prompt = [
		`The product: ${input.productName || 'the product'}.`,
		'',
		`The text to rewrite: ${TEXT_TO_REWRITE[input.step][input.key] ?? input.key}.`,
		input.current.trim() === '' ? 'It is empty: write it from the diagram.' : `<text>\n${input.current.trim()}\n</text>`,
		...(input.before.trim() === '' ? [] : ['', `The diagram that text was written against:\n<before>\n${input.before.trim()}\n</before>`]),
		'',
		`The diagram now:\n<diagram>\n${input.diagram.trim()}\n</diagram>`,
		...(others.length > 0 ? ['', 'The other texts of the step, for the words the person uses:', ...others] : [])
	].join('\n');
	return { system, prompt };
}

/** The same request, after an answer that held no text. */
export function textAssistantRetry(first: DiagramAssistantPrompt): DiagramAssistantPrompt {
	return { system: first.system, prompt: `${first.prompt}\n\nYour previous answer held no text: answer with the whole rewritten text, and nothing else.` };
}

/** The notation inside an answer: a model that wraps it in a code fence anyway is read through it. */
export function notationOfAnswer(answer: string): string {
	const fenced = answer.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
	return (fenced ? fenced[1] : answer).trim();
}

export interface DrawingCheck {
	/** Every line read and something drawn: the drawing may be written. */
	readonly reads: boolean;
	/** Nothing at all left to point out: no second try is worth asking for. */
	readonly clean: boolean;
	readonly problems: readonly DiagramProblem[];
}

/**
 * Whether a drawing reads (ac-evo-diagram-assistant). A line the notation does
 * not read, or an answer that draws nothing, never reaches the request; a name
 * drawn without being declared is pointed out, as on the page, and worth a
 * second try, but a drawing that has only those still reads.
 */
export function checkDrawing(step: PairedStep, notation: string): DrawingCheck {
	const { empty, unread, unclear } = step === 'functional_spec' ? readingOfFunctional(notation) : readingOfTechnical(notation);
	const problems = [...(empty ? [{ line: null, message: 'The answer draws nothing: answer with the notation of the diagram.' }] : []), ...unread, ...unclear];
	return { reads: !empty && unread.length === 0, clean: problems.length === 0, problems };
}

function readingOfFunctional(notation: string) {
	const { diagram, problems } = readFunctionalDiagram(notation);
	return { empty: isEmptyDiagram(diagram), unread: problems, unclear: functionalDiagramProblems(diagram) };
}

function readingOfTechnical(notation: string) {
	const { diagram, problems } = readTechnicalDiagram(notation);
	return { empty: isEmptyTechnicalDiagram(diagram), unread: problems, unclear: technicalDiagramProblems(diagram) };
}
