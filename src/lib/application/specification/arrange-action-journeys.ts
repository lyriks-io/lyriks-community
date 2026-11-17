import { applyJourneyAct, parseActionJourneys, type ActionJourney, type JourneyAct } from '$domain/features';
import type { BehaviorPort } from '../ports/behavior-port';
import type { ProjectResidueRepositoryPort } from '../ports/project-residue-repository';

export type ArrangeActionJourneysResult = { readonly ok: true; readonly journeys: ActionJourney[] } | { readonly ok: false; readonly refusal: string; readonly missing: boolean };

/** The residue section the journeys ride in, beside the rest of the features' decoration. */
const SECTION = 'features';

/** The ids of the actions a feature snapshot declares, on every surface. */
export function actionIdsOf(feature: Record<string, unknown> | undefined): string[] {
	const surfaces = Array.isArray(feature?.surfaces) ? (feature.surfaces as { actions?: unknown }[]) : [];
	return surfaces.flatMap((s) => (Array.isArray(s.actions) ? (s.actions as { id?: unknown }[]) : [])).flatMap((a) => (typeof a.id === 'string' ? [a.id] : []));
}

/**
 * One change a person makes to the journeys of a feature's actions (action
 * 2d9a8378), saved at once, apart from the Edit mode: the arrangement changes
 * how the team reads the feature, never what its actions do. Written straight
 * to the residue, so it is the one path that sets a journey as a person's.
 */
export class ArrangeActionJourneysUseCase {
	constructor(
		private readonly behavior: BehaviorPort,
		private readonly residue: ProjectResidueRepositoryPort
	) {}

	async execute(projectId: string, featureId: string, act: JourneyAct): Promise<ArrangeActionJourneysResult> {
		const snapshot = await this.behavior.readFeature(projectId, featureId);
		if (!snapshot) return { ok: false, refusal: 'This feature is not in the specification.', missing: true };
		const stored = ((await this.residue.load(projectId, SECTION)) ?? {}) as Record<string, unknown>;
		const all = parseActionJourneys(stored.actionJourneys, new Set([...Object.keys((stored.actionJourneys as object) ?? {}), featureId]));
		const outcome = applyJourneyAct(all[featureId] ?? [], act, new Set(actionIdsOf(snapshot.feature)));
		if (!outcome.ok) return { ok: false, refusal: outcome.refusal, missing: false };
		const actionJourneys = { ...all, [featureId]: outcome.journeys };
		if (!outcome.journeys.length) delete actionJourneys[featureId];
		await this.residue.save(projectId, SECTION, { ...stored, actionJourneys });
		return { ok: true, journeys: outcome.journeys };
	}
}

/** The journeys of one feature's actions as stored, people's and suggestions alike (action f3bbf419). */
export class LoadActionJourneysUseCase {
	constructor(private readonly residue: ProjectResidueRepositoryPort) {}

	async execute(projectId: string, featureId: string): Promise<ActionJourney[]> {
		const stored = ((await this.residue.load(projectId, SECTION)) ?? {}) as Record<string, unknown>;
		return parseActionJourneys(stored.actionJourneys, new Set([featureId]))[featureId] ?? [];
	}
}
