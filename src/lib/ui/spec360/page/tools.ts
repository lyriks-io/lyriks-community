/**
 * The page's tools at the right of its title, after the design: a tool is a
 * mono word or count on a thin underline (Edit, the comments), the page's
 * main action a filled blue pressable button (+ New evolution),
 * and Ask my AI the orange slanted button, which reads as an orange underlined
 * word when a main action stands beside it.
 */

/** A tool of the head: borderless, mono bold 11px, an ink underline under the pointer. */
export const TOOL =
	'inline-flex h-[30px] min-w-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-transparent bg-transparent px-1 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-ink uppercase no-underline hover:border-ink disabled:cursor-default disabled:opacity-40';
/** A tool that is on (Edit while the mode is on): blue ink on a blue underline. */
export const TOOL_ON = 'border-blue text-blue-ink hover:border-blue';
/** The page's main action (.ly-btn--fill): blue ink, paper text, the ink press shadow. */
export const PRIMARY =
	'pressable inline-flex h-9 cursor-pointer items-center justify-center gap-2 border-[1.5px] border-ink bg-blue-ink px-3.5 font-evo text-[0.6875rem] font-bold tracking-[0.07em] whitespace-nowrap text-paper uppercase no-underline hover:text-paper disabled:cursor-default disabled:opacity-40';
/** Ask my AI, alone or beside a main action (.ly-bevel): the outer button carries the drop shadow, BEVEL_FACE the slanted orange face, BEVEL_LABEL its upright label. */
export const BEVEL =
	'inline-flex cursor-pointer border-0 bg-transparent p-0 drop-shadow-[3px_3px_0_var(--color-ink)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:drop-shadow-[4px_4px_0_var(--color-ink)] active:translate-x-[3px] active:translate-y-[3px] active:drop-shadow-none disabled:cursor-default disabled:opacity-50';
export const BEVEL_FACE = 'inline-flex h-9 -skew-x-12 items-center gap-2 bg-orange px-[18px] text-ink';
export const BEVEL_LABEL = 'inline-flex skew-x-12 items-center gap-2 font-evo text-[0.6875rem] font-bold tracking-[0.07em] whitespace-nowrap uppercase';
