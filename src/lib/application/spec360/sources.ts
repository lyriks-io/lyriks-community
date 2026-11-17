import { sortByName } from '$domain/shared';
import { anchorDomId, anchorOf, placeOfAnchor } from '$domain/discussions';
import type { FeatureImplementationCoverage } from '../analysis/load-implementation-coverage';
import { text } from './labels';

/**
 * What each block of the Specification 360° rests on (criterion b0ea9889): the
 * sources of the register its element cites, by the block's anchor, and for
 * each source the blocks that cite it, each a link to where it stands. Read
 * from the sections that hold citations: a feature, a user, a glossary term,
 * the problem and the target (the business objective), a group of
 * requirements (the definition sections it reads), a technical choice (the
 * documentation it cites), the data map (what its tables cite, each table
 * named with its own: criterion 3918b2ea), and the architecture as a whole,
 * which has no block of its own; and for a behaviour element (an action, a rule of a feature, a
 * rule of the whole product) the places in the code the implementation index
 * located for it. Pure: the sections and the coverage arrive read.
 */

export interface SourceCiter {
	readonly anchor: string;
	readonly label: string;
	readonly href: string;
}

/** A place in the code a behaviour element was located at, with what its evidence card asks for (ac-src-code-place). */
export interface SourceCodePlace {
	readonly featureId: string;
	/** "Action", "Rule"... */
	readonly kind: string;
	readonly name: string;
	/** "server/handlers/links.handler.js:99" */
	readonly place: string;
	readonly file: string;
	readonly line: number | null;
	readonly elementId: string;
}

export interface SourceGroup {
	readonly id: string;
	readonly label: string;
	readonly sourceIds: readonly string[];
}

/** What every page of the specification needs of the sources: each block's own, never who cites a source. */
export interface SpecSourcesIndex {
	/** The sources each block cites, by its anchor; a block that cites nothing is absent. */
	readonly byAnchor: Readonly<Record<string, readonly string[]>>;
	/** How many places in the code each behaviour block was located at, by its anchor; the places are read on demand. */
	readonly codeCounts: Readonly<Record<string, number>>;
	/** A block whose sources belong to its parts (the data map, by table): each part named with its own. */
	readonly groupsByAnchor: Readonly<Record<string, readonly SourceGroup[]>>;
}

export interface SpecSources extends SpecSourcesIndex {
	/** The blocks that cite each source, by the source's id: the Sources page alone reads it (hundreds of KB on a large product). */
	readonly citedBy: Readonly<Record<string, readonly SourceCiter[]>>;
}

type Cited = { readonly sourceIds?: readonly string[] | null };

export interface SpecSourcesInput {
	readonly features: {
		readonly features: readonly { readonly id: string; readonly name: string }[];
		readonly leafMeta?: Readonly<Record<string, Cited | undefined>>;
	};
	/** The identity of the product: what its summary was written from. */
	readonly identity: Cited;
	/** The brand and the journeys of the Experience, each with what it was read from. */
	readonly experience?: { readonly brand: Cited; readonly journeys: readonly ({ readonly id: string; readonly name: string } & Cited)[] };
	readonly roles: readonly ({ readonly id: string; readonly name: string } & Cited)[];
	readonly terms: readonly ({ readonly id: string; readonly term: unknown } & Cited)[];
	readonly definition: {
		readonly businessObjective: Cited;
		readonly market: Cited;
		readonly security: Cited;
		readonly technical: Cited;
	};
	readonly architecture: Cited & { readonly techChoices: readonly { readonly id: string; readonly name: string; readonly referenceDocId: string | null }[] };
	readonly tables: readonly ({ readonly id: string; readonly name: string } & Cited)[];
	/** The implementation coverage per feature, as the last sync of the index left it. */
	readonly coverage: Readonly<Record<string, FeatureImplementationCoverage>>;
}

const CODE_KIND: Readonly<Record<string, string>> = { action: 'Action', rule: 'Rule', invariant: 'Rule' };

/** The block a located element stands on: an action and a rule of their feature, an invariant as a rule of the whole product. */
function codeAnchorOf(featureId: string, kind: string, id: string): string | null {
	if (kind === 'action') return anchorOf('action', featureId, id);
	if (kind === 'rule') return anchorOf('rule', featureId, id);
	if (kind === 'invariant') return anchorOf('rule', 'project', id);
	return null;
}

/** The definition sections each group of requirements reads (spec360/tech.ts requirementGroups). */
const REQUIREMENT_SECTIONS: readonly { key: string; title: string; reads: readonly ('market' | 'security' | 'technical')[] }[] = [
	{ key: 'runtime', title: 'Where it must run', reads: ['technical'] },
	{ key: 'languages', title: 'Languages and locales', reads: ['market'] },
	{ key: 'security', title: 'Security', reads: ['security'] },
	{ key: 'compliance', title: 'Compliance', reads: ['market', 'security'] }
];

