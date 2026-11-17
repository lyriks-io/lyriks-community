import { getContext, setContext } from 'svelte';
import { editModeStillOn, type KeptEditMode } from './edit-mode-memory';

/**
 * The Edit mode of the Specification 360°: a page reads clean, with no editing
 * control, until the reader turns Edit on (the button in the page's header,
 * or Ctrl/Cmd+E); then every text that can be changed is a field, held until
 * Save, which leaves it once every change is written, or until Stop editing
 * (Cancel editing once a change is held), Ctrl/Cmd+E
 * or Escape leaves it. It lasts across the pages of the Specification 360°
 * until it is turned off, and waits five minutes for who leaves them
 * (criterion 76d3a766). Validating and discussing are not editing: they
 * stay in view either way.
 */
export class EditMode {
	on = $state(false);

	constructor(
		private readonly allowed: () => boolean,
		private readonly memory?: EditModeMemory
	) {}

	/** Whether this reader can edit here at all: the Edit button shows only then. */
	get available(): boolean {
		return this.allowed();
	}

	/** Editing controls show only while Edit is on and the reader may edit. */
	get active(): boolean {
		return this.on && this.allowed();
	}

	set(next: boolean): void {
		this.on = next && this.allowed();
		if (this.on) this.memory?.keep(null);
		else this.memory?.forget();
	}

	/** Coming back to Knowledge: on again while it waits, and the time away stops counting. */
	resume(now: number): void {
		if (!this.memory || !editModeStillOn(this.memory.kept(), now)) return this.memory?.forget();
		this.set(true);
	}

	/** Leaving Knowledge: the mode starts waiting, from now. */
	leave(now: number): void {
		if (this.on) this.memory?.keep(now);
	}

	toggle(): void {
		this.set(!this.on);
	}

	/**
	 * The keys of the mode, for the window: Ctrl/Cmd+E turns it on and off,
	 * Escape turns it off when no field holds the focus (a field's own Escape
	 * cancels its editor first). Returns true when the key was taken.
	 */
	key(event: ModeKey): boolean {
		if (!this.allowed()) return false;
		if (event.key.toLowerCase() === 'e' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
			this.toggle();
			return true;
		}
		if (event.key === 'Escape' && this.on && !typingIn(event.target)) {
			this.set(false);
			return true;
		}
		return false;
	}
}

/** Where the mode is kept while the reader is away; the page wires the browser's. */
export interface EditModeMemory {
	kept(): KeptEditMode | null;
	keep(leftAt: number | null): void;
	forget(): void;
}

/** What the mode reads of a key press: a KeyboardEvent carries it. */
export type ModeKey = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'>;

/** A field or an editable text holds the focus: its own keys come first. */
function typingIn(target: EventTarget | null): boolean {
	const el = target as { tagName?: string; isContentEditable?: boolean } | null;
	return !!el && (el.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName ?? ''));
}

const KEY = Symbol('spec-edit-mode');
/** Outside the Specification 360° nothing provides it: every control reads as in Edit mode, as before it existed. */
const OUTSIDE = { on: true, available: false, active: true, set: () => {}, toggle: () => {}, key: () => false } as unknown as EditMode;

export function provideEditMode(mode: EditMode): EditMode {
	setContext(KEY, mode);
	return mode;
}

export function useEditMode(): EditMode {
	return getContext<EditMode | undefined>(KEY) ?? OUTSIDE;
}
