/**
 * The type and surfaces of the Specification 360° pages, one place for every
 * page: a page title, its lead, a section title and its intro, the mono
 * kicker, the sand block the bar rows sit in, the secondary and primary
 * buttons (the design's pressable buttons) and the quiet link.
 */

/** "SPECIFICATION 360°", "OUTSIDE SPECIFICATION 360° AND EVOLUTIONS". */
export const KICK = 'font-evo-mono text-xs font-medium tracking-[0.08em] text-evo-muted uppercase';
/** A mono label inside a card: "TODAY", "IN THE SPEC"; colour added by the caller. */
export const LABEL = 'font-evo-mono text-xs font-semibold tracking-[0.1em] uppercase';
export const H1 = 'm-0 mt-1.5 text-[2rem] leading-[1.2] font-bold tracking-[-0.03em] text-evo-ink max-[700px]:text-[1.625rem]';
export const LEAD = 'm-0 mt-3.5 text-[1.1875rem] leading-[1.55] text-evo-ink-2 max-[700px]:text-[1.0625rem]';
export const H2 = 'm-0 text-xl leading-[1.3] font-bold tracking-[-0.02em] text-evo-ink';
export const INTRO = 'm-0 mt-1.5 mb-4 text-[0.9375rem] text-evo-muted';
/** The sand block a list of rows sits in. */
export const LIST = 'overflow-hidden rounded-evo-card border border-evo-line bg-surface';
/** A plain sand block with its padding. */
export const CARD = 'rounded-evo-card border border-evo-line bg-surface px-[22px] py-5';
export const BTN =
	'pressable inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] border-evo-ink bg-transparent px-3 text-xs font-bold tracking-[0.07em] text-evo-ink uppercase no-underline disabled:cursor-default disabled:opacity-40';
export const BTN_MAIN =
	'pressable inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] border-evo-ink bg-evo-violet px-3 text-xs font-bold tracking-[0.07em] text-white uppercase no-underline hover:text-white disabled:cursor-default disabled:opacity-40';
export const LINK = 'inline-flex min-h-[34px] cursor-pointer items-center gap-1 border-0 bg-transparent px-1 text-[0.8125rem] font-semibold text-evo-ink underline decoration-[1.5px] underline-offset-[5px] hover:decoration-[3px]';
/** The design's mono meta line (.ly-meta): "v1.0 · code checked 19 h ago", "· Add or remove funds". */
export const META = 'font-evo-mono text-[0.8125rem] leading-snug text-evo-muted';
/** The design's tag (.ly-tag): square, a 1.5px border, mono bold uppercase; never a shadow. The tone adds its colours. */
export const TAG = 'inline-flex min-h-6 items-center gap-1.5 border-[1.5px] px-2 font-evo-mono text-xs font-bold tracking-[0.06em] uppercase';
export const TAG_VALID = `${TAG} border-green bg-green text-ink`;
export const TAG_INK = `${TAG} border-ink bg-ink text-paper`;
export const TAG_WATCH = `${TAG} border-orange bg-orange text-ink`;
/** The DRAFT of a specification not validated yet, outlined like the navigation's (criterion 14a1164c). */
export const TAG_DRAFT = `${TAG} border-orange text-orange-ink`;
/** A chapter still being shaped (criterion b0d81efd): a small violet outline after its name. */
export const TAG_BETA = 'inline-flex h-[18px] items-center border-[1.5px] border-violet px-1.5 font-evo-mono text-[0.625rem] font-bold tracking-[0.08em] text-violet-ink uppercase';
export const TAG_GAP = `${TAG} border-red-ink bg-red-ink text-paper`;
/** The design's severity mark (.ly-sev): a 10px square, red for a major point, orange for a minor one. */
export const SEV_MAJOR = 'inline-block size-2.5 flex-none bg-red';
export const SEV_MINOR = 'inline-block size-2.5 flex-none bg-orange';
/** The design's banner (.ly-banner): an orange tint with a 6px orange edge on the left. */
export const BANNER = 'border-l-[6px] border-orange bg-orange-tint';
/** A status settled without a colour of its own ("Rejected"): the design's neutral tag, a toner-2 chip on the block. */
export const STATUS = `${TAG} border-toner-2 bg-toner-2 text-ink-2`;
/** The design's category tags (.ly-tag--produit, --coherence, --business): a coloured border, the -ink text. */
export const TAG_BLUE = `${TAG} border-blue text-blue-ink`;
export const TAG_VIOLET = `${TAG} border-violet text-violet-ink`;
export const TAG_ORANGE = `${TAG} border-orange text-orange-ink`;
/** The plain tag: an ink border, ink text. */
export const TAG_LINE = `${TAG} border-ink text-ink`;
/**
 * The design's quiet action (.ly-quiet): the light action beside a filled one ("Reject", "Undo", "Cancel"),
 * an uppercase word on a thick underline. The caller's element keeps its height.
 */
