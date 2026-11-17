import type { RuleVerdict } from '$application/analysis/rule-verdicts';

/** How a verdict is drawn on a rule line: a small seal carrying one glyph. */
export interface VerdictMark {
	/** A disc, or a triangle for a warning. */
	readonly shape: 'circle' | 'triangle';
	/** Fill and outline of the seal. */
	readonly seal: string;
	/** Colour of the glyph on the seal. */
	readonly ink: string;
	/** The glyph, as stroke paths on a 24-unit grid. */
	readonly glyph: readonly string[];
	/** Colour of the verdict's words on its card. */
	readonly text: string;
}

const CHECK = ['M7 12.4l3.3 3.3 6.7-7'];
const BANG = ['M12 7v6.2', 'M12 17h.01'];
const INFO = ['M12 11v6', 'M12 7.4h.01'];
const QUESTION = ['M9.4 9.4a2.7 2.7 0 015.2 1c0 1.8-2.6 2.1-2.6 3.8', 'M12 17.6h.01'];

const GREY = {
	shape: 'circle',
	seal: 'fill-surface-sunken stroke-ink-300',
	ink: 'stroke-ink-500',
	text: 'text-ink-700'
} as const;

/** Seals in a status colour, with a white glyph on them. Literal class names,
 *  so the stylesheet build finds them. */
const FILLED = {
	success: { seal: 'fill-success-500 stroke-success-500', text: 'text-success-600' },
	danger: { seal: 'fill-danger-500 stroke-danger-500', text: 'text-danger-600' },
	warning: { seal: 'fill-warning-500 stroke-warning-500', text: 'text-warning-600' }
} as const;
const filled = (
	shape: VerdictMark['shape'],
	tone: keyof typeof FILLED,
	glyph: readonly string[]
): VerdictMark => ({ shape, ...FILLED[tone], ink: 'stroke-white', glyph });

/**
 * One mark per verdict (draft feat-rules-edge-cases of request eeda5853): a
 * check that is green only when the solver proved the rule or found no flaw,
 * grey when it only held within the bound searched; a red alert for a flaw, an
 * amber triangle for a warning; grey info for a rule repeating a validation,
 * a grey question for what the solver left open.
 */
export function verdictMark(verdict: RuleVerdict): VerdictMark {
	switch (verdict.tone) {
		case 'success':
			return filled('circle', 'success', CHECK);
		case 'danger':
			return filled('circle', 'danger', BANG);
		case 'warning':
			return filled('triangle', 'warning', BANG);
	}
	if (verdict.kind === 'holds-within-bound') return { ...GREY, glyph: CHECK };
	if (verdict.kind === 'redundant') return { ...GREY, glyph: INFO };
	return { ...GREY, glyph: QUESTION };
}
