import type { ImpactHypothesis } from './enums';
import type { EvolutionRequest, ImpactFinding } from './draft';
import type { FeatureStatus, StatusEntity } from './report-derivation';
import { stableId } from './ids';

/**
 * The code plane of the impact report (ac-evo-imp-9): where the change lands
 * in the repository.
 *
 * The implementation index, synced from a checkout, anchors every located
 * element of a feature on a file and a line. The files anchoring the touched
 * features are where the change is made; the files anchoring the features the
 * spec plane reaches are at risk. One finding per file, naming the features
 * and the elements it holds, so a person reads what changes in the code before
 * anyone opens an editor.
 */
export interface CodeImpactInput {
	readonly request: Pick<EvolutionRequest, 'id' | 'leafIds'>;
	readonly hypothesis: ImpactHypothesis;
	/** The engine status of each feature to read: the touched ones and the reached ones. */
	readonly statuses: Readonly<Record<string, FeatureStatus | null>>;
	/** How far from the change each feature is: 1 for a touched feature, else the spec plane's depth. */
	readonly depthByFeature: Readonly<Record<string, number>>;
	readonly leafNames: Readonly<Record<string, string>>;
}

interface FileHit {
	readonly featureId: string;
	readonly depth: number;
	readonly elements: string[];
}

const elementName = (e: StatusEntity): string =>
	`${e.entityType} "${e.entityName ?? e.entityId}"`;

const ELEMENTS_NAMED = 3;

export function deriveCodeImpact(input: CodeImpactInput): ImpactFinding[] {
	const byFile = new Map<string, FileHit[]>();
	for (const [featureId, status] of Object.entries(input.statuses)) {
		if (!status) continue;
		const depth = Math.max(1, input.depthByFeature[featureId] ?? 1);
		const rows = [...(status.actions ?? []), ...(status.surfaces ?? [])];
		const perFile = new Map<string, string[]>();
		for (const row of rows) {
			for (const entity of row.foundEntities ?? []) {
				for (const location of entity.locations ?? []) {
					const file = location.file.trim();
					if (file === '') continue;
					const list = perFile.get(file) ?? [];
					const name = elementName(entity);
					if (!list.includes(name)) list.push(name);
					perFile.set(file, list);
				}
			}
		}
		for (const [file, elements] of perFile) {
			const hits = byFile.get(file) ?? [];
			hits.push({ featureId, depth, elements });
			byFile.set(file, hits);
		}
	}

	const findings: ImpactFinding[] = [];
	for (const [file, hits] of byFile) {
		const depth = Math.min(...hits.map((h) => h.depth));
		const features = [...new Set(hits.map((h) => input.leafNames[h.featureId] ?? h.featureId))];
		const elements = [...new Set(hits.flatMap((h) => h.elements))];
		const named = elements.slice(0, ELEMENTS_NAMED).join(', ');
		const more = elements.length > ELEMENTS_NAMED ? ` and ${elements.length - ELEMENTS_NAMED} more` : '';
		findings.push({
			id: stableId('imp', input.request.id, input.hypothesis, `file:${file}`),
			hypothesis: input.hypothesis,
			section: 'code',
			nodeId: `file:${file}`,
			nodeLabel: file,
			nodeKind: 'file',
			groupPath: features,
			note: `${elements.length} ${elements.length === 1 ? 'element' : 'elements'} of ${features.join(', ')} ${elements.length === 1 ? 'lives' : 'live'} here: ${named}${more}.`,
			codeWork: depth <= 1 ? (input.hypothesis === 'remove' ? 'remove' : 'change') : 'at_risk',
			depth,
			severity: depth <= 1 ? 'high' : depth === 2 ? 'medium' : 'low',
			migrationImplied: null,
			ruleWork: null
		});
	}
	return findings.sort((a, b) => a.depth - b.depth || a.nodeLabel.localeCompare(b.nodeLabel));
}

/** The feature ids the spec plane reached, with their depth, read off its findings. */
export function reachedFeatures(findings: readonly ImpactFinding[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const f of findings) {
		if (f.section !== 'leaves' || f.nodeKind !== 'feature') continue;
		const raw = f.nodeId.replace(/^feature:(beh:)?/, '');
		if (raw === '') continue;
		out[raw] = Math.min(out[raw] ?? Number.POSITIVE_INFINITY, f.depth);
	}
	return out;
}

