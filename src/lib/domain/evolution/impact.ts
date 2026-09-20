import {
	MAX_IMPACT_DEPTH,
	MAX_LENS_DEPTH,
	type ImpactHypothesis,
	type ImpactSection
} from './enums';
import type { EvolutionRequest, ImpactFinding } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The impact report: what a change propagates to, read under one of three
 * hypotheses.
 *
 * The three are read separately and never merged into one list, because removing
 * does not break what adding breaks. Everything below follows from that: the
 * hypothesis is part of the question, switching it throws the previous result
 * away rather than relabelling it, and the findings are stored per hypothesis.
 */

/** A propagation of depth zero returns the touched node, which the author already knows about. */
export function canComputePropagation(depth: number): Guarded {
	return firstRefusal(
		guard(
			depth < 1,
			'The depth must be at least one step.',
			'A propagation of depth zero returns the touched node itself, which the author already knows about.'
		),
		guard(
			depth > MAX_IMPACT_DEPTH,
			`The propagation stops at ${MAX_IMPACT_DEPTH} steps.`,
			'Beyond five steps nearly everything in the project is reachable, so the list stops separating what moves from what does not.'
		)
	);
}

/**
 * What a distance MEANS for whoever reads it, which is the only reason to print
 * one.
 *
 * The number is a fact of the graph: how many links the propagation walked to
 * arrive. On its own it changes nothing about what a reader does, and a column
 * of numbers that changes nothing is decoration. What changes is this: at one
 * link the change is made IN the node, so it is opened and edited; at two the
 * node is not edited at all, it merely rests on something that is, so it has to
 * be checked before it can be trusted; beyond that it is neighbourhood, listed
 * so the reader can decide whether it is worth a look.
 */
export function reachLabel(depth: number): string {
	if (depth <= 1) return 'direct';
	if (depth === 2) return 'knock-on';
	return `${depth} steps out`;
}

export function reachMeaning(depth: number): string {
	if (depth <= 1)
		return 'The change is made here. This is a node you will open and edit yourself.';
	if (depth === 2)
		return 'Nothing is edited here. It rests on something the change does edit, so it has to be re-read, re-run or re-approved before it can be trusted.';
	return `Further out in the neighbourhood, reached through ${depth - 1} links. It is listed so you can decide whether it is worth looking at, not because it is known to move.`;
}

/** A hypothesis has been read once findings were produced under it. */
export function hasReading(request: EvolutionRequest, hypothesis: ImpactHypothesis): boolean {
	return request.impactFindings.some((f) => f.hypothesis === hypothesis);
}

/**
 * Switching hypothesis before ANY propagation would show an empty report under a
 * different label, which reads as an absence of impact.
 *
 * It is the first run that is guarded, not every switch after it. Reading the
 * status of the hypothesis on screen would lock the reader on the first one they
 * picked: switching sets that status back to not_run by design, so the next click
 * would be refused, and a report that was computed would sit there unreachable
 * with nothing saying why.
 */
export function canSwitchHypothesis(request: EvolutionRequest): Guarded {
	return guard(
		request.impactReport.ranAt === null && request.impactFindings.length === 0,
		'There is nothing to switch yet.',
		'Switching hypothesis before a first propagation would show an empty report under a different label, which reads as an absence of impact.'
	);
}

/**
 * The previous result never carries over: a reading is never relabelled as the
 * answer to another question. The three are stored side by side, so moving
 * between them is a change of question and not a loss, and a hypothesis that was
 * already read comes back as read rather than asking to be computed again.
 */
export function switchHypothesis(
	request: EvolutionRequest,
	hypothesis: ImpactHypothesis
): EvolutionRequest {
	return {
		...request,
		impactReport: {
			...request.impactReport,
			hypothesis,
			status: hasReading(request, hypothesis) ? 'ready' : 'not_run'
		}
	};
}

/** The findings of the hypothesis currently on screen. */
export function findingsForCurrentHypothesis(request: EvolutionRequest): ImpactFinding[] {
	return request.impactFindings.filter((f) => f.hypothesis === request.impactReport.hypothesis);
}

/** The findings of one section of the list. The six sections are never mixed. */
export function findingsInSection(
	request: EvolutionRequest,
	section: ImpactSection
): ImpactFinding[] {
	return findingsForCurrentHypothesis(request).filter((f) => f.section === section);
}

