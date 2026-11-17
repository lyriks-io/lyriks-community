import { describe, expect, it } from 'vitest';
import { PROTECTED_BASELINE_REFUSAL, UNCAPTURED_BASELINE_REFUSAL, applyBaselineEdits } from './edits';
import type { Baseline } from './draft';

const captured = (id: string, createdAt: string): Baseline => ({ id, name: id, note: '', createdAt, readiness: 40, coherence: 80, featureCount: 3, content: `# ${id}` });
const stored = [captured('b2', '2026-11-02T00:00:00.000Z'), captured('b1', '2026-11-01T00:00:00.000Z')];

describe('a write of the list of baselines [criterion:c346a116]', () => {
	it('takes only names and notes, the snapshot staying as captured', () => {
		const sent = stored.map((b) => ({ ...b, name: `${b.id} renamed`, note: 'Signed', readiness: 100, createdAt: '2030-01-01T00:00:00.000Z', content: 'rewritten' }));
		const outcome = applyBaselineEdits(stored, sent, new Set());
		expect(outcome).toMatchObject({ ok: true, snapshotIgnored: true });
		if (!outcome.ok) return;
		expect(outcome.baselines[0]).toEqual({ ...stored[0], name: 'b2 renamed', note: 'Signed' });
	});

	it('deletes a baseline the list leaves out, and says nothing was ignored when nothing was', () => {
		expect(applyBaselineEdits(stored, [stored[0]], new Set())).toEqual({ ok: true, baselines: [stored[0]], snapshotIgnored: false });
	});

	it('refuses a baseline nobody captured', () => {
		expect(applyBaselineEdits(stored, [...stored, captured('forged', '2026-11-03T00:00:00.000Z')], new Set())).toEqual({ ok: false, reason: UNCAPTURED_BASELINE_REFUSAL });
	});

	it('refuses to delete the baseline a validation stands on [criterion:40d632f9]', () => {
		expect(applyBaselineEdits(stored, [stored[0]], new Set(['b1']))).toEqual({ ok: false, reason: PROTECTED_BASELINE_REFUSAL });
	});
});
