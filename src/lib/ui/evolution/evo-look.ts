/**
 * The fixed rules of the Evolution design, as the classes every block of the
 * request page composes: one card, one kicker, two button sizes, the green band
 * that says what comes next, the violet band that guides. Kept in one place so
 * no block drifts from the design.
 */

/**
 * A card, the design's section (.ly-section): a sand block, square, 24px of padding, no rule around it. Its fill
 * comes from its state: sand at rest (REST), paper with a 2px ink frame while it is edited (EDITING). Validated, it
 * wears the 6px green edge on its left, drawn inside the box so nothing in it moves.
 */
export const CARD = 'flex flex-col gap-4 rounded-evo-card border border-transparent p-6 transition-[background-color,box-shadow] duration-300';
export const REST = 'bg-surface';
export const cardBorder = (validated: boolean) => (validated ? 'shadow-[inset_6px_0_0_var(--color-green)]' : '');
/** The frame a card wears while it is edited: paper inside a 2px ink border (drawn as a ring, so nothing moves). */
export const EDITING = 'bg-evo-page ring-2 ring-evo-ink';

/** The design's tag (.ly-tag): square, a 1.5px border, mono bold uppercase, never a shadow. The tone adds its colours. */
export const TAG = 'inline-flex items-center gap-1.5 border-[1.5px] font-evo-mono font-bold tracking-[0.06em] uppercase';
/** The tones of a tag: categories outline in their hue, a state fills. */
export const TAG_TONE = {
	blue: 'border-blue bg-transparent text-blue-ink',
	violet: 'border-violet bg-transparent text-violet-ink',
	orange: 'border-orange bg-transparent text-orange-ink',
	red: 'border-red bg-transparent text-red-ink',
	neutral: 'border-line bg-transparent text-ink-3',
	ink: 'border-ink bg-ink text-paper',
	valid: 'border-green bg-green text-ink',
	gap: 'border-red-ink bg-red-ink text-paper',
	watch: 'border-orange bg-orange text-ink'
} as const;

/** The design's count (.ly-count): an orange square, its number in ink mono bold. */
export const COUNT = 'bg-orange font-evo-mono font-bold text-ink';

/** The design's avatar (.ly-avatar): a square, toner-2, ink mono initials; dashed while the person is waited on. */
export const AVATAR = 'bg-toner-2 font-evo-mono font-bold text-ink';
export const AVATAR_OK = 'border-green bg-green font-evo-mono font-bold text-ink';
export const AVATAR_PENDING = 'border-dashed border-ink-3 bg-transparent font-evo-mono font-bold text-ink-3';

/** The design's light action (.ly-quiet): an uppercase word on a thick underline, beside a filled button. */
export const QUIET = 'quiet inline-flex items-center gap-1.5 px-0.5 text-evo-ink';

/** The design's icon button (.ly-icon--light): square, a 1.5px rule border (its icon colour is the caller's); on, it fills with ink. */
export const ICON_BTN = 'border-[1.5px] border-line hover:border-ink';
export const ICON_BTN_ON = 'border-[1.5px] border-ink bg-ink text-paper';

/** A kicker, the design's label (.ly-label): mono, 12px, uppercase, spaced, ink-3. */
export const KICKER = 'font-evo-mono text-xs tracking-[0.08em] text-evo-muted uppercase';

/** A section title (h3), the design's section heading: 20px bold, drawn tight; the first word capitalised, never a question. */
export const SECTION_TITLE = 'text-xl leading-[1.2] font-bold tracking-[-0.02em] text-evo-ink';

/** The number of a section, "step.section", in a square mono plate, green once validated. */
export const numberPill = (validated: boolean) =>
	`flex h-7 min-w-7 flex-none items-center justify-center px-[7px] font-evo-mono text-xs font-bold ${validated ? 'bg-evo-green-stroke text-evo-ink' : 'bg-evo-page text-evo-ink'}`;

/**
 * The buttons: 48px at the foot of a page (compact once in the app's foot,
 * app.css #app-foot), 44px inside a block. The design's button: square, a
 * 1.5px ink border, a bold uppercase label, the hard press shadow. One primary
 * per bar, always last, filled blue; the secondary is the same button unfilled;
 * a primary that is not the next best action is greyed, flat, but stays clickable.
 */
