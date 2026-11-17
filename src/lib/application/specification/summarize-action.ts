import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { statesRead } from '$lib/unspa-schema/requirement-sentences';

/**
 * Read-only fold of one action of the canonical kernel into what its details
 * panel lists: what it takes, what it reads and writes, what it emits, where it
 * leads and what proves it. Pure and framework-free: it only walks the persisted
 * snapshot. Rules and invariants are not folded here; they already reach the
 * page as EARS sentences (`index-feature-rules`).
 */
export interface ActionOverview {
	id: string;
	name: string;
	intent: string;
	surfaceId: string;
	surfaceName: string;
	parameters: { id: string; name: string; type: string; required: boolean }[];
	/** State paths the action needs or its rules test, deduplicated. */
	reads: string[];
	/** State paths its effects change, deduplicated. */
	writes: string[];
	/** Events it emits, deduplicated. */
	events: string[];
	/** Screens it leads to: the target's id, and its name when the feature knows it. */
	transitions: { surfaceId: string; name: string }[];
	scenarios: { id: string; name: string; expected: string }[];
}

type Raw = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

const WRITING_EFFECTS = new Set([
	'set_state',
	'append_to_list',
	'remove_from_list',
	'update_list_item'
]);

function transitionTarget(entry: unknown): string {
	const t = obj(entry);
	return str(t.toSurface) || str(t.target) || str(t.to) || str(t.targetRef);
}

export function summarizeAction(
	snapshot: UnspaFeatureSnapshot | null,
	actionId: string
): ActionOverview | null {
	const surfaces = arr(obj(snapshot?.feature).surfaces).map(obj);
	const surfaceNames = new Map(surfaces.map((s) => [str(s.id), str(s.name) || str(s.id)]));
	for (const surface of surfaces) {
		const action = arr(surface.actions).map(obj).find((a) => str(a.id) === actionId);
		if (!action) continue;

		const reads = new Set<string>(arr(action.requiredStates).map(str).filter(Boolean));
		for (const rule of arr(action.rules)) {
			for (const path of statesRead(obj(rule).condition)) reads.add(path);
		}

		const writes = new Set<string>();
		const events = new Set<string>(arr(action.emittedEvents).map(str).filter(Boolean));
		const targets = new Set<string>(arr(action.transitions).map(transitionTarget).filter(Boolean));
		for (const effectRaw of arr(action.effects)) {
			const effect = obj(effectRaw);
			const type = str(effect.type);
			if (WRITING_EFFECTS.has(type) && str(effect.path)) writes.add(str(effect.path));
			if (type === 'emit_event' && str(effect.event)) events.add(str(effect.event));
			if (type.includes('transition') || type === 'navigate') {
				const target = transitionTarget(effect);
				if (target) targets.add(target);
			}
		}

		return {
			id: actionId,
			name: str(action.name) || actionId,
			intent: str(action.intent),
			surfaceId: str(surface.id),
			surfaceName: str(surface.name) || str(surface.id),
			parameters: arr(action.parameters)
				.map(obj)
				.map((p) => ({
					id: str(p.id),
					name: str(p.name),
					type: str(p.type),
					required: p.required === true
				}))
				.filter((p) => p.name),
			reads: [...reads],
			writes: [...writes],
			events: [...events],
			transitions: [...targets].map((t) => ({ surfaceId: t, name: surfaceNames.get(t) ?? t })),
			scenarios: arr(action.scenarios)
				.map(obj)
				.map((s) => ({ id: str(s.id), name: str(s.name), expected: str(s.expectedStatus) || 'success' }))
				.filter((s) => s.name)
		};
	}
	return null;
}
