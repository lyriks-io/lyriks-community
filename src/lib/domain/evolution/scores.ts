import type { Actor, EvolutionRequest, ReadinessExclusion } from './draft';
import { COHERENCE_AXES, type CoherenceAxis, type FindingSeverity } from './enums';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * Three scores, three questions, no composite.
 *
 * Maturity says how full the specification is (see `maturity.ts`). Coherence
 * says whether it contradicts the existing product. Readiness says how far the
 * touched features are from shippable. Each is displayed with its meaning and
 * with what it does not measure, and none of them ever blocks a crossing by
 * itself: what blocks is named, a critical empty field or an undecided
 * blocking finding, and the gate reads those.
 */

export const COHERENCE_STATEMENT =
	'What the engine found against the existing product, with the undecided findings weighted by severity. It never blocks by itself: an undecided blocking finding does.';

export const READINESS_STATEMENT =
	'The average TRL of the features this change touches. Displayed, never typed; it never blocks by itself.';

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
	const undecided = request.coherenceFindings.filter((f) => f.published);
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

/**
 * The platform's projection of a 0-100 behaviour maturity onto the 1-9 TRL
 * scale, the same one the feature badge and the target-TRL grammar use.
 */
export function trlFromMaturityScore(score: number): number {
	return Math.max(1, Math.min(9, Math.round((score / 100) * 9)));
}

export interface LeafReadiness {
	readonly leafId: string;
	/** Null when neither a hand-set override nor an engine score exists yet. */
	readonly trl: number | null;
	readonly excluded: boolean;
	readonly exclusion: ReadinessExclusion | null;
}

export interface ReadinessReading {
	/** False when no touched feature has a readable TRL. */
	readonly available: boolean;
	/** The average TRL of the touched features not excluded, rounded. */
	readonly average: number | null;
	readonly leaves: readonly LeafReadiness[];
	readonly excludedCount: number;
	readonly statement: string;
}

/**
 * Read the readiness of one request: the average TRL of the features it
 * touches, excluded ones aside. An exclusion is an admin's traced decision, so
 * the leaf stays listed with the reason rather than silently dropped.
 */
export function readReadiness(
	request: EvolutionRequest,
	trlByLeaf: Readonly<Record<string, number | null>>
): ReadinessReading {
	const leaves = request.leafIds.map((leafId): LeafReadiness => {
		const exclusion = request.readinessExclusions.find((e) => e.leafId === leafId) ?? null;
		return { leafId, trl: trlByLeaf[leafId] ?? null, excluded: exclusion !== null, exclusion };
	});
	const counted = leaves.filter((l) => !l.excluded && l.trl !== null);
	const average =
		counted.length === 0
			? null
			: Math.round(counted.reduce((n, l) => n + (l.trl as number), 0) / counted.length);
	return {
		available: average !== null,
		average,
		leaves,
		excludedCount: leaves.filter((l) => l.excluded).length,
		statement: READINESS_STATEMENT
	};
}

/**
 * Excluding a feature from the readiness average is reserved to a workspace
 * admin or owner, needs a reason, and is recorded in the history: the score
 * can be shaped only by someone accountable for it, and the shaping is traced.
 */
export function canExcludeFromReadiness(
	actor: Actor,
	input: { touched: boolean; alreadyExcluded: boolean; reason: string }
): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'An AI client cannot shape the readiness score.',
			'Exclusion is a decision, and decisions belong to people.'
		),
		guard(
			actor.role !== 'admin' && actor.role !== 'owner',
			'Only a workspace admin or owner can exclude a feature from readiness.',
			'The score can be shaped only by someone accountable for it, and the act is traced.'
		),
		guard(
			!input.touched,
			'This feature is not touched by the request.',
			'Only a touched feature enters the average, so only a touched feature can leave it.'
		),
		guard(
			input.alreadyExcluded,
			'This feature is already excluded.',
			'Excluding twice would trace one decision as two.'
		),
		guard(
			input.reason.trim() === '',
			'An exclusion needs a reason; it is a traced decision.',
			'A reasonless exclusion is indistinguishable from gaming the score.'
		)
	);
}

/** Bringing a feature back into the average is the same kind of act. */
export function canRestoreToReadiness(actor: Actor, excluded: boolean): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'An AI client cannot shape the readiness score.',
			'Exclusion is a decision, and decisions belong to people.'
		),
		guard(
			actor.role !== 'admin' && actor.role !== 'owner',
			'Only a workspace admin or owner can bring a feature back into readiness.',
			'The score can be shaped only by someone accountable for it, and the act is traced.'
		),
		guard(!excluded, 'This feature is not excluded.', 'Nothing to restore.')
	);
}

/** Apply an exclusion. The caller has passed `canExcludeFromReadiness`. */
export function excludeFromReadiness(
	request: EvolutionRequest,
	exclusion: ReadinessExclusion
): EvolutionRequest {
	return { ...request, readinessExclusions: [...request.readinessExclusions, exclusion] };
}

export function restoreToReadiness(request: EvolutionRequest, leafId: string): EvolutionRequest {
	return {
		...request,
		readinessExclusions: request.readinessExclusions.filter((e) => e.leafId !== leafId)
	};
}
