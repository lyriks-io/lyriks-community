import { incompatibility, type LinkAuthor, type ProjectDataDraft } from '$domain/data';
import type { SpecLanguage } from '$domain/language';
import { dataFieldAddress, type DataBehaviour, type TieableState } from './data-behaviour';

/**
 * How links from data fields to the behaviour states that carry them are
 * written to the engine, whoever asks: a person on the Rules reading, an AI
 * client from its evidence, or Lyriks by itself. One plan for many links, so a
 * call that links a whole table is one engine batch; a link that cannot be made
 * is refused with its reason and the others still apply.
 *
 * Pure: the draft and the engine's reading in, the engine operations and the
 * record of who linked what out.
 */

/**
 * Link a field to a state, or unlink it with `statePath: null`. With `also`,
 * the state is a further carrier of the field, beside the first one the solver
 * checks, and `statePath: null` takes back the field's further carriers only
 * (criterion 3238573b).
 */
export interface LinkRequest {
	readonly fieldId: string;
	readonly statePath: string | null;
	readonly also?: boolean;
}

export interface LinkOutcome {
	readonly fieldId: string;
	readonly statePath: string | null;
	readonly ok: boolean;
	/** Why it was refused, in a sentence to relay. */
	readonly error?: string;
	/** For a refusal: the HTTP status a single request answers with. */
	readonly status?: 400 | 404 | 409;
}

export interface LinkPlan {
	readonly ops: Record<string, unknown>[];
	readonly outcomes: LinkOutcome[];
	/** The record of who linked what, once the operations applied. */
	readonly linkedBy: Record<string, LinkAuthor>;
	readonly declined: string[];
	/** Field id to its further carriers, as the plan leaves them. */
	readonly alsoCarriedBy: Record<string, string[]>;
	/** Whether the record moved (a link made, taken back, or claimed by a person). */
	readonly recordChanged: boolean;
}

const refusal = (request: LinkRequest, status: 400 | 404 | 409, error: string): LinkOutcome => ({
	...request,
	ok: false,
	status,
	error
});