const BUTTON = 'inline-flex items-center justify-center gap-1.5 rounded-evo-btn border-[1.5px] font-evo text-xs tracking-[0.07em] uppercase whitespace-nowrap disabled:cursor-default disabled:opacity-40';
/** The shared compact review button; navigation and workflow actions keep their own size. */
export const REVIEW_BUTTON = `${BUTTON} h-7 px-3 border-evo-ink bg-transparent font-bold text-evo-ink`;
export const PRIMARY_48 = `${BUTTON} pressable min-h-12 px-5 border-evo-ink bg-evo-violet font-bold text-white`;
export const SECONDARY_48 = `${BUTTON} pressable min-h-12 px-5 border-evo-ink bg-transparent font-bold text-evo-ink`;
export const GREYED_48 = `${BUTTON} min-h-12 px-5 border-evo-grey bg-evo-grey font-bold text-evo-ink-3`;
export const PRIMARY_44 = `${BUTTON} pressable min-h-11 px-[18px] border-evo-ink bg-evo-violet font-bold text-white`;
export const SECONDARY_44 = `${BUTTON} pressable min-h-11 px-[18px] border-evo-ink bg-transparent font-bold text-evo-ink`;
export const GREYED_44 = `${BUTTON} min-h-11 px-[18px] border-evo-grey bg-evo-grey font-bold text-evo-ink-3`;
/** The primary of a bar, filled once it is the next best action, greyed before. */
export const primary48 = (next: boolean) => (next ? PRIMARY_48 : GREYED_48);
export const primary44 = (next: boolean) => (next ? PRIMARY_44 : GREYED_44);

/** The bar at the foot of a step or a page: right-aligned, never a rule above it. */
export const FOOT_BAR = 'flex flex-wrap items-center justify-end gap-2.5';

/** "What comes next": the design's banner in green (.ly-banner), a 6px green edge, the primary 44px on the right. */
export const NEXT_BAND = 'flex flex-wrap items-center justify-between gap-2.5 rounded-evo-btn border-l-[6px] border-green bg-green-tint px-3.5 py-3 animate-lk-in';
export const NEXT_BAND_TEXT = 'text-[0.9375rem] leading-[1.2] font-bold text-evo-ink';

/** The banner in the action colour that says what a section waits for: blue-tint, a 6px blue edge. */
export const GUIDE_BAND = 'flex items-center gap-2.5 rounded-evo-btn border-l-[6px] border-blue bg-blue-tint px-3.5 py-2.5 text-[0.8125rem] leading-[1.4] text-evo-ink-2';
export const GUIDE_DOT = 'size-2 flex-none bg-blue';

/** A chip naming what the change does to an element. */
export const CHANGE_CHIP: Record<'add' | 'amend' | 'remove' | 'rejected', { readonly word: string; readonly look: string }> = {
	add: { word: 'NEW', look: `${TAG} ${TAG_TONE.blue}` },
	amend: { word: 'MODIFIED', look: `${TAG} ${TAG_TONE.orange}` },
	remove: { word: 'REMOVED', look: `${TAG} ${TAG_TONE.red}` },
	rejected: { word: 'REJECTED', look: `${TAG} ${TAG_TONE.neutral}` }
};

/** The editors of a section: a text, a row of a list, its delete, the dashed button that adds a row. */
/** The field of the design (.ly-input): toner-1, a 1.5px ink-3 border that turns blue on focus. */
export const TEXTAREA = 'w-full resize-y rounded-lg border-[1.5px] border-evo-control bg-evo-sunken px-3 py-2.5 leading-normal text-evo-ink focus:border-blue focus:outline-none';
export const ROW_INPUT = 'min-h-10 min-w-0 rounded-md border-[1.5px] border-evo-control bg-evo-sunken px-2.5 text-sm text-evo-ink focus:border-blue focus:outline-none';
export const ROW = 'flex flex-wrap items-center gap-2 rounded-lg border border-transparent bg-evo-sunken px-2 py-1.5';
export const ROW_DELETE = 'size-10 flex-none rounded-lg border-[1.5px] border-line bg-transparent text-lg text-ink hover:border-ink';
export const ADD_ROW = 'min-h-10 self-start rounded-lg border-[1.5px] border-dashed border-ink-3 bg-transparent px-3.5 text-xs font-bold tracking-[0.07em] text-evo-ink uppercase hover:border-ink';
/** A value the AI proposes, waiting on a person: the LLM's voice, dashed violet on its tint, its badge, Accept and Reject. */
export const SUGGESTED = 'border-[1.5px] border-dashed border-violet bg-violet-tint';
export const LLM_BADGE = 'bg-violet-ink px-[7px] py-0.5 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-paper';
