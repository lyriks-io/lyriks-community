import type { DockingQualification, ImplementationVerdict } from '$domain/evolution';
import type { IconName } from '$ui/design-system/Icon.svelte';

/**
 * ONE colour law for everything an Evolution request shows: the path, the
 * impact report, the implementation report, the findings, the remarks. Five
 * tones, each always with its icon and its word, never the colour alone
 * (ac-evo-dock-7, ac-evo-impl-colour):
 *
 *   ok      green  it holds: fits, conform, validated
 *   decide  amber  a person decides: rubs, non-conform, out of scope, to validate
 *   blocks  red    it stops the request: collides, regression
 *   todo    blue   not there yet: missing, to build, nothing to attach to
 *   before  grey   the product already carried it before this request: shown, never a gate
 *
 * Violet stays the colour of acting (buttons, links, the step one stands on),
 * so a reader never mistakes something to click for something to fix.
 */
export type Tone = 'ok' | 'decide' | 'blocks' | 'todo' | 'before';

export interface ToneLook {
	readonly icon: IconName;
	/** Text and icon colour. */
	readonly text: string;
	/** Row: the left rule on white, never a tinted background (ac-evo-form-colours). */
	readonly row: string;
	/** The left rule alone, on a card that stays white (ac-evo-form-question-state). */
	readonly edge: string;
	/** A count badge or a pill: the colours of the design's tag (.ly-tag), the shape is the caller's. */
	readonly badge: string;
	/** A headline box: the left rule on white, like a row. */
	readonly box: string;
	/** A small dot, for the legend and the path. */
	readonly dot: string;
}

export const TONE: Record<Tone, ToneLook> = {
	ok: {
		icon: 'check',
		text: 'text-success-700',
		row: 'border-l-success-500 bg-surface',
		edge: 'border-l-success-500',
		badge: 'bg-green text-ink border-green',
		box: 'border-line border-l-success-500 bg-surface',
		dot: 'bg-success-500'
	},
	decide: {
		icon: 'alert-triangle',
		text: 'text-warning-700',
		row: 'border-l-warning-500 bg-surface',
		edge: 'border-l-warning-500',
		badge: 'bg-orange text-ink border-orange',
		box: 'border-line border-l-warning-500 bg-surface',
		dot: 'bg-warning-500'
	},
	blocks: {
		icon: 'circle-alert',
		text: 'text-danger-700',
		row: 'border-l-danger-500 bg-surface',
		edge: 'border-l-danger-500',
		badge: 'bg-red-ink text-paper border-red-ink',
		box: 'border-line border-l-danger-500 bg-surface',
		dot: 'bg-danger-500'
	},
	todo: {
		// A clock, never a dashed circle: "not there yet" must not read as loading.
		icon: 'clock',
		text: 'text-info-700',
		row: 'border-l-info-500 bg-surface',
		edge: 'border-l-info-500',
		badge: 'bg-transparent text-blue-ink border-blue',
		box: 'border-line border-l-info-500 bg-surface',
		dot: 'bg-info-500'
	},
	before: {
		icon: 'history',
		text: 'text-ink-500',
		row: 'border-l-ink-300 bg-surface',
		edge: 'border-l-ink-300',
		badge: 'bg-toner-2 text-ink-2 border-toner-2',
		box: 'border-line border-l-ink-300 bg-surface',
		dot: 'bg-ink-300'
	}
};

/** The legend every report shares, in the order a reader scans for trouble. */
export const LEGEND: readonly { tone: Tone; label: string }[] = [
	{ tone: 'blocks', label: 'Blocks' },
	{ tone: 'decide', label: 'To decide' },
	{ tone: 'todo', label: 'Not there yet' },
	{ tone: 'ok', label: 'Holds' },
	{ tone: 'before', label: 'Already there before' }
];

export interface VerdictLook extends ToneLook {
	readonly tone: Tone;
	readonly label: string;
}

const look = (tone: Tone, label: string, icon?: IconName): VerdictLook => ({
	...TONE[tone],
	...(icon ? { icon } : {}),
	tone,
	label
});

export const DOCKING_LOOK: Record<DockingQualification, VerdictLook> = {
	collision: look('blocks', 'Collides'),
	friction: look('decide', 'Rubs'),
	missing_anchor: look('todo', 'Nothing to attach to', 'link'),
	fits: look('ok', 'Fits')
};

export const VERDICT_LOOK: Record<ImplementationVerdict, VerdictLook> = {
	regression: look('blocks', 'Regression'),
	non_conform: look('decide', 'Non-conform'),
	out_of_scope: look('decide', 'Out of scope', 'bolt'),
	missing: look('todo', 'To build'),
	conform: look('ok', 'Conform')
};

/** Worst first: the order both reports list their buckets in. */
export const VERDICT_ORDER: readonly ImplementationVerdict[] = ['regression', 'non_conform', 'out_of_scope', 'missing', 'conform'];
export const DOCKING_ORDER: readonly DockingQualification[] = ['collision', 'friction', 'missing_anchor', 'fits'];

/** What a person decided on a report line, in words. */
export const DECISION_LABEL: Record<string, string> = {
	validated: 'Validated',
	invalidated: 'Sent back',
	adopted: 'Adopted into the spec',
	removed: 'Removed from the code'
};