export function planLinks(
	projectId: string,
	draft: ProjectDataDraft,
	behaviour: DataBehaviour,
	requests: readonly LinkRequest[],
	author: LinkAuthor,
	lang: SpecLanguage = 'en'
): LinkPlan {
	const links = new Map(behaviour.links);
	let recordChanged = false;
	const alsoCarriedBy: Record<string, string[]> = Object.fromEntries(
		Object.entries(draft.rules?.alsoCarriedBy ?? {}).map(([fieldId, paths]) => [fieldId, [...paths]])
	);
	// A state carries one field at most, as its first carrier or a further one.
	const carrier = new Map<string, string>([
		...[...links].map(([fieldId, path]) => [path, fieldId] as const),
		...Object.entries(alsoCarriedBy).flatMap(([fieldId, paths]) => paths.map((path) => [path, fieldId] as const))
	]);
	const dropFurther = (fieldId: string, path?: string) => {
		const kept = path ? (alsoCarriedBy[fieldId] ?? []).filter((p) => p !== path) : [];
		for (const p of alsoCarriedBy[fieldId] ?? []) if (!kept.includes(p)) carrier.delete(p);
		if (kept.length > 0) alsoCarriedBy[fieldId] = kept;
		else delete alsoCarriedBy[fieldId];
		recordChanged = true;
	};
	const states = new Map<string, TieableState>(behaviour.states.map((s) => [s.path, s]));
	const linkedBy: Record<string, LinkAuthor> = { ...(draft.rules?.linkedBy ?? {}) };
	const declined = new Set(draft.rules?.declined ?? []);
	const ops: Record<string, unknown>[] = [];
	const outcomes: LinkOutcome[] = [];

	const unlinkOp = (path: string) => {
		const state = states.get(path);
		if (state?.registered) ops.push({ kind: 'link_state_variable', stateId: state.stateId, dataField: null });
	};

	requests.forEach((request, index) => {
		const field = draft.fields.find((f) => f.id === request.fieldId);
		if (!field) return outcomes.push(refusal(request, 404, 'That field is not in the data model.'));
		const previous = links.get(field.id);

		if (request.also && request.statePath === null) {
			if (alsoCarriedBy[field.id]) dropFurther(field.id);
			return outcomes.push({ ...request, ok: true });
		}

		if (request.statePath === null) {
			// The further carriers go with the field's link.
			if (alsoCarriedBy[field.id]) dropFurther(field.id);
			if (previous) {
				unlinkOp(previous);
				links.delete(field.id);
				carrier.delete(previous);
			}
			if (linkedBy[field.id]) {
				delete linkedBy[field.id];
				recordChanged = true;
			}
			// A person taking a link back is a decision Lyriks keeps.
			if (author === 'person' && !declined.has(field.id)) {
				declined.add(field.id);
				recordChanged = true;
			}
			return outcomes.push({ ...request, ok: true });
		}

		if (author !== 'person' && declined.has(field.id)) {
			return outcomes.push(refusal(request, 409, `A person unlinked "${field.name}": only a person links it again.`));
		}
		const state = states.get(request.statePath);
		if (!state) return outcomes.push(refusal(request, 404, `No feature declares the state "${request.statePath}".`));
		const wrong = incompatibility(field, state, lang);
		if (wrong) return outcomes.push(refusal(request, 400, wrong));
		const other = carrier.get(state.path);
		if (other && other !== field.id) {
			const name = draft.fields.find((f) => f.id === other)?.name ?? other;
			return outcomes.push(refusal(request, 409, `That state already carries the field "${name}"; unlink it first.`));
		}

		// A further carrier beside the first one, never written to the engine nor checked by the solver.
		if (request.also && previous) {
			if (previous !== state.path && !(alsoCarriedBy[field.id] ?? []).includes(state.path)) {
				alsoCarriedBy[field.id] = [...(alsoCarriedBy[field.id] ?? []), state.path];
				carrier.set(state.path, field.id);
				recordChanged = true;
			}
			return outcomes.push({ ...request, ok: true });
		}
		// A further carrier made the first one leaves the further ones.
		if ((alsoCarriedBy[field.id] ?? []).includes(state.path)) dropFurther(field.id, state.path);

		if (previous !== state.path) {
			if (previous) {
				unlinkOp(previous);
				carrier.delete(previous);
			}
			const address = dataFieldAddress(projectId, field.entityId, field.id);
			if (state.registered) {
				ops.push({ kind: 'link_state_variable', stateId: state.stateId, dataField: address });
			} else {
				const ref = `linked-${index}`;
				const registration = registrationOf(state, ref);
				if (!registration) {
					return outcomes.push(refusal(request, 409, `The state "${state.path}" has no surface to register it from.`));
				}
				ops.push(registration, { kind: 'link_state_variable', stateRef: ref, dataField: address });
			}
			links.set(field.id, state.path);
			carrier.set(state.path, field.id);
		}
		// Lyriks never takes a link over from someone who made it on purpose.
		if (previous !== state.path || author === 'person' || !linkedBy[field.id]) {
			if (linkedBy[field.id] !== author) recordChanged = true;
			linkedBy[field.id] = author;
		}
		if (author === 'person' && declined.delete(field.id)) recordChanged = true;
		outcomes.push({ ...request, ok: true });
	});

	return { ops, outcomes, linkedBy, declined: [...declined], alsoCarriedBy, recordChanged };
}

function registrationOf(state: TieableState, ref: string): Record<string, unknown> | null {
	if (!state.owner) return null;
	return {
		kind: 'add_state_variable',
		ref,
		path: state.path,
		type: state.type,
		defaultValue: state.defaultValue ?? null,
		description: state.description || `State at ${state.path}`,
		...(state.enumValues ? { enumValues: state.enumValues } : {}),
		owner: state.owner
	};
}