export const QUIET = 'quiet inline-flex min-h-[34px] items-center px-0.5 text-evo-ink disabled:cursor-default';
/** The design's way back (.ly-back) and "show N more" (.ly-more): blue-ink, semibold. */
export const BACK = 'text-[0.8125rem] font-semibold text-blue-ink';
export const MORE = 'text-sm font-semibold text-blue-ink';
/** The design's filter chip (.ly-chip): a 1.5px line border on paper, 13px medium; on, an ink fill. */
export const CHIP = 'border-[1.5px] border-line bg-paper text-[0.8125rem] font-medium text-ink';
export const CHIP_ON = 'border-[1.5px] border-ink bg-ink text-[0.8125rem] font-medium text-paper';
/** A fact of a page as the design's chip (.chip2): mono 11px on toner, a thin line border, 22px tall ("SaaS", "6 users"). */
export const FACT = 'inline-flex h-[22px] items-center border border-line bg-toner px-[7px] font-evo-mono text-[0.6875rem] leading-none text-ink-2';
/** The design's key and value tile (.ly-kv): a small mono uppercase label over a bold value. */
export const KV_LABEL = 'font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase';
export const KV_VALUE = 'text-sm leading-[1.3] font-bold text-ink';
/** The big number heading a review (.ly-review > header strong). */
export const BIG = 'text-[2.75rem] leading-[0.9] font-bold tracking-[-0.04em] tabular-nums';
/** The legend under a segmented bar (.ly-legend): mono 12px, its 10px squares added by the caller. */
export const LEGEND = 'font-evo-mono text-xs text-ink-2';
/** A point of a review (.ly-point .t): bold 15px. */
export const POINT = 'text-[0.9375rem] leading-[1.35] font-bold';
/** The design's avatar (.ly-avatar): a toner-2 square, ink mono bold initials. */
export const AVATAR = 'inline-flex flex-none items-center justify-center bg-toner-2 font-evo-mono text-xs font-bold text-ink';
/** A module of the architecture (.ly-module): toner with a 4px blue top. */
export const MODULE = 'border-t-4 border-blue bg-surface';
/** A menu or a popover: paper, a 1.5px ink border, the floating shadow. */
export const POP = 'border-[1.5px] border-ink bg-paper shadow-pop';
/** The design's dialog (.ly-dialog): paper, a 2px ink border. */
export const DIALOG = 'border-2 border-ink bg-paper shadow-pop';
/** The design's count bubble (.ly-count): an orange square, ink mono bold. */
export const COUNT = 'inline-flex h-5 min-w-5 items-center justify-center bg-orange px-1 font-evo-mono text-xs font-bold text-ink';
/**
 * The design's button (.ly-btn) without its size, for a control that keeps its own height and padding: square, a
 * 1.5px ink border, a bold uppercase label, the press shadow. PRESS_LINE is the secondary, PRESS_FILL the primary.
 */
const PRESS = 'pressable cursor-pointer border-[1.5px] border-ink font-bold tracking-[0.07em] uppercase disabled:cursor-default disabled:opacity-40';
export const PRESS_LINE = `${PRESS} bg-transparent text-ink`;
export const PRESS_FILL = `${PRESS} bg-evo-violet text-white hover:text-white`;
/** The design's field (.ly-input): a toner-1 fill, a 1.5px ink-3 border, blue on focus. */
export const FIELD = 'border-[1.5px] border-ink-3 bg-toner-1 text-ink outline-none placeholder:text-ink-3 focus:border-blue';
/** The design's waiting mark (.ly-wait): an 8px orange square beside a mono line. */
export const WAIT = 'inline-flex items-center gap-1.5 font-evo-mono text-xs text-ink-3';
export const WAIT_MARK = 'inline-block size-2 flex-none animate-lk-pulse bg-orange';
