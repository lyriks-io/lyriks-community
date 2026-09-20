import type { CoherenceFinding, EvolutionRequest } from './draft';
import { COHERENCE_AXES } from './enums';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The coherence report for one request: five axes, walked over the WHOLE
 * project.
 *
 * Two refusals carry the design. The check only means something over the whole
 * project, because the contradictions live between the request and capabilities
 * declared eighteen pages away. And the LLM never produces this report: a model
 * asked whether a change is coherent will produce something plausible, and the
 * report has to be reproducible.
 */

export const AXIS_COUNT = COHERENCE_AXES.length;

export function canRunCheck(
	request: EvolutionRequest,
	scope: 'request_only' | 'whole_project',
	producer: 'engine' | 'llm'
): Guarded {
	return firstRefusal(
		guard(
			scope !== 'whole_project',
			'A coherence check only means something over the whole project.',
			'Checking the request against itself finds nothing, because the contradictions live between the request and capabilities declared elsewhere in the spec.'
		),
		guard(
			request.coherenceReport.status === 'running',
			'A check is already running on this request.',
			'The second run would report against a project state the first one is still reading, and the two headers would disagree.'
		),
		guard(
			producer === 'llm',
			'The coherence report is produced by the engine, not by the LLM.',
			'A model asked whether a change is coherent will produce something plausible. The report has to be reproducible, so it comes from the engine walking the graph.'
		)
	);
}

/**
 * A finding is published only when it names BOTH nodes and offers somewhere to
 * go and fix it. Naming only the node in the request tells the reader something
 * is wrong without telling them what it collides with, which is not actionable;
 * and a finding the reader cannot act on from where they are sends them hunting
 * through the spec, which is the cost the report exists to remove.
 */
export function canPublishFinding(finding: CoherenceFinding): Guarded {
	return firstRefusal(
		guard(
			namedNodeCount(finding) < 2,
			'A finding must name both nodes, not only the offending one.',
			'Naming only the node in the request tells the reader something is wrong without telling them what it collides with, which is not actionable.'
		),
		guard(
			finding.fixNowTarget.trim() === '',
			'This finding has no Fix now target.',
			'A finding the reader cannot act on from where they are sends them hunting through the spec, which is the cost the report exists to remove.'
		)
	);
}

/** A contradiction is a relation between two nodes, so a finding with one is not a finding. */
export function namedNodeCount(finding: CoherenceFinding): number {
	return [finding.requestNodeId, finding.existingNodeId].filter((n) => n.trim() !== '').length;
}

/** Fix now works on published findings: an unpublished one may still be revised. */
export function canFixNow(finding: CoherenceFinding): Guarded {
	return guard(
		!finding.published,
		'This finding is not in the report yet.',
		'An unpublished finding may still be revised by the engine, so its target is not stable enough to send a person into the spec.'
	);
}

/** Findings the reader actually sees, worst first. */
export function publishedFindings(request: EvolutionRequest): CoherenceFinding[] {
	const order = { blocking: 0, major: 1, minor: 2 } as const;
	return request.coherenceFindings
		.filter((f) => f.published)
		.slice()
		.sort((a, b) => order[a.severity] - order[b.severity]);
}
