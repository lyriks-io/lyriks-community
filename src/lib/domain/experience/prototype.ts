/**
 * Step 05 — Experience Prototype Runner (Unspaghettit feature a51aed60).
 *
 * A designless, runnable prototype: low-fidelity auto-generatable elements laid
 * on screens, each bindable to ANYTHING addressable in the simulator (action /
 * state / event / surface / entity), with success/error handlers, played as a
 * clickable wireframe. Pure data + helpers — no UI, no persistence here.
 */
import type { Option } from '$domain/shared';

/** The designless HTML primitives the runner can auto-generate. */
export const PROTOTYPE_ELEMENT_KINDS = [
	{ code: 'text', label: 'Text' },
	{ code: 'input', label: 'Input' },
	{ code: 'button', label: 'Button' },
	{ code: 'link', label: 'Link' },
	{ code: 'list', label: 'List' },
	{ code: 'form', label: 'Form' },
	{ code: 'container', label: 'Container' }
] as const satisfies readonly Option[];
export type PrototypeElementKind = (typeof PROTOTYPE_ELEMENT_KINDS)[number]['code'];

/** Interactive kinds may trigger an action; the rest are display/layout only. */
export function isInteractiveKind(kind: PrototypeElementKind): boolean {
	return kind === 'button' || kind === 'input' || kind === 'form' || kind === 'link';
}

/** What an element binds to in the simulator (mirrors the Unspa feature's targetKind). */
export const BIND_TARGET_KINDS = [
	{ code: 'action', label: 'Action (trigger)' },
	{ code: 'state', label: 'State (display/input)' },
	{ code: 'event', label: 'Event (emit/observe)' },
	{ code: 'surface', label: 'Surface (navigate)' },
	{ code: 'entity', label: 'Entity (display data)' }
] as const satisfies readonly Option[];
export type BindTargetKind = (typeof BIND_TARGET_KINDS)[number]['code'];

/** What the prototype does on a bound element's success/error outcome. */
export const HANDLER_KINDS = [
	{ code: 'navigate', label: 'Navigate to screen' },
	{ code: 'message', label: 'Show message' }
] as const satisfies readonly Option[];
export type HandlerKind = (typeof HANDLER_KINDS)[number]['code'];

export interface PrototypeHandler {
	kind: HandlerKind;
	/** navigate → target screen id; message → the text to show. */
	value: string;
}

export interface PrototypeScreen {
	readonly id: string;
	name: string;
	order: number;
}

export interface PrototypeElement {
	readonly id: string;
	screenId: string;
	order: number;
	kind: PrototypeElementKind;
	label: string;
	/** Binding to a simulator target; null until bound. */
	bindTargetKind: BindTargetKind | null;
	/** The bound target's id/name (action/state/event/surface/entity). */
	bindTargetRef: string;
	onSuccess: PrototypeHandler | null;
	onError: PrototypeHandler | null;
}

/** Persisted content of the Prototype tab. */
export interface ExperiencePrototype {
	screens: PrototypeScreen[];
	elements: PrototypeElement[];
	/** Screen the run starts from (e.g. Authentication → Login). */
	entryScreenId: string | null;
}

export function emptyPrototype(): ExperiencePrototype {
	return { screens: [], elements: [], entryScreenId: null };
}

export function createPrototypeScreen(order: number, name = 'New screen'): PrototypeScreen {
	return { id: crypto.randomUUID(), name, order };
}

export function createPrototypeElement(
	screenId: string,
	order: number,
	kind: PrototypeElementKind
): PrototypeElement {
	return {
		id: crypto.randomUUID(),
		screenId,
		order,
		kind,
		label: '',
		bindTargetKind: null,
		bindTargetRef: '',
		onSuccess: null,
		onError: null
	};
}

/** Elements on a screen, in order. */
export function elementsOfScreen(
	p: ExperiencePrototype,
	screenId: string
): PrototypeElement[] {
	return p.elements.filter((e) => e.screenId === screenId).sort((a, b) => a.order - b.order);
}

/** The screen a run begins on: the explicit entry, else the first screen. */
export function entryScreen(p: ExperiencePrototype): PrototypeScreen | null {
	if (p.entryScreenId) {
		const found = p.screens.find((s) => s.id === p.entryScreenId);
		if (found) return found;
	}
	return [...p.screens].sort((a, b) => a.order - b.order)[0] ?? null;
}
