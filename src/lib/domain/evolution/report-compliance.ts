import type { EvolutionRequest, ImplementationFinding } from './draft';

/**
 * How many of the requirements a request answers for comply with the spec on
 * its latest report, the way the Verification counts them: a requirement is
 * what the spec asks for (compliant, a gap or an omission, never what the code
 * added or broke), and it complies once the code does what the spec says or a
 * person settled it (a gap kept as built, an omission deferred). Lines the
 * touched features already held before the request are their backlog, never
 * this request's.
 */
export interface RequirementCompliance {
	readonly complying: number;
	readonly total: number;
	/** The numbered attempts the code went through, one at least. */
	readonly cycles: number;
}

const REQUIREMENT_VERDICTS: ReadonlySet<ImplementationFinding['verdict']> = new Set(['conform', 'non_conform', 'missing']);

/** A line of the request's own report, on its latest iteration. */
export const ownLatestLines = (request: Pick<EvolutionRequest, 'implementationFindings' | 'iteration'>): ImplementationFinding[] =>
	request.implementationFindings.filter((l) => l.iteration === request.iteration && l.scope !== 'inherited');

const complies = (l: ImplementationFinding): boolean => (l.verdict === 'conform' && l.decision !== 'invalidated') || l.decision === 'validated';

export function requirementCompliance(request: Pick<EvolutionRequest, 'implementationFindings' | 'iteration'>): RequirementCompliance {
	const asked = ownLatestLines(request).filter((l) => REQUIREMENT_VERDICTS.has(l.verdict));
	return { complying: asked.filter(complies).length, total: asked.length, cycles: Math.max(1, request.iteration) };
}

/** "3 / 4 requirements comply with the spec after 2 cycles."; empty when no requirement was read against the code. */
export function complianceSentence(c: RequirementCompliance): string {
	if (c.total === 0) return '';
	return `${c.complying} / ${c.total} ${c.total === 1 ? 'requirement complies' : 'requirements comply'} with the spec after ${c.cycles} ${c.cycles === 1 ? 'cycle' : 'cycles'}.`;
}
