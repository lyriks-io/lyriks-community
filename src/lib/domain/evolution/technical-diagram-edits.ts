import { sameName } from './functional-diagram';
import { freshName, newNames, renameRefusal } from './functional-diagram-edits';
import type { SpecLanguage } from '$domain/language';
import type { TechElementKind, TechFailure, TechLink, TechMessage, TechNote, TechSequence, TechnicalDiagram } from './technical-diagram';
import { linkKindOf, withLink, type DiagramLink, type DiagramLinkKind } from './diagram-links';

/**
 * The edits the page makes on the Technical spec's diagram (ac-evo-tech-uml,
 * ac-evo-func-uml-edit), each a pure function from one diagram to the next. A
 * rename reaches every link, note and message that names the element, so an
 * edit never leaves a name behind.
 */
const baseOf = (kind: TechElementKind, lang: SpecLanguage): string => {
	const names = newNames(lang);
	return { actor: names.person, component: names.component, store: names.store, system: names.system }[kind];
};
const renamed = (name: string, from: string, to: string) => (sameName(name, from) ? to : name);

export function addTechElement(d: TechnicalDiagram, kind: TechElementKind, lang: SpecLanguage = 'en'): { diagram: TechnicalDiagram; name: string } {
	const name = freshName(baseOf(kind, lang), d.elements.map((e) => e.name));
	return { diagram: { ...d, elements: [...d.elements, { name, kind, isNew: kind !== 'actor' }] }, name };
}

export function renameTechElement(d: TechnicalDiagram, from: string, to: string): TechnicalDiagram {
	if (renameRefusal(to, from, d.elements.map((e) => e.name))) return d;
	const name = to.trim();
	return {
		elements: d.elements.map((e) => (sameName(e.name, from) ? { ...e, name } : e)),
		links: d.links.map((l) => ({ ...l, from: renamed(l.from, from, name), to: renamed(l.to, from, name) })),
		notes: d.notes.map((n) => ({ ...n, on: renamed(n.on, from, name) })),
		sequences: d.sequences.map((s) => ({ ...s, messages: s.messages.map((m) => ({ ...m, from: renamed(m.from, from, name), to: renamed(m.to, from, name) })) }))
	};
}

/** What a part of each kind may be linked to (ac-evo-tech-uml-link): a component to a feature, a store to a table. */
export const linkKindFor = (kind: TechElementKind): DiagramLinkKind | null => (kind === 'component' ? 'feature' : kind === 'store' ? 'entity' : null);

/** A part marked new, or turned into a kind its link does not fit, is no longer linked to what the product has. */
export const updateTechElement = (d: TechnicalDiagram, name: string, patch: { kind?: TechElementKind; isNew?: boolean }): TechnicalDiagram => ({
	...d,
	elements: d.elements.map((e) => {
		if (!sameName(e.name, name)) return e;
		const kind = patch.kind ?? e.kind;
		const isNew = kind === 'actor' ? false : (patch.isNew ?? e.isNew);
		const keeps = e.link && !isNew && linkKindOf(e.link.ref) === linkKindFor(kind);
		return withLink({ ...e, kind, isNew }, keeps ? e.link! : null);
	})
});

/** A part linked to what the product already has is already there: linking it takes the "new" mark off. */
export const linkTechElement = (d: TechnicalDiagram, name: string, link: DiagramLink | null): TechnicalDiagram => ({
	...d,
	elements: d.elements.map((e) => (sameName(e.name, name) ? withLink(link ? { ...e, isNew: false } : e, link) : e))
});

/** An element leaves with its links and notes; the messages that name it stay, pointed out. */
export const removeTechElement = (d: TechnicalDiagram, name: string): TechnicalDiagram => ({
	...d,
	elements: d.elements.filter((e) => !sameName(e.name, name)),
	links: d.links.filter((l) => !sameName(l.from, name) && !sameName(l.to, name)),
	notes: d.notes.filter((n) => !sameName(n.on, name))
});

/** A link from `from`, to the first part it is not linked to yet. */
export function addTechLink(d: TechnicalDiagram, from?: string): { diagram: TechnicalDiagram; index: number } {
	const parts = d.elements.filter((e) => e.kind !== 'actor');
	const source = from ?? parts[0]?.name ?? d.elements[0]?.name;
	if (!source) return { diagram: d, index: -1 };
	const target =
		d.elements.find((e) => !sameName(e.name, source) && !d.links.some((l) => sameName(l.from, source) && sameName(l.to, e.name)))?.name ?? source;
	const link: TechLink = { from: source, to: target, label: '' };
	return { diagram: { ...d, links: [...d.links, link] }, index: d.links.length };
}
export const updateTechLink = (d: TechnicalDiagram, index: number, patch: Partial<TechLink>): TechnicalDiagram => ({
	...d,
	links: d.links.map((l, i) => (i === index ? { ...l, ...patch } : l))
});
export const removeTechLink = (d: TechnicalDiagram, index: number): TechnicalDiagram => ({ ...d, links: d.links.filter((_, i) => i !== index) });

