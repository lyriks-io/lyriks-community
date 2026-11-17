import type { Actor, EvolutionRequest } from './draft';
import { COHERENCE_AXES, type CoherenceAxis, type FindingSeverity } from './enums';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * Two scores, two questions, no composite.
 *
 * Maturity says how full the specification is (see `maturity.ts`). Coherence
 * says whether it contradicts the existing product. Each is displayed with its meaning and
 * with what it does not measure, and none of them ever blocks a crossing by
 * itself: what blocks is named, a critical empty field or an undecided
 * blocking finding, and the gate reads those.
 */

export const COHERENCE_STATEMENT =
	'What the engine found against the existing product, with the undecided findings weighted by severity. It never blocks by itself: an undecided blocking finding does.';

/** Blocking outweighs major outweighs minor, so the breakdown orders the work. */
export const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { blocking: 3, major: 2, minor: 1 };

export interface AxisReading {
	readonly axis: CoherenceAxis;
	readonly blocking: number;
	readonly major: number;
	readonly minor: number;
	/** The severity-weighted load of undecided findings on this axis. */
	readonly weight: number;
}

export interface CoherenceReading {
	/** False until the engine has run on this request. */
	readonly available: boolean;
	/** The project score with the request absorbed, as the engine reported it. */
	readonly overall: number | null;
	readonly delta: number;
	/** What blocks: undecided findings of blocking severity. */
	readonly blockingUndecided: number;
	readonly undecidedWeight: number;
	readonly perAxis: readonly AxisReading[];
	readonly statement: string;
}

/**
 * Read the coherence of one request. The number is the engine's, never a
 * formula invented here: the engine walks the whole project and reports a
 * score with the request absorbed. What this adds is the breakdown that says
 * where the load is, per axis and weighted by severity, so a reader knows
 * what would move the number. A finding is undecided while it is published;
 * fixing it removes it at the next run.
 */
export function readCoherence(request: EvolutionRequest): CoherenceReading {
	const undecided = request.coherenceFindings.filter((f) => f.published && f.scope !== 'inherited' && !f.risk);
	const perAxis = COHERENCE_AXES.map((axis): AxisReading => {
		const here = undecided.filter((f) => f.axis === axis.code);
		const count = (severity: FindingSeverity) => here.filter((f) => f.severity === severity).length;
		return {
			axis: axis.code,
			blocking: count('blocking'),
			major: count('major'),
			minor: count('minor'),
			weight: here.reduce((n, f) => n + SEVERITY_WEIGHT[f.severity], 0)
		};
	});
	const available = request.coherenceReport.status === 'ready';
	return {
		available,
		overall: available ? request.coherenceReport.projectScore : null,
		delta: request.coherenceReport.requestDelta,
		blockingUndecided: undecided.filter((f) => f.severity === 'blocking').length,
		undecidedWeight: perAxis.reduce((n, a) => n + a.weight, 0),
		perAxis,
		statement: COHERENCE_STATEMENT
	};
}
