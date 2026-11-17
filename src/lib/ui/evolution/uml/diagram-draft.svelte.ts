import type { DiagramProblem } from '$domain/evolution';

/** How a kind of diagram is read from its notation, written back, and checked. */
export interface DiagramCodec<D> {
	readonly read: (text: string) => { diagram: D; problems: DiagramProblem[] };
	readonly write: (diagram: D) => string;
	readonly check: (diagram: D) => DiagramProblem[];
}

type Edited<D> = { kind: 'drawing'; diagram: D } | { kind: 'text'; text: string } | null;

/**
 * A diagram being edited on the page (ac-evo-func-uml-edit): the saved
 * notation, and what was edited since and not saved, either the diagram itself
 * when edited on the drawing (kept as typed, so a space at the end of a word
 * survives) or the notation when edited as text. Saving is the caller's: this
 * only says what would be saved and whether anything changed. While the reader
 * looks at an earlier version, that version is what is read and shown, and the
 * edits stay aside, untouched, for when they are back (ac-evo-hist-field-versions).
 */
export class DiagramDraft<D> {
	#edited = $state.raw<Edited<D>>(null);
	readonly reading: { diagram: D; problems: DiagramProblem[] };
	readonly notation: string;
	readonly dirty: boolean;
	readonly problems: DiagramProblem[];
	/** Lines the notation did not read are dropped by an edit on the drawing: worth saying while they show. */
	readonly dropsUnread: boolean;

	constructor(codec: DiagramCodec<D>, saved: () => string, looking: () => string | null = () => null) {
		this.reading = $derived.by(() => {
			const earlier = looking();
			if (earlier !== null) return codec.read(earlier);
			const edited = this.#edited;
			return edited?.kind === 'drawing' ? { diagram: edited.diagram, problems: [] as DiagramProblem[] } : codec.read(edited?.kind === 'text' ? edited.text : saved());
		});
		this.notation = $derived.by(() => {
			const earlier = looking();
			if (earlier !== null) return earlier;
			const edited = this.#edited;
			return edited?.kind === 'drawing' ? codec.write(edited.diagram) : edited?.kind === 'text' ? edited.text : saved();
		});
		this.dirty = $derived(looking() === null && this.#edited !== null && this.notation.trim() !== saved().trim());
		this.problems = $derived([...this.reading.problems, ...codec.check(this.reading.diagram)]);
		this.dropsUnread = $derived(this.reading.problems.length > 0 && this.#edited?.kind !== 'drawing');
	}

	get diagram(): D {
		return this.reading.diagram;
	}
	edit(change: (diagram: D) => D): void {
		this.#edited = { kind: 'drawing', diagram: change(this.diagram) };
	}
	editText(text: string): void {
		this.#edited = { kind: 'text', text };
	}
	discard(): void {
		this.#edited = null;
	}
}