export function addTechNote(d: TechnicalDiagram, on: string): { diagram: TechnicalDiagram; index: number } {
	const note: TechNote = { on, text: '' };
	return { diagram: { ...d, notes: [...d.notes, note] }, index: d.notes.length };
}
export const updateTechNote = (d: TechnicalDiagram, index: number, patch: Partial<TechNote>): TechnicalDiagram => ({
	...d,
	notes: d.notes.map((n, i) => (i === index ? { ...n, ...patch } : n))
});
export const removeTechNote = (d: TechnicalDiagram, index: number): TechnicalDiagram => ({ ...d, notes: d.notes.filter((_, i) => i !== index) });

export function addSequence(d: TechnicalDiagram, lang: SpecLanguage = 'en'): { diagram: TechnicalDiagram; name: string } {
	const name = freshName(newNames(lang).sequence, d.sequences.map((s) => s.name));
	return { diagram: { ...d, sequences: [...d.sequences, { name, messages: [] }] }, name };
}
export function renameSequence(d: TechnicalDiagram, from: string, to: string): TechnicalDiagram {
	if (renameRefusal(to, from, d.sequences.map((s) => s.name))) return d;
	return { ...d, sequences: d.sequences.map((s) => (sameName(s.name, from) ? { ...s, name: to.trim() } : s)) };
}
export const removeSequence = (d: TechnicalDiagram, name: string): TechnicalDiagram => ({ ...d, sequences: d.sequences.filter((s) => !sameName(s.name, name)) });

export const sequenceOf = (d: TechnicalDiagram, name: string): TechSequence | null => d.sequences.find((s) => sameName(s.name, name)) ?? null;

const withMessages = (d: TechnicalDiagram, name: string, change: (m: readonly TechMessage[]) => readonly TechMessage[]): TechnicalDiagram => ({
	...d,
	sequences: d.sequences.map((s) => (sameName(s.name, name) ? { ...s, messages: change(s.messages) } : s))
});

/**
 * A new message after `after` (or at the end): it answers back when the one
 * before was a call, else it goes on from whoever received the last message.
 */
export function addMessage(d: TechnicalDiagram, sequence: string, after: number | null, lang: SpecLanguage = 'en'): { diagram: TechnicalDiagram; index: number } {
	const messages = sequenceOf(d, sequence)?.messages ?? [];
	const index = after === null ? messages.length : Math.min(after + 1, messages.length);
	const before = messages[index - 1];
	const parts = d.elements.map((e) => e.name);
	const message: TechMessage = before
		? { from: before.to, to: before.from, text: newNames(lang).message, reply: !before.reply, failures: [] }
		: { from: parts[0] ?? 'Someone', to: parts[1] ?? parts[0] ?? 'Someone', text: newNames(lang).message, reply: false, failures: [] };
	return { diagram: withMessages(d, sequence, (m) => [...m.slice(0, index), message, ...m.slice(index)]), index };
}
export const updateMessage = (d: TechnicalDiagram, sequence: string, index: number, patch: Partial<Omit<TechMessage, 'failures'>>): TechnicalDiagram =>
	withMessages(d, sequence, (m) => m.map((x, i) => (i === index ? { ...x, ...patch } : x)));
export function moveMessage(d: TechnicalDiagram, sequence: string, index: number, by: -1 | 1): TechnicalDiagram {
	return withMessages(d, sequence, (m) => {
		const to = index + by;
		if (to < 0 || to >= m.length) return m;
		const out = [...m];
		[out[index], out[to]] = [out[to], out[index]];
		return out;
	});
}
export const removeMessage = (d: TechnicalDiagram, sequence: string, index: number): TechnicalDiagram =>
	withMessages(d, sequence, (m) => m.filter((_, i) => i !== index));

const withFailures = (d: TechnicalDiagram, sequence: string, index: number, change: (f: readonly TechFailure[]) => readonly TechFailure[]) =>
	withMessages(d, sequence, (m) => m.map((x, i) => (i === index ? { ...x, failures: change(x.failures) } : x)));
export const addMessageFailure = (d: TechnicalDiagram, sequence: string, index: number): TechnicalDiagram =>
	withFailures(d, sequence, index, (f) => [...f, { when: '', then: '' }]);
export const updateMessageFailure = (d: TechnicalDiagram, sequence: string, index: number, failure: number, patch: Partial<TechFailure>): TechnicalDiagram =>
	withFailures(d, sequence, index, (f) => f.map((x, i) => (i === failure ? { ...x, ...patch } : x)));
export const removeMessageFailure = (d: TechnicalDiagram, sequence: string, index: number, failure: number): TechnicalDiagram =>
	withFailures(d, sequence, index, (f) => f.filter((_, i) => i !== failure));
