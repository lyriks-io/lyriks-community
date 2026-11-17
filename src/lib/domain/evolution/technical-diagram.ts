import { NBSP, type SpecLanguage } from '$domain/language';
import { sameName, type DiagramPlace, type DiagramProblem } from './functional-diagram';
import { linkSuffix, trailingLink, type DiagramLink } from './diagram-links';

/**
 * The diagram of the Technical spec, in UML (ac-evo-tech-uml): two views of
 * one drawing, chosen for the decisions a technical spec supports. Components
 * says what the change involves and adds to the architecture (its parts, the
 * stores where its data lives, the other systems it depends on, what goes
 * through each link) with the constraints and risks known as notes; Sequences
 * says who calls whom, in what order, and what happens when a call goes wrong.
 *
 * Like the Functional spec's, it is words arranged, kept as a notation that is
 * the value of an answer of the step (ac-evo-func-uml-text):
 *
 *   actor Baker
 *   component Order service
 *   component SMS sender: new
 *   store SMS deliveries: new
 *   system SMS provider: new
 *
 *   link SMS sender -> SMS provider: sends the text over HTTPS
 *
 *   note SMS provider: 0.05 € per text; never more than one per order
 *
 *   sequence Mark a bag ready
 *     Baker -> Order service: marks the bag ready
 *     Order service -> SMS sender: asks for a text
 *     SMS sender -> SMS provider: sends the text
 *       goes wrong when no answer within 10 s: retried every 5 minutes for one hour
 *     SMS provider --> SMS sender: delivered
 */

export type TechElementKind = 'actor' | 'component' | 'store' | 'system';
export const TECH_ELEMENT_KINDS: readonly TechElementKind[] = ['actor', 'component', 'store', 'system'];
export interface TechElement {
	readonly name: string;
	readonly kind: TechElementKind;
	/** Added by the change: what a decision brings. A person is never new to the architecture. */
	readonly isNew: boolean;
	/** A component's feature or a store's table the product already has: then it is never new (ac-evo-tech-uml-link). */
	readonly link?: DiagramLink;
}
export interface TechLink {
	readonly from: string;
	readonly to: string;
	/** What goes through it; may be empty. */
	readonly label: string;
}
/** A constraint or a risk known, on the element it bears on. */
export interface TechNote {
	readonly on: string;
	readonly text: string;
}
export interface TechFailure {
	readonly when: string;
	readonly then: string;
}
export interface TechMessage {
	readonly from: string;
	readonly to: string;
	readonly text: string;
	/** A call is drawn solid, an answer dashed. */
	readonly reply: boolean;
	readonly failures: readonly TechFailure[];
}
export interface TechSequence {
	readonly name: string;
	readonly messages: readonly TechMessage[];
}
export interface TechnicalDiagram {
	readonly elements: readonly TechElement[];
	readonly links: readonly TechLink[];
	readonly notes: readonly TechNote[];
	readonly sequences: readonly TechSequence[];
}

export const EMPTY_TECHNICAL_DIAGRAM: TechnicalDiagram = { elements: [], links: [], notes: [], sequences: [] };

export const isEmptyTechnicalDiagram = (d: TechnicalDiagram): boolean =>
	d.elements.length === 0 && d.links.length === 0 && d.notes.length === 0 && d.sequences.length === 0;