export function specSources(projectId: string, input: SpecSourcesInput): SpecSources {
	const base = `/projects/${encodeURIComponent(projectId)}/spec`;
	const hrefOf = (anchor: string) => {
		const place = placeOfAnchor(anchor);
		return `${base}${place ? `/${place}` : ''}#${anchorDomId(anchor)}`;
	};
	const byAnchor: Record<string, string[]> = {};
	const citedBy: Record<string, SourceCiter[]> = {};
	const cite = (ids: readonly string[] | null | undefined, citer: SourceCiter, onBlock = true) => {
		const unique = [...new Set((ids ?? []).filter(Boolean))];
		if (unique.length === 0) return;
		if (onBlock) byAnchor[citer.anchor] = [...new Set([...(byAnchor[citer.anchor] ?? []), ...unique])];
		for (const id of unique) {
			const list = (citedBy[id] ??= []);
			if (!list.some((c) => c.anchor === citer.anchor)) list.push(citer);
		}
	};
	const block = (anchor: string, label: string): SourceCiter => ({ anchor, label, href: hrefOf(anchor) });

	for (const f of input.features.features) {
		cite(input.features.leafMeta?.[f.id]?.sourceIds, block(anchorOf('feature', f.id), `Feature · ${text(f.name)}`));
	}
	cite(input.identity.sourceIds, block('product', 'Product summary'));
	cite(input.experience?.brand.sourceIds, block('branding', 'Branding'));
	for (const j of input.experience?.journeys ?? []) cite(j.sourceIds, block(anchorOf('journey', j.id), `Journey · ${text(j.name)}`));
	for (const r of input.roles) cite(r.sourceIds, block(anchorOf('role', r.id), `User · ${text(r.name)}`));
	for (const t of input.terms) cite(t.sourceIds, block(anchorOf('term', t.id), `Term · ${text(t.term)}`));
	cite(input.definition.businessObjective.sourceIds, block('problem', 'The problem'));
	cite(input.definition.businessObjective.sourceIds, block('target', 'The target'));
	for (const group of REQUIREMENT_SECTIONS) {
		const ids = group.reads.flatMap((section) => input.definition[section].sourceIds ?? []);
		cite(ids, block(anchorOf('requirements', group.key), `Requirements · ${group.title}`));
	}
	for (const choice of input.architecture.techChoices) {
		cite(choice.referenceDocId ? [choice.referenceDocId] : [], block(anchorOf('stack', choice.id), `Architecture · ${text(choice.name)}`));
	}
	// The data map is one block: it rests on what its tables cite, each table named with its own; a citer opens the map on its table.
	const groupsByAnchor: Record<string, SourceGroup[]> = {};
	for (const table of input.tables) {
		const ids = [...new Set((table.sourceIds ?? []).filter(Boolean))];
		if (ids.length === 0) continue;
		const label = text(table.name);
		(groupsByAnchor.datamap ??= []).push({ id: table.id, label, sourceIds: ids });
		byAnchor.datamap = [...new Set([...(byAnchor.datamap ?? []), ...ids])];
		cite(ids, { anchor: anchorOf('datamap', table.id), label: `Table · ${label}`, href: `${base}/tech/data-map?table=${encodeURIComponent(table.id)}#${anchorDomId('datamap')}` }, false);
	}
	// The architecture cites as a whole: it is named among the citers, with no block of its own to carry an icon.
	cite(input.architecture.sourceIds, { anchor: 'stack', label: 'Architecture', href: `${base}/tech/architecture` }, false);

	const codeCounts = Object.fromEntries(Object.entries(codePlacesByAnchor(input.coverage)).map(([anchor, places]) => [anchor, places.length]));
	// Every list a reader sees reads from A to Z (criterion 4b3d2b4d): the blocks citing a source, a table's groups, the code places.
	for (const id of Object.keys(citedBy)) citedBy[id] = sortByName(citedBy[id], (c) => c.label);
	for (const anchor of Object.keys(groupsByAnchor)) groupsByAnchor[anchor] = sortByName(groupsByAnchor[anchor], (g) => g.label);
	return { byAnchor, citedBy, codeCounts, groupsByAnchor };
}

/** The index every page carries: the sources without the blocks citing each, which the Sources page reads on its own. */
export function sourcesIndex({ byAnchor, codeCounts, groupsByAnchor }: SpecSources): SpecSourcesIndex {
	return { byAnchor, codeCounts, groupsByAnchor };
}

/** The places in the code each behaviour block was located at, by its anchor, each list from A to Z. */
export function codePlacesByAnchor(all: SpecSourcesInput['coverage']): Record<string, SourceCodePlace[]> {
	const codeByAnchor: Record<string, SourceCodePlace[]> = {};
	for (const [featureId, coverage] of Object.entries(all)) {
		for (const action of Object.values(coverage.actions ?? {})) {
			for (const e of action.elements ?? []) {
				const anchor = e.id ? codeAnchorOf(featureId, e.kind, e.id) : null;
				if (!anchor || !e.id || !e.location?.file) continue;
				const place = e.location.line !== null ? `${e.location.file}:${e.location.line}` : e.location.file;
				const list = (codeByAnchor[anchor] ??= []);
				if (list.some((p) => p.place === place)) continue;
				list.push({ featureId, kind: CODE_KIND[e.kind] ?? e.kind, name: e.name, place, file: e.location.file, line: e.location.line, elementId: e.id });
			}
		}
	}
	for (const anchor of Object.keys(codeByAnchor)) codeByAnchor[anchor] = sortByName(codeByAnchor[anchor], (p) => p.place);
	return codeByAnchor;
}