/**
 * The report in plain words (ac-evo-imp-10): one line per plane, read without
 * the spec open. Names are given while they fit on a line; counts otherwise.
 */
/** The verb each section takes under each hypothesis (ac-evo-imp-12). */
const VERBS: Record<ImpactHypothesis, Record<string, string>> = {
	add: {
		screens: 'to extend',
		features: 'to re-read',
		cores: 'concerned',
		entities: 'that store something new',
		rules: 'to replay',
		roles: 'to grant',
		terms: 'whose definition to extend',
		code: 'to change'
	},
	change: {
		screens: 'to rework',
		features: 'to edit',
		cores: 'concerned',
		entities: 'to migrate if their shape changes',
		rules: 'to rewrite',
		roles: 'to set',
		terms: 'whose definition to re-read',
		code: 'to change'
	},
	remove: {
		screens: 'to strip',
		features: 'at risk of breaking',
		cores: 'concerned',
		entities: 'to migrate',
		rules: 'to rewrite or retire',
		roles: 'to revoke',
		terms: 'to retire or narrow',
		code: 'to remove'
	}
};

/** What happens to one node under its hypothesis, in one or two words (the side-by-side reading). */
export function impactVerb(f: ImpactFinding): string {
	if (f.section === 'code') return f.codeWork === 'remove' ? 'remove' : f.codeWork === 'at_risk' ? 'at risk' : 'change';
	// A migration is a migration however far the entity sits.
	if (f.section === 'entities_and_fields' && f.migrationImplied) return 'migrate';
	// Two links out, nothing is edited here: it rests on something that is, so it
	// has to be trusted again. WHAT that takes depends on what the node IS, not on
	// how far the walk came: replaying a rule and rereading a definition are not
	// the same afternoon. This used to answer "re-check" for every one of them,
	// which named the distance and left the reader to guess the work.
	if (f.depth > 1) {
		if (f.hypothesis === 'remove') return 'may break';
		switch (f.section) {
			case 'screens_and_journeys':
				return 'walk it again';
			case 'rules_and_scenarios':
				return 'replay it';
			case 'permissions':
				return 'check who may';
			case 'glossary_terms':
				return 'read the definition again';
			case 'entities_and_fields':
				return 'check the shape holds';
			default:
				return 'read its spec again';
		}
	}
	switch (f.section) {
		case 'screens_and_journeys':
			return f.hypothesis === 'add' ? 'extend' : f.hypothesis === 'change' ? 'rework' : 'strip';
		case 'rules_and_scenarios':
			return f.ruleWork === 'rewrite' ? (f.hypothesis === 'remove' ? 'rewrite or retire' : 'rewrite') : 'replay';
		case 'permissions':
			return f.hypothesis === 'add' ? 'grant' : f.hypothesis === 'change' ? 'set who may' : 'revoke';
		case 'glossary_terms':
			return f.hypothesis === 'add' ? 'extend' : f.hypothesis === 'change' ? 're-read' : 'retire or narrow';
		case 'entities_and_fields':
			return f.migrationImplied ? 'migrate' : f.hypothesis === 'add' ? 'may gain a field' : 'change its shape';
		default:
			if (f.nodeKind === 'core') return 'concerned';
			// A feature in this list is never one the request edits: the touched
			// features are where the walk STARTS and are left out of it. So a feature
			// row is one the change reached, and "write it" or "delete it" told the
			// reader to edit something nobody proposed to touch. What it takes is to
			// check that its spec still holds, and under a removal that it may break.
			return f.hypothesis === 'remove' ? 'may break' : 'read its spec again';
	}
}

/**
 * One sentence per hypothesis (ac-evo-imp-11): what it costs, read before any
 * list. Containers (cores) are not something that moves and are left out.
 */
