import {
	keyPlaces,
	locatedFeature,
	planPositions,
	type LocatedFeature,
	type PositionsPlan
} from '$domain/implementation';
import type { BehaviorPort, CodeAdoptionPort } from '../ports';
import { readProjectIndexUnits } from './read-project-index-units';

type Row = Readonly<Record<string, unknown>>;

/** A move of lines that landed (with the reports the engine refused), or why it could not be planned. */
export type PositionsOutcome =
	| { readonly ok: true; readonly plan: PositionsPlan; readonly failures: readonly Row[] }
	| { readonly ok: false; readonly error: string };

/**
 * Update where located elements now stand (feat-100, action f20cf75e,
 * criterion e9699cc6): the keys sent keep their coverage, only their file, line
 * and code line move. Lyriks holds no positions-only write in the engine, so
 * each report a moved key lives in is read back and landed again with exactly
 * what it located, the moved places replaced.
 */
export class MoveIndexPositionsUseCase {
	constructor(
		private readonly behavior: Pick<BehaviorPort, 'readProject' | 'readFeature'>,
		private readonly adoption: CodeAdoptionPort
	) {}

	/** The units the keys sent travel with (and the criteria among them): what a revision guard compares. */
	async unitsOf(projectId: string, keys: readonly string[]): Promise<string[]> {
		const { features } = await readProjectIndexUnits(this.behavior, projectId);
		const places = keyPlaces(features);
		const units = new Set<string>();
		for (const key of keys) {
			for (const place of places.get(key) ?? []) {
				if (place.unit) units.add(place.unit);
				else if (key.startsWith('criterion:')) units.add(key);
			}
		}
		return [...units];
	}

	/** Read what is located, plan the move, land it; null when the engine does not answer. */
	async execute(projectId: string, entries: Readonly<Record<string, unknown>>): Promise<PositionsOutcome | null> {
		const { features, snapshots } = await readProjectIndexUnits(this.behavior, projectId);
		const places = keyPlaces(features);
		const unitKeys = new Map(features.flatMap((feature) => feature.units.map((unit) => [unit.unit, unit.keys] as const)));
		const touched = new Set<string>();
		for (const key of Object.keys(entries)) for (const place of places.get(key) ?? []) touched.add(place.featureId);

		const located = new Map<string, LocatedFeature>();
		for (const featureId of touched) {
			const status = await this.adoption.getImplementationStatus(featureId);
			if (status === null) return null;
			if (!status.ok) return { ok: false, error: status.error };
			located.set(featureId, locatedFeature(snapshots.get(featureId) ?? {}, status.value));
		}

		const plan = planPositions(entries, places, unitKeys, located);
		const failures: Row[] = [];
		for (const batch of plan.batches) {
			const landed = await this.adoption.syncImplementationIndex(projectId, batch);
			if (landed === null) return null;
			if (!landed.ok) {
				failures.push({ ok: false, batch: Object.keys(batch), error: landed.error });
				continue;
			}
			const acks = Array.isArray(landed.value.acks) ? (landed.value.acks as Row[]) : [];
			failures.push(...acks.filter((ack) => ack && ack.ok === false));
		}
		return { ok: true, plan, failures };
	}
}
