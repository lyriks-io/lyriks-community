import type { ImplementationFinding, ProjectEvolutionDraft } from '$domain/evolution';

/**
 * The Evolution document as it is written, the counterpart of
 * `parseEvolutionDraft`. Its report lines weigh most of it: one per element of
 * every feature a request touches, thousands on a project carried through
 * several requests. A line keeps only what differs from what the parser gives
 * back by default, and a line the request inherits (the features' backlog,
 * listed for information, never decided) keeps no statement of the spec nor of
 * the code, which no page shows. Read back, every other line is what it was.
 */

/** What `parseImplementationFinding` gives a line that does not say it. */
const DEFAULTS: Partial<Record<keyof ImplementationFinding, unknown>> = {
	decidedAt: null,
	decidedBy: null,
	decision: 'undecided',
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	hasRequirementAnchor: true,
	filePath: '',
	lineRange: ''
};

/** The two texts an inherited line does without. */
const INHERITED_TEXTS: ReadonlySet<string> = new Set(['specStatement', 'codeStatement']);

export function storedLine(line: ImplementationFinding): Record<string, unknown> {
	const inherited = line.scope === 'inherited';
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(line)) {
		if (key in DEFAULTS && DEFAULTS[key as keyof ImplementationFinding] === value) continue;
		if (inherited && INHERITED_TEXTS.has(key)) continue;
		out[key] = value;
	}
	return out;
}

export function storedEvolutionDraft(draft: ProjectEvolutionDraft): unknown {
	return { ...draft, requests: draft.requests.map((r) => ({ ...r, implementationFindings: r.implementationFindings.map(storedLine) })) };
}