export function impactSummaryLine(findings: readonly ImpactFinding[], hypothesis: ImpactHypothesis): string {
	const of = (section: string, kind?: string) =>
		findings.filter((f) => f.section === section && (kind === undefined || f.nodeKind === kind)).length;
	const knockOns = findings.filter((f) => f.section !== 'code' && f.depth > 1).length;
	const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
	const parts: string[] = [];
	const screens = of('screens_and_journeys');
	const rules = of('rules_and_scenarios');
	const roles = of('permissions');
	const terms = of('glossary_terms');
	const entities = of('entities_and_fields');
	const files = of('code');
	if (hypothesis === 'add') {
		if (screens) parts.push(`${n(screens, 'screen', 'screens')} to extend`);
		if (roles) parts.push(`${n(roles, 'role', 'roles')} to grant`);
		if (rules) parts.push(`${n(rules, 'rule', 'rules')} to replay`);
		if (entities) parts.push(`${n(entities, 'entity', 'entities')} that may gain a field`);
		if (terms) parts.push(`${n(terms, 'term', 'terms')} to extend`);
		if (files) parts.push(`${n(files, 'file', 'files')} to change`);
		return parts.length === 0
			? 'Nothing that exists moves: the addition lands inside the touched features.'
			: `Nothing that exists breaks. ${parts.join(', ')}.`;
	}
	if (hypothesis === 'change') {
		if (screens) parts.push(`${n(screens, 'screen', 'screens')} to rework`);
		if (rules) parts.push(`${n(rules, 'rule', 'rules')} to rewrite`);
		if (roles) parts.push(`${n(roles, 'role', 'roles')} to set`);
		if (entities) parts.push(`${n(entities, 'entity', 'entities')} that may migrate`);
		if (knockOns) parts.push(`${n(knockOns, 'knock-on', 'knock-ons')} to check`);
		if (terms) parts.push(`${n(terms, 'term', 'terms')} to re-read`);
		if (files) parts.push(`${n(files, 'file', 'files')} to change`);
		return parts.length === 0 ? 'Nothing beyond the touched features moves.' : `${parts.join(', ')}.`;
	}
	if (screens) parts.push(`${n(screens, 'screen', 'screens')} to strip`);
	if (roles) parts.push(`${n(roles, 'role', 'roles')} to revoke`);
	if (rules) parts.push(`${n(rules, 'rule', 'rules')} to rewrite or retire`);
	if (entities) parts.push(`${n(entities, 'entity', 'entities')} to migrate`);
	if (knockOns) parts.push(`${n(knockOns, 'knock-on', 'knock-ons')} that may break`);
	if (terms) parts.push(`${n(terms, 'term', 'terms')} to retire or narrow`);
	if (files) parts.push(`${n(files, 'file', 'files')} to remove`);
	return parts.length === 0 ? 'Nothing beyond the touched features depends on it.' : `${parts.join(', ')}.`;
}

