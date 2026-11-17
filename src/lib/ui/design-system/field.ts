/**
 * Form field recipe: the one look every form input shares (text, textarea,
 * select, combo, multi-select, tag input). The design's field (.ly-input): a
 * light sand fill (toner-1, lighter than the block it sits on), one ink border,
 * square, one height. Every field wears the same fill: two fills side by side
 * would read as two states (read-only and editable) where there is only one, so
 * an empty field the spec still needs says so with its border alone.
 */
export const fieldBase =
	'w-full rounded-field border-[1.5px] bg-surface-sunken text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-500';

/** Height of a single-line field; a multi-line one grows from it. */
export const fieldHeight = 'h-12';

export const fieldBorder = 'border-ink-500 hover:border-ink-900 focus:border-brand-400';

/** An empty field the spec still needs: amber border, never an amber fill. */
export const fieldBorderEmpty = 'border-warning-300 hover:border-warning-400 focus:border-brand-400';

export const fieldBorderInvalid = 'border-danger-500';

/** Square button beside a field (add, back to the list), at the field's height. */
export const fieldSideButton =
	'grid size-12 shrink-0 place-items-center rounded-field border-[1.5px] border-ink-500 bg-surface-sunken text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-900';

/**
 * Compact ("tool UI") field recipes — the single source for dense editor
 * controls (builder inspectors, toolbars, panels). One height, one radius,
 * one focus treatment, so dense UI reads as one system instead of dozens of
 * hand-rolled variants. Type floor: 12px controls, 11px labels/hints.
 */
export const inputXs =
	'rounded-field border border-ink-500 bg-surface-sunken px-2 py-1 text-xs text-ink-700 outline-none transition-colors placeholder:text-ink-500 focus:border-brand-400';

export const selectXs =
	'rounded-field border border-ink-500 bg-surface-sunken px-1.5 py-1 text-xs text-ink-700 outline-none transition-colors focus:border-brand-400';

/** Uppercase micro-heading above a control or panel section. */
export const labelXs = 'font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-400';

/** Helper caption under a control. AA contrast — never lighter than ink-400. */
export const hintXs = 'text-[0.6875rem] leading-snug text-ink-400';

/** Dashed "add something here" button (full-width row). */
export const addRowXs =
	'w-full rounded-field border border-dashed border-line py-1.5 text-xs font-semibold text-ink-400 transition-colors hover:border-brand-300 hover:text-brand-600';
