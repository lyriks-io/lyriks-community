import { describe, expect, it } from 'vitest';
import type { RuleVerdict, RuleVerdictKind, RuleVerdictTone } from '$application/analysis/rule-verdicts';
import { verdictMark } from './verdict-mark';

// Draft feat-rules-edge-cases of request eeda5853: a verdict reads as one icon.

const mark = (kind: RuleVerdictKind, tone: RuleVerdictTone) =>
	verdictMark({ kind, label: kind, tone, flaw: tone === 'danger' } satisfies RuleVerdict);
const CHECK = mark('no-flaw', 'success').glyph;

describe('verdictMark', () => {
	it('draws a green check only for what the solver proved or found no flaw in', () => {
		expect(mark('proved', 'success')).toMatchObject({ glyph: CHECK, seal: expect.stringContaining('success') });
		expect(mark('no-flaw', 'success').seal).toContain('success');
	});

	it('draws a grey check for a rule that only holds within the bound, never the mark of a proof', () => {
		const bounded = mark('holds-within-bound', 'neutral');
		expect(bounded.glyph).toEqual(CHECK);
		expect(bounded.seal).not.toContain('success');
	});

	it('draws a red alert for a flaw and an amber triangle for a warning', () => {
		expect(mark('broken', 'danger')).toMatchObject({ shape: 'circle', seal: expect.stringContaining('danger') });
		expect(mark('hidden', 'warning')).toMatchObject({ shape: 'triangle', seal: expect.stringContaining('warning') });
	});

	it('draws neither a check nor a colour for what the solver left open', () => {
		for (const kind of ['not-settled', 'out-of-reach', 'not-read', 'redundant'] as const) {
			const open = mark(kind, 'neutral');
			expect(open.glyph).not.toEqual(CHECK);
			expect(open.seal).not.toMatch(/success|danger|warning/);
		}
	});
});
