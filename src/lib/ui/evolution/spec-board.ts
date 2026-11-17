import type { LocalGraph } from '$domain/evolution';

/**
 * The Specification tab read like the design: what the person's AI has
 * written of the specification so far, line by line, and how much behaviour
 * each touched feature carries. Every line is read from the request as it
 * stands, which the page re-reads as the AI writes through the MCP: nothing
 * here runs on a timer.
 */

/** The actions and rules under one touched feature in the request's graph, and how many of them the request moves. */
export function featureFigures(graph: LocalGraph | null, featureIds: readonly string[]): { actions: number; rules: number; moved: number } {
	if (!graph) return { actions: 0, rules: 0, moved: 0 };
	const roots = new Set(featureIds.flatMap((id) => [`feature:${id}`, `feature:${id.replace(/^draft:/, '')}`]));
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const under = (id: string | null): boolean => {
		const seen = new Set<string>();
		while (id && !seen.has(id)) {
			if (roots.has(id)) return true;
			seen.add(id);
			id = byId.get(id)?.parentId ?? null;
		}
		return false;
	};
	const mine = graph.nodes.filter((n) => (n.kind === 'action' || n.kind === 'rule') && under(n.parentId));
	return {
		actions: mine.filter((n) => n.kind === 'action').length,
		rules: mine.filter((n) => n.kind === 'rule').length,
		moved: mine.filter((n) => n.status === 'added' || n.status === 'changed' || n.status === 'removed').length
	};
}

export interface SpecFacts {
	/** How many of the descriptions of the Solution, the Functional and the Technical spec are written. */
	readonly descriptionsWritten: number;
	readonly questionsAsked: number;
	readonly questionsOpen: number;
	readonly features: number;
	/** The features the request adds, and how many of them already carry a behaviour model. */
	readonly featuresAdded: number;
	readonly featuresAddedModelled: number;
	readonly flows: number;
	readonly functionalNotApplicable: boolean;
	readonly dataChanges: number;
	/** The changes to the other pages of the spec (ac-evo-draft-section): a request may carry only those. */
	readonly pageChanges?: number;
	/** The Technical spec is written (or marked not applicable): what it moves of the data is said, even when nothing. */
	readonly technicalSettled: boolean;
	/** The person's AI read the request through the MCP, seen live by the page. */
	readonly aiRead: boolean;
}

export interface SpecLine {
	readonly label: string;
	readonly done: boolean;
	readonly note: string;
}

/**
 * Whether the AI has written the specification yet: once the request names a
 * touched feature or a table change, the tab shows what it holds instead of
 * waiting for it.
 */
export function specWritten(f: Pick<SpecFacts, 'features' | 'dataChanges'> & { readonly pageChanges?: number }): boolean {
	return f.features > 0 || f.dataChanges > 0 || (f.pageChanges ?? 0) > 0;
}

/**
 * The six things a specification is written through, each done once the
 * request holds it. Nothing ticks before the AI has read the request (or
 * already wrote into it), so the lines follow the AI rather than what people
 * typed before it came.
 */
export function specChecklist(f: SpecFacts): SpecLine[] {
	const answered = f.questionsAsked - f.questionsOpen;
	const started = f.aiRead || specWritten(f);
	return [
		{ label: 'Reading the Solution', done: started, note: `${f.descriptionsWritten} of 3 descriptions` },
		{
			label: 'Asking you clarifying questions',
			done: started && f.questionsOpen === 0,
			note: f.questionsAsked === 0 ? 'none asked' : `${answered} answered${f.questionsOpen > 0 ? `, ${f.questionsOpen} open` : ''}`
		},
		{ label: 'Finding the core feature and the features', done: f.features > 0, note: `${f.features} ${f.features === 1 ? 'feature' : 'features'}` },
		{
			label: 'Writing actions and rules',
			done: f.features > 0 && f.featuresAddedModelled === f.featuresAdded,
			note: f.featuresAdded === 0 ? 'no new feature' : `${f.featuresAddedModelled} of ${f.featuresAdded} new features modelled`
		},
		{ label: 'Drawing the user journey', done: started && (f.flows > 0 || f.functionalNotApplicable), note: f.functionalNotApplicable ? 'not applicable' : `${f.flows} ${f.flows === 1 ? 'flow' : 'flows'}` },
		{
			label: 'Updating the datamap',
			done: f.dataChanges > 0 || (started && f.technicalSettled),
			note: f.dataChanges > 0 ? `${f.dataChanges} ${f.dataChanges === 1 ? 'table' : 'tables'}` : f.technicalSettled ? 'no table changes' : ''
		}
	];
}