/**
 * Entities open only once each one states whether a data migration is implied.
 * An entity impact read without that answer looks like a cheap change, and the
 * migration is then discovered during implementation, which is the failure this
 * report exists to prevent. An empty section is not opened at all, because a
 * section that opens on nothing makes the reader wonder whether the engine ran.
 */
export function canOpenEntities(request: EvolutionRequest): Guarded {
	const entities = findingsInSection(request, 'entities_and_fields');
	return firstRefusal(
		guard(
			entities.length < 1,
			'No entity moves under this hypothesis.',
			'An empty section that opens anyway makes the reader wonder whether the engine ran, so the report says plainly that nothing moves here.'
		),
		guard(
			entities.some((f) => f.migrationImplied === null),
			'The entity impacts do not say whether a migration is implied.',
			'An entity impact read without that answer looks like a cheap change, and the migration is then discovered during implementation, which is the failure this report exists to prevent.'
		)
	);
}

/** Rules whose text still holds and only need running again. */
export function rulesToReplay(request: EvolutionRequest): ImpactFinding[] {
	return findingsInSection(request, 'rules_and_scenarios').filter((f) => f.ruleWork === 'replay');
}

/**
 * Rules whose text no longer holds and need a person to write them again. Kept
 * apart from the replays, because the two cost nothing alike, and a single
 * undifferentiated count hides the only thing the reader is deciding on.
 */
export function rulesToRewrite(request: EvolutionRequest): ImpactFinding[] {
	return findingsInSection(request, 'rules_and_scenarios').filter((f) => f.ruleWork === 'rewrite');
}

/** Replays and rewrites are counted apart before the section opens. */
export function canOpenRules(request: EvolutionRequest): Guarded {
	const rules = findingsInSection(request, 'rules_and_scenarios');
	return firstRefusal(
		guard(
			rules.length < 1,
			'No rule moves under this hypothesis.',
			'An empty section that opens anyway makes the reader wonder whether the engine ran.'
		),
		guard(
			rules.some((f) => f.ruleWork === null),
			'The rules to rewrite have not been separated from the rules to replay.',
			'A single undifferentiated count of touched rules hides the only thing the reader is deciding on, which is how much writing the change costs.'
		)
	);
}

/** The worst severity found, which is what the board card prints. */
export function highestImpactSeverity(request: EvolutionRequest): ImpactFinding['severity'] {
	const order: ImpactFinding['severity'][] = ['none', 'low', 'medium', 'high', 'blocking'];
	let worst: ImpactFinding['severity'] = 'none';
	for (const f of request.impactFindings) {
		if (order.indexOf(f.severity) > order.indexOf(worst)) worst = f.severity;
	}
	return worst;
}

/**
 * The read-only graph lens of block 08. It goes no further than three hops:
 * beyond that the neighbourhood covers most of the product and stops telling the
 * author anything about their change. And it needs a node to centre on before a
 * depth means anything.
 */
export function canChooseLensDepth(depth: number, rootLeafId: string | null): Guarded {
	return firstRefusal(
		guard(
			!rootLeafId,
			'The request has no main leaf yet, so there is no neighbourhood to draw.',
			'The lens needs a node to centre on before a depth means anything.'
		),
		guard(
			depth < 1 || depth > MAX_LENS_DEPTH,
			`The lens goes no further than ${MAX_LENS_DEPTH} steps.`,
			'Beyond three steps the neighbourhood covers most of the product and stops telling the author anything about their change.'
		)
	);
}

/**
 * The lens reads the graph and never writes it. Authoring from here would create
 * dependencies that no capability owns, so the reader is sent to the node's own
 * capability instead. This guard has no success path on purpose.
 */
export function canAuthorFromLens(): Guarded {
	return guard(
		true,
		'The graph is read here, never written here.',
		'Authoring from the lens would create dependencies that no capability owns; the reader is sent to the capability that owns the node instead.'
	);
}

/** Clicking a node opens its canonical capability, so the node must name one. */
export function canOpenNode(selectedNodeSection: string): Guarded {
	return guard(
		selectedNodeSection.trim() === '',
		'This node does not name the capability it belongs to.',
		'A node with no owning capability has nowhere to open, and the lens will not offer an editor of its own instead.'
	);
}