const normal = (name: string): string => name.replace(/\s+/g, ' ').trim();
function splitAtColon(text: string): [string, string | null] {
	const at = text.indexOf(':');
	return at < 0 ? [text.trim(), null] : [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}
/** `from -> to` or `from --> to`, the arrow kept apart; null when the text holds none. */
function splitArrow(text: string): { from: string; to: string; reply: boolean } | null {
	const reply = text.indexOf('-->');
	const call = text.indexOf('->');
	if (reply >= 0 && reply <= call) return { from: normal(text.slice(0, reply)), to: normal(text.slice(reply + 3)), reply: true };
	if (call >= 0) return { from: normal(text.slice(0, call)), to: normal(text.slice(call + 2)), reply: false };
	return null;
}

const ELEMENT = /^(actor|component|store|system)\s+(.+)$/i;
const LINK = /^link\s+(.+)$/i;
const NOTE = /^note\s+(.+)$/i;
const SEQUENCE = /^sequence\s+(.+)$/i;
const FAILURE = /^goes\s+wrong\s+when\s+(.+)$/i;
const KEYWORDS = 'actor, component, store, system, link, note, sequence';

/**
 * Read the notation into the diagram it draws, with every line it could not
 * read; nothing is refused (ac-evo-func-uml-text). A sequence runs until the
 * next top-level line.
 */
export function readTechnicalDiagram(text: string): { diagram: TechnicalDiagram; problems: DiagramProblem[] } {
	const elements: TechElement[] = [];
	const links: TechLink[] = [];
	const notes: TechNote[] = [];
	const sequences: { name: string; messages: { from: string; to: string; text: string; reply: boolean; failures: TechFailure[] }[] }[] = [];
	const problems: DiagramProblem[] = [];
	let sequence: number | null = null;
	text.split('\n').forEach((raw, i) => {
		const line = i + 1;
		const trimmed = raw.trim();
		if (trimmed === '') return;
		const element = trimmed.match(ELEMENT);
		if (element) {
			const { rest, link } = trailingLink(element[2]);
			const [name, flag] = splitAtColon(rest);
			const kind = element[1].toLowerCase() as TechElementKind;
			const isNew = kind !== 'actor' && !link && (flag ?? '').toLowerCase() === 'new';
			if (elements.some((e) => sameName(e.name, name))) problems.push({ line, message: `"${normal(name)}" is declared twice: the first one is kept.` });
			else elements.push({ name: normal(name), kind, isNew, ...(link ? { link } : {}) });
			if (flag !== null && flag.toLowerCase() !== 'new') problems.push({ line, message: `After the name, only "new" is read: "${flag}" is not.` });
			else if (link && flag !== null) problems.push({ line, message: `"${normal(name)}" is linked to "${link.name}", which the product already has: it is not new.` });
			sequence = null;
			return;
		}
		const link = trimmed.match(LINK);
		if (link) {
			const [ends, label] = splitAtColon(link[1]);
			const arrow = splitArrow(ends);
			if (!arrow || arrow.from === '' || arrow.to === '') problems.push({ line, message: 'A link joins two parts: "link Order service -> SMS sender: what goes through it".' });
			else links.push({ from: arrow.from, to: arrow.to, label: label ?? '' });
			sequence = null;
			return;
		}
		const note = trimmed.match(NOTE);
		if (note) {
			const [on, said] = splitAtColon(note[1]);
			if (said === null || on === '') problems.push({ line, message: 'A note says what it bears on, then the constraint or risk: "note SMS provider: 0.05 € per text".' });
			else notes.push({ on: normal(on), text: said });
			sequence = null;
			return;
		}
		const seq = trimmed.match(SEQUENCE);
		if (seq) {
			const name = normal(seq[1].replace(/:$/, ''));
			const found = sequences.findIndex((s) => sameName(s.name, name));
			if (found >= 0) problems.push({ line, message: `The sequence "${name}" is written twice: its messages are read one after the other.` });
			sequence = found >= 0 ? found : sequences.push({ name, messages: [] }) - 1;
			return;
		}
		if (sequence !== null) {
			const messages = sequences[sequence].messages;
			const failure = trimmed.match(FAILURE);
			if (failure) {
				const last = messages.at(-1);
				if (!last) problems.push({ line, message: 'What goes wrong belongs to the message above it: write the message first.' });
				else {
					const [when, then] = splitAtColon(failure[1]);
					last.failures.push({ when, then: then ?? '' });
				}
				return;
			}
			const [ends, said] = splitAtColon(trimmed);
			const arrow = splitArrow(ends);
			if (!arrow || arrow.from === '' || arrow.to === '') {
				problems.push({ line, message: 'A message says who calls whom, then what: "Order service -> SMS sender: asks for a text".' });
				return;
			}
			messages.push({ from: arrow.from, to: arrow.to, text: said ?? '', reply: arrow.reply, failures: [] });
			return;
		}
		problems.push({ line, message: `Not read: start the line with ${KEYWORDS}.` });
	});
	// A name in another case than where it is declared reads as the declared one.
	const named = (name: string) => elements.find((e) => sameName(e.name, name))?.name ?? name;
	return {
		diagram: {
			elements,
			links: links.map((l) => ({ ...l, from: named(l.from), to: named(l.to) })),
			notes: notes.map((n) => ({ ...n, on: named(n.on) })),
			sequences: sequences.map((s) => ({ name: s.name, messages: s.messages.map((m) => ({ ...m, from: named(m.from), to: named(m.to) })) }))
		},
		problems
	};
}

/** The notation of a technical diagram, in one canonical layout. */
export function writeTechnicalDiagram(d: TechnicalDiagram): string {
	const blocks: string[][] = [];
	if (d.elements.length > 0) blocks.push(d.elements.map((e) => `${e.kind} ${e.name}${e.isNew && !e.link ? ': new' : ''}${linkSuffix(e.link)}`));
	if (d.links.length > 0) blocks.push(d.links.map((l) => `link ${l.from} -> ${l.to}${l.label !== '' ? `: ${l.label}` : ''}`));
	if (d.notes.length > 0) blocks.push(d.notes.map((n) => `note ${n.on}: ${n.text}`));
	for (const s of d.sequences) {
		const lines = [`sequence ${s.name}`];
		for (const m of s.messages) {
			lines.push(`  ${m.from} ${m.reply ? '-->' : '->'} ${m.to}: ${m.text}`);
			for (const f of m.failures) lines.push(`    goes wrong when ${f.when}${f.then !== '' ? `: ${f.then}` : ''}`);
		}
		blocks.push(lines);
	}
	return blocks.map((b) => b.join('\n')).join('\n\n');
}

/** What the drawing names without declaring, or leaves unsaid: pointed out, never refused. */
export function technicalDiagramProblems(d: TechnicalDiagram): DiagramProblem[] {
	const out: DiagramProblem[] = [];
	const declared = (name: string) => d.elements.some((e) => sameName(e.name, name));
	const warned = new Set<string>();
	// A name is said once, where it is first used (ac-evo-tech-uml).
	const undeclared = (name: string, where: string, at: DiagramPlace) => {
		if (declared(name) || warned.has(name.toLowerCase())) return;
		warned.add(name.toLowerCase());
		out.push({ line: null, message: `"${name}" ${where} without being declared: add it as a component, a store, a system or an actor.`, at: [at] });
	};
	d.links.forEach((l, index) => {
		undeclared(l.from, 'is linked', { kind: 'link', index });
		undeclared(l.to, 'is linked', { kind: 'link', index });
	});
	d.notes.forEach((n, index) => undeclared(n.on, 'carries a note', { kind: 'note', index }));
	for (const s of d.sequences) {
		s.messages.forEach((m, index) => {
			const at = { kind: 'message', sequence: s.name, index } as const;
			undeclared(m.from, `takes part in "${s.name}"`, at);
			undeclared(m.to, `takes part in "${s.name}"`, at);
			for (const f of m.failures)
				if (f.when === '' || f.then === '')
					out.push({ line: null, message: `What goes wrong on "${m.text}" does not say ${f.when === '' ? 'when it happens' : 'what then happens'}.`, at: [at] });
		});
	}
	return out;
}

/** The words the diagram says, without its keywords: what the glossary reads. */
export function technicalDiagramWords(text: string): string {
	const { diagram: d } = readTechnicalDiagram(text);
	return [
		...d.elements.map((e) => e.name),
		...d.links.map((l) => l.label),
		...d.notes.map((n) => n.text),
		...d.sequences.flatMap((s) => [s.name, ...s.messages.flatMap((m) => [m.text, ...m.failures.flatMap((f) => [f.when, f.then])])])
	]
		.filter((w) => w !== '')
		.join('\n');
}

export function technicalDiagramCounts(d: TechnicalDiagram) {
	return {
		parts: d.elements.filter((e) => e.kind !== 'actor').length,
		added: d.elements.filter((e) => e.isNew).length,
		links: d.links.length,
		notes: d.notes.length,
		sequences: d.sequences.length,
		messages: d.sequences.reduce((n, s) => n + s.messages.length, 0),
		failures: d.sequences.reduce((n, s) => n + s.messages.reduce((k, m) => k + m.failures.length, 0), 0)
	};
}

/** The participants of a sequence, left to right, in the order they first act. */
export function sequenceParticipants(d: TechnicalDiagram, s: TechSequence): TechElement[] {
	const out: TechElement[] = [];
	for (const m of s.messages)
		for (const name of [m.from, m.to])
			if (!out.some((e) => sameName(e.name, name))) out.push(d.elements.find((e) => sameName(e.name, name)) ?? { name, kind: 'component', isNew: false });
	return out;
}

const WORDS = {
	en: {
		parts: 'Parts',
		data: 'Data',
		systems: 'Other systems',
		people: 'People',
		isNew: 'new',
		talk: 'How they talk',
		to: 'to',
		ifWrong: 'If',
		risks: 'Constraints and risks'
	},
	fr: {
		parts: 'Composants',
		data: 'Données',
		systems: 'Autres systèmes',
		people: 'Personnes',
		isNew: 'nouveau',
		talk: 'Échanges',
		to: 'vers',
		ifWrong: 'Si',
		risks: 'Contraintes et risques'
	}
} as const;

/**
 * The description a technical diagram writes (ac-evo-tech-uml-sync): the parts
 * and what is new, how they talk, each sequence with what happens when it goes
 * wrong, then the constraints and risks of its notes.
 */
export function describeTechnicalDiagram(d: TechnicalDiagram, lang: SpecLanguage = 'en'): string {
	const w = WORDS[lang];
	const colon = lang === 'fr' ? `${NBSP}:` : ':';
	const semi = lang === 'fr' ? `${NBSP};` : ';';
	const end = (t: string) => (/[.!?…]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
	const named = (e: TechElement) => (e.isNew ? `${e.name} (${w.isNew})` : e.name);
	const of = (kind: TechElementKind) => d.elements.filter((e) => e.kind === kind).map(named);
	const paragraphs: string[] = [];
	const inventory = [
		[w.parts, of('component')],
		[w.data, of('store')],
		[w.systems, of('system')],
		[w.people, of('actor')]
	] as const;
	const said = inventory.filter(([, names]) => names.length > 0).map(([label, names]) => `${label}${colon} ${names.join(', ')}`);
	if (said.length > 0) paragraphs.push(end(said.join(`${semi} `)));
	if (d.links.length > 0)
		paragraphs.push(end(`${w.talk}${colon} ${d.links.map((l) => `${l.from} ${w.to} ${l.to}${l.label ? `${colon} ${l.label}` : ''}`).join(`${semi} `)}`));
	for (const s of d.sequences) {
		if (s.messages.length === 0) continue;
		const steps = s.messages.map((m) => {
			const step = `${m.from} ${w.to} ${m.to}${m.text ? `${colon} ${m.text}` : ''}`;
			const failures = m.failures.map((f) => ` (${w.ifWrong} ${f.when}${colon} ${f.then})`).join('');
			return `${step}${failures}`;
		});
		paragraphs.push(end(`${s.name}${colon} ${steps.join(`${semi} `)}`));
	}
	if (d.notes.length > 0) paragraphs.push(`${w.risks}${colon}\n${d.notes.map((n) => `- ${n.on}${colon} ${end(n.text)}`).join('\n')}`);
	return paragraphs.join('\n\n');
}