export function impactInPlainWords(
	findings: readonly ImpactFinding[],
	hypothesis: ImpactHypothesis = findings[0]?.hypothesis ?? 'add'
): string[] {
	const verbs = VERBS[hypothesis];
	const spec = findings.filter((f) => f.section !== 'code');
	const code = findings.filter((f) => f.section === 'code');
	const lines: string[] = [];
	const say = (items: readonly ImpactFinding[], noun: string, plural: string, verb: string) => {
		if (items.length === 0) return;
		const names = items.map((f) => f.nodeLabel);
		const shown = names.length <= 4 ? `: ${names.join(', ')}` : `: ${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
		lines.push(`${items.length} ${items.length === 1 ? noun : plural} ${verb}${shown}.`);
	};
	say(spec.filter((f) => f.section === 'screens_and_journeys'), 'screen or journey', 'screens and journeys', verbs.screens);
	say(spec.filter((f) => f.section === 'leaves' && f.nodeKind === 'feature'), 'feature', 'features', verbs.features);
	say(spec.filter((f) => f.section === 'entities_and_fields'), 'entity or field', 'entities and fields', verbs.entities);
	say(spec.filter((f) => f.section === 'rules_and_scenarios'), 'rule', 'rules', verbs.rules);
	say(spec.filter((f) => f.section === 'permissions'), 'role', 'roles', verbs.roles);
	say(spec.filter((f) => f.section === 'glossary_terms'), 'term', 'terms', verbs.terms);
	if (spec.length === 0) lines.push('Nothing in the specification moves beyond the touched features.');
	if (code.length === 0) {
		lines.push('No file is anchored on the touched features yet: sync the implementation index from the checkout to read the code plane.');
	} else {
		const features = new Set(code.flatMap((f) => f.groupPath));
		const direct = code.filter((f) => f.depth <= 1).length;
		lines.push(
			`${code.length} ${code.length === 1 ? 'file' : 'files'} across ${features.size} ${features.size === 1 ? 'feature' : 'features'}: ${direct} ${verbs.code}, ${code.length - direct} at risk.`
		);
	}
	return lines;
}

const SECTION_NOUNS: Readonly<Record<string, readonly [string, string]>> = {
	leaves: ['feature', 'features'],
	screens_and_journeys: ['screen', 'screens'],
	entities_and_fields: ['entity', 'entities'],
	rules_and_scenarios: ['rule', 'rules'],
	permissions: ['role', 'roles'],
	glossary_terms: ['term', 'terms'],
	code: ['file', 'files']
};

/**
 * The sentence on top of the report, counted from the rows it SHOWS (ac: what
 * the report counts is what it shows). It used to be the summary of one walk,
 * so on a request that adds one feature and amends another it said "5 roles to
 * grant" above five rows reading "set who may".
 */
export function shownImpactSentence(rows: readonly { section: string; verb: string }[]): string {
	if (rows.length === 0) return 'Nothing that exists moves.';
	const counts = new Map<string, { section: string; verb: string; n: number }>();
	for (const row of rows) {
		const key = `${row.section}|${row.verb}`;
		const entry = counts.get(key) ?? { section: row.section, verb: row.verb, n: 0 };
		entry.n += 1;
		counts.set(key, entry);
	}
	const order = Object.keys(SECTION_NOUNS);
	const parts = [...counts.values()]
		.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || b.n - a.n)
		.map(({ section, verb, n }) => {
			const [one, many] = SECTION_NOUNS[section] ?? ['item', 'items'];
			// The verb is written for one row; counted, "read its spec again" becomes
			// "read their spec again" and "walk it again" becomes "walk them again".
			const said = n === 1 ? verb : verb.replace(/\bits\b/g, 'their').replace(/\bit\b/g, 'them');
			const what = said.startsWith('may ') || said === 'at risk' ? `that ${said}` : `to ${said}`;
			return `${n} ${n === 1 ? one : many} ${what}`;
		});
	const breaks = rows.some((r) => r.verb === 'may break' || r.verb === 'at risk');
	return `${breaks ? '' : 'Nothing that exists breaks. '}${parts.join(', ')}.`;
}

/**
 * Why a report came back with nothing in it (c62c57a6). A change that declares
 * nothing to walk from has an empty report for THAT reason, which is not the
 * same as a change with no consequence, and the two are never allowed to read
 * alike: an addition with no dependency has no neighbours in the graph yet, so
 * silence there means "nothing was said", not "nothing follows".
 */
export function emptyImpactReason(request: {
	readonly leafIds: readonly string[];
	readonly drafts: readonly {
		readonly kind: string;
		readonly name: string;
		readonly dependsOn: readonly string[];
		readonly behaviour: readonly unknown[];
		readonly acceptanceCriteria: readonly unknown[];
	}[];
}): string {
	if (request.leafIds.length === 0 && request.drafts.length === 0)
		return 'The request names no feature yet, so there is nothing to walk from.';
	const silentAdds = request.drafts.filter((d) => d.kind === 'add' && d.dependsOn.length === 0);
	if (silentAdds.length > 0 && silentAdds.length === request.drafts.length && request.leafIds.every((id) => id.startsWith('draft:')))
		return `${silentAdds.map((d) => `"${d.name}"`).join(', ')} ${silentAdds.length === 1 ? 'declares' : 'declare'} nothing it depends on, so the walk had nowhere to go. This says nothing was declared, not that nothing follows: name what it depends on and compute again.`;
	if (request.drafts.length > 0 && request.drafts.every((d) => d.kind === 'amend' && d.dependsOn.length === 0 && d.behaviour.length === 0 && d.acceptanceCriteria.length === 0))
		return 'The change only rewords what it touches: a wording moves nothing else in the specification.';
	return 'Nothing in the specification is linked to the touched features, so nothing moves with them.';
}
