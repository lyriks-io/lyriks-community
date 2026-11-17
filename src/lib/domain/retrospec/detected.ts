import type { ProjectArchitectureDraft } from '../architecture';
import type { ProjectDataDraft } from '../data';
import type { ProjectDocumentsDraft } from '../documents';
import type { ProjectExperienceDraft } from '../experience';
import type { ProjectFeaturesDraft } from '../features';
import type { ProjectGlossaryDraft } from '../glossary';
import type { ProjectUsersDraft } from '../users';
import type { RetrospecBehavior } from './reading';

/**
 * What the person's AI added to the specification, by name: after it writes a
 * section, the elements that section holds and did not hold before (a
 * feature, an action, a table, a role, a screen, a term, a technology, a
 * source) are what Lyriks detected. Pure: the sections arrive already read.
 */

/** The sections whose elements have a name a person recognises. */
export const NAMED_SECTIONS = ['features', 'behavior', 'data', 'users', 'experience', 'glossary', 'architecture', 'documents'] as const;
export type NamedSection = (typeof NAMED_SECTIONS)[number];
export const isNamedSection = (v: unknown): v is NamedSection => typeof v === 'string' && (NAMED_SECTIONS as readonly string[]).includes(v);

export type DetectedKind = 'feature' | 'action' | 'table' | 'role' | 'screen' | 'term' | 'technology' | 'source';

/** The kind of element each named section holds. */
export const KIND_OF: Readonly<Record<NamedSection, DetectedKind>> = {
	features: 'feature',
	behavior: 'action',
	data: 'table',
	users: 'role',
	experience: 'screen',
	glossary: 'term',
	architecture: 'technology',
	documents: 'source'
};

/** One element, keyed by its own id so a rename never reads as a new one. */
export interface NamedElement {
	readonly key: string;
	readonly name: string;
}

/** What Lyriks detected after a burst of the AI's writes to one section. */
export interface DetectedFact {
	readonly at: string;
	readonly kind: DetectedKind;
	readonly names: readonly string[];
}

/** The parts of the specification the named sections are read from; a section left out reads empty. */
export interface NamedParts {
	readonly features?: Pick<ProjectFeaturesDraft, 'features'>;
	readonly behavior?: Pick<RetrospecBehavior, 'actionsByFeature'>;
	readonly data?: Pick<ProjectDataDraft, 'entities'>;
	readonly users?: Pick<ProjectUsersDraft, 'roles'>;
	readonly experience?: Pick<ProjectExperienceDraft, 'screens'>;
	readonly glossary?: Pick<ProjectGlossaryDraft, 'terms'>;
	readonly architecture?: Pick<ProjectArchitectureDraft, 'techChoices'>;
	readonly documents?: Pick<ProjectDocumentsDraft, 'sources'>;
}

/** The elements of one section that carry a name; one still unnamed is left for when it gets one. */
export function namedIn(section: NamedSection, parts: NamedParts): NamedElement[] {
	const rows = ((): { key: string; name: string }[] => {
		switch (section) {
			case 'features':
				return (parts.features?.features ?? []).map((f) => ({ key: f.id, name: f.name }));
			case 'behavior':
				return Object.entries(parts.behavior?.actionsByFeature ?? {}).flatMap(([featureId, actions]) => actions.map((a) => ({ key: `${featureId}:${a.id}`, name: a.name })));
			case 'data':
				return (parts.data?.entities ?? []).map((e) => ({ key: e.id, name: e.name }));
			case 'users':
				return (parts.users?.roles ?? []).map((r) => ({ key: r.id, name: r.name }));
			case 'experience':
				return (parts.experience?.screens ?? []).map((s) => ({ key: s.id, name: s.name }));
			case 'glossary':
				return (parts.glossary?.terms ?? []).map((t) => ({ key: t.id, name: t.term }));
			case 'architecture':
				return (parts.architecture?.techChoices ?? []).map((c) => ({ key: c.id, name: c.name }));
			case 'documents':
				return (parts.documents?.sources ?? []).map((s) => ({ key: s.id, name: s.title }));
		}
	})();
	return rows.map((r) => ({ key: r.key, name: r.name.trim() })).filter((r) => r.name !== '');
}

/** The elements not among those already known, in the section's own order. */
export function newlyNamed(known: ReadonlySet<string>, now: readonly NamedElement[]): NamedElement[] {
	return now.filter((e) => !known.has(e.key));
}

const PLURAL: Readonly<Record<DetectedKind, string>> = {
	feature: 'features',
	action: 'actions',
	table: 'tables',
	role: 'roles',
	screen: 'screens',
	term: 'terms',
	technology: 'technologies',
	source: 'sources'
};
/** The names a log line spells out before it counts the rest. */
const NAMES_SPELLED = 3;

/** How a detection reads in the log: "Lyriks detected the feature “Send a message”", or a few names and a count. */
export function detectedText(fact: DetectedFact): string {
	const quoted = fact.names.map((n) => `“${n}”`);
	if (quoted.length === 1) return `Lyriks detected the ${fact.kind} ${quoted[0]}`;
	const shown = quoted.slice(0, NAMES_SPELLED);
	const rest = quoted.length - shown.length;
	const list = rest > 0 ? `${shown.join(', ')} and ${rest} more` : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
	return `Lyriks detected ${quoted.length} ${PLURAL[fact.kind]}: ${list}`;
}
