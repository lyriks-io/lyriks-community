/**
 * Compact ("tool UI") field recipes — the single source for dense editor
 * controls (builder inspectors, toolbars, panels). One height, one radius,
 * one focus treatment, so dense UI reads as one system instead of dozens of
 * hand-rolled variants. Type floor: 12px controls, 11px labels/hints.
 */
export const inputXs =
	'rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-300';

export const selectXs =
	'rounded-field border border-line bg-surface px-1.5 py-1 text-xs text-ink-700 outline-none transition-colors focus:border-brand-300';

/** Uppercase micro-heading above a control or panel section. */
export const labelXs = 'text-[11px] font-semibold uppercase tracking-widest text-ink-400';

/** Helper caption under a control. AA contrast — never lighter than ink-400. */
export const hintXs = 'text-[11px] leading-snug text-ink-400';

/** Dashed "add something here" button (full-width row). */
export const addRowXs =
	'w-full rounded-field border border-dashed border-line py-1.5 text-xs font-semibold text-ink-400 transition-colors hover:border-brand-300 hover:text-brand-600';
